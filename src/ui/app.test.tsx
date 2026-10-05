/**
 * Renders the real panel and drives it the way a user would. The SDK and the
 * filesystem are mocked; everything else (stores, screens, scheduling) is the
 * shipping code.
 */
import type * as RTL from '@testing-library/react-native';

jest.mock('sn-plugin-lib', () => ({
  PluginManager: {
    registerButtonListener: jest.fn(),
    showPluginView: jest.fn(async () => true),
    closePluginView: jest.fn(async () => true),
    hasPermission: jest.fn(async () => 1),
    requestPermission: jest.fn(async () => 2),
  },
  NativePluginManager: {getPluginDirPath: jest.fn(async () => '/plugin/data')},
  PluginCommAPI: {},
  PluginFileAPI: {},
}));

type Mods = {
  React: typeof import('react');
  rtl: typeof RTL;
  App: typeof import('../../App').default;
  store: typeof import('../storage/libraryStore');
  router: typeof import('../sdk/router');
  RNFS: any;
  sdk: any;
};

/** Fresh module instances per test, so each starts as a first launch. */
function load(): Mods {
  jest.resetModules();
  return {
    // The renderer must come from the same fresh registry as the app, or there are two Reacts.
    React: require('react'),
    rtl: require('@testing-library/react-native/pure'),
    App: require('../../App').default,
    store: require('../storage/libraryStore'),
    router: require('../sdk/router'),
    RNFS: require('react-native-fs').default,
    sdk: require('sn-plugin-lib'),
  };
}

let current: Mods | null = null;
afterEach(() => {
  current?.rtl.cleanup();
  current = null;
});

let act: typeof RTL.act;
let fireEvent: typeof RTL.fireEvent;
let waitFor: typeof RTL.waitFor;
/** RNTL's `screen` is replaced on every render, so it is read fresh each time. */
const scr = () => current!.rtl.screen;

async function openApp(m: Mods) {
  current = m;
  ({act, fireEvent, waitFor} = m.rtl);
  m.rtl.render(m.React.createElement(m.App));
  await scr().findByText('Welcome to Flashcards');
  fireEvent.press(scr().getByText('Get started'));
  await scr().findByText('Trivia Night');
}

test('first launch seeds the examples and closes back to the note', async () => {
  const m = load();
  await openApp(m);
  expect(scr().getByText('Examples')).toBeTruthy();
  expect(m.store.getLibrary().decks).toHaveLength(4);
  fireEvent.press(scr().getByText('Close ✕'));
  await waitFor(() =>
    expect(m.sdk.PluginManager.closePluginView).toHaveBeenCalled(),
  );
  // The library was written to the plugin's private folder, never to shared storage.
  const written = m.RNFS.writeFile.mock.calls.map((c: any[]) => c[0]);
  expect(written.length).toBeGreaterThan(0);
  expect(written.every((p: string) => p.startsWith('/plugin/data/'))).toBe(
    true,
  );
});

test('full-screen study: tap middle to reveal, right side rates Good, left side undoes', async () => {
  const m = load();
  await openApp(m);
  fireEvent.press(scr().getByText('Trivia Night'));
  const total = m.store
    .getLibrary()
    .cards.filter(
      c =>
        c.deckId ===
        m.store.getLibrary().decks.find(d => d.name === 'Trivia Night')!.id,
    ).length;
  fireEvent.press(scr().getByText(`Study · ${total}`));
  fireEvent.press(await scr().findByText('Okay')); // first-session tips
  await scr().findByText(`${total} left`);

  const reviewed = () =>
    m.store.getLibrary().cards.filter(c => c.review.reps > 0);
  const zone = () =>
    scr().getByText(`${total - reviewed().length} left`).parent!;
  expect(zone()).toBeTruthy();

  // The card area is the first Pressable under the full-screen view; press it at x positions.
  const press = (x: number) => {
    const target = scr().UNSAFE_root.findAll(
      (n: any) => n.props?.onPress && n.props?.style?.flex === 1,
    )[0];
    fireEvent(target, 'press', {nativeEvent: {pageX: x}});
  };
  press(375); // middle of the 750-wide test window
  expect(reviewed()).toHaveLength(0);
  press(700); // right side after revealing = Good
  await waitFor(() => expect(reviewed()).toHaveLength(1));
  expect(reviewed()[0].review.due).toBeGreaterThan(Date.now() + 2 * 86_400_000);
  await scr().findByText(`${total - 1} left`);
  press(20); // left side = previous card, which takes the rating back
  await waitFor(() => expect(reviewed()).toHaveLength(0));
  await scr().findByText(`${total} left`);
});

test('regular view: show answer, rate with interval hints, star, finish', async () => {
  const m = load();
  await openApp(m);
  fireEvent.press(scr().getByText('Examples'));
  fireEvent.press(await scr().findByText('Spanish Basics'));
  fireEvent.press(scr().getByText('Shuffle')); // off, so the order is the file's
  fireEvent.press(scr().getByText(/^Study · /));
  fireEvent.press(await scr().findByText('Okay'));
  fireEvent.press(await scr().findByText('Regular view'));
  fireEvent.press(await scr().findByText('Show answer'));
  expect(scr().getByText('10m')).toBeTruthy(); // Again
  expect(scr().getByText('4d')).toBeTruthy(); // Good, for a new card
  fireEvent.press(scr().getByLabelText('Star'));
  fireEvent.press(scr().getByText('Easy'));
  const lib = m.store.getLibrary();
  expect(lib.cards.filter(c => c.starred)).toHaveLength(1);
  expect(lib.cards.filter(c => c.review.reps === 1)).toHaveLength(1);
});

test('+ New › Card: choose a deck, write, save', async () => {
  const m = load();
  await openApp(m);
  fireEvent.press(scr().getByText('+ New'));
  fireEvent.press(await scr().findByText('Card'));
  fireEvent.press(await scr().findByText('Choose a deck'));
  fireEvent.press(await scr().findByText('Trivia Night'));
  const [front, back] = scr().getAllByPlaceholderText(
    /Question or term|Answer/,
  );
  fireEvent.changeText(front, 'Capital of Peru');
  fireEvent.changeText(back, 'Lima');
  fireEvent.press(scr().getByText('Save card'));
  await waitFor(() =>
    expect(
      m.store
        .getLibrary()
        .cards.some(c => c.front === 'Capital of Peru' && c.back === 'Lima'),
    ).toBe(true),
  );
});

test('"Make card" from a lasso opens the editor with the recognised text', async () => {
  const m = load();
  await openApp(m);
  act(() => {
    m.router.setPanelIntent({
      kind: 'newCardDraft',
      front: 'Mitochondria',
      back: 'Powerhouse of the cell',
      note: 'Check the recognised text before saving.',
    });
  });
  await scr().findByText('New card');
  expect(scr().getByDisplayValue('Mitochondria')).toBeTruthy();
  expect(scr().getByDisplayValue('Powerhouse of the cell')).toBeTruthy();
  expect(
    scr().getByText('Check the recognised text before saving.'),
  ).toBeTruthy();
});

test('import a folder from the device, then export it', async () => {
  const m = load();
  const dir = (name: string, path: string) => ({
    name,
    path,
    isDirectory: () => true,
    isFile: () => false,
    size: 0,
  });
  const file = (name: string, path: string) => ({
    name,
    path,
    isDirectory: () => false,
    isFile: () => true,
    size: 10,
  });
  m.RNFS.readDir.mockImplementation(async (p: string) => {
    if (p === '/storage/emulated/0/Document')
      return [dir('Biology', '/storage/emulated/0/Document/Biology')];
    if (p === '/storage/emulated/0/Document/Biology')
      return [
        file('Cells.txt', '/d/Cells.txt'),
        file('notes.pdf', '/d/notes.pdf'),
        dir('Plants', '/d/Plants'),
      ];
    if (p === '/d/Plants') return [file('Leaves.csv', '/d/Plants/Leaves.csv')];
    return [];
  });
  m.RNFS.readFile.mockImplementation(async (p: string) =>
    p.endsWith('Cells.txt')
      ? 'Nucleus :: Holds DNA\nRibosome :: Makes protein\nbad line'
      : 'Front,Back\nchlorophyll,green pigment',
  );
  await openApp(m);
  fireEvent.press(scr().getByText('Import'));
  fireEvent.press(await scr().findByText('Choose files or a folder'));
  fireEvent.press(await scr().findByText('Document'));
  fireEvent.press(await scr().findByText('Biology'));
  await scr().findByText('Cells.txt');
  expect(scr().queryByText('notes.pdf')).toBeNull();
  fireEvent.press(scr().getByText('Import this folder'));
  await scr().findByText('Imported');
  expect(scr().getByText(/2 decks, 3 cards/)).toBeTruthy();
  expect(scr().getByText(/bad line/)).toBeTruthy(); // the skipped line is reported
  const lib = m.store.getLibrary();
  expect(lib.folders.map(f => f.name)).toContain('Plants'); // sub-folder became a folder
  expect(lib.folders.map(f => f.name)).not.toContain('Biology'); // the chosen folder itself did not

  m.RNFS.exists.mockImplementation(async () => false);
  fireEvent.press(scr().getByText('Import more'));
  fireEvent.press(scr().getByText('←'));
  fireEvent.press(scr().getByText('←'));
  fireEvent.press(scr().getByText('✕'));
  fireEvent.press(await scr().findByText(/^Export all cards/));
  await scr().findByText('Exported');
  const paths = m.RNFS.writeFile.mock.calls
    .map((c: any[]) => c[0])
    .filter((p: string) => p.startsWith('/storage'));
  expect(
    paths.some((p: string) =>
      /EXPORT\/Flashcards \d{4}-\d\d-\d\d\/Plants\/Leaves\.txt$/.test(p),
    ),
  ).toBe(true);
});

test('a selection from a PDF opens as a draft, and Swap sides flips it', async () => {
  const m = load();
  await openApp(m);
  act(() => {
    m.router.setPanelIntent({
      kind: 'newCardDraft',
      front: 'the powerhouse of the cell',
      back: '',
      note: 'Made from the selected text.',
    });
  });
  await scr().findByText('New card');
  fireEvent.press(scr().getByText('Swap sides'));
  expect(scr().getByDisplayValue('the powerhouse of the cell')).toBeTruthy();
  const [front, back] = scr().getAllByPlaceholderText(
    /Question or term|Answer/,
  );
  expect(front.props.value).toBe('');
  expect(back.props.value).toBe('the powerhouse of the cell');
  fireEvent.changeText(front, 'Mitochondria');
  fireEvent.press(scr().getByText('Choose a deck'));
  fireEvent.press(await scr().findByText('Trivia Night'));
  fireEvent.press(scr().getByText('Save card'));
  await waitFor(() =>
    expect(
      m.store
        .getLibrary()
        .cards.some(
          c =>
            c.front === 'Mitochondria' &&
            c.back === 'the powerhouse of the cell',
        ),
    ).toBe(true),
  );
});

test('lasso picture: the picture is the front, a typed answer is enough to save', async () => {
  const m = load();
  await openApp(m);
  act(() => {
    m.router.setPanelIntent({
      kind: 'newCardDraft',
      front: '',
      back: '',
      frontImage: {file: 'lasso-1.png', width: 300, height: 150},
      note: 'The picture is on the front.',
    });
  });
  await scr().findByText('New card');
  expect(scr().getByLabelText('Picture')).toBeTruthy();
  const [, back] = scr().getAllByPlaceholderText(/Question or term|Answer/);
  fireEvent.changeText(back, 'Mitochondria');
  fireEvent.press(scr().getByText('Choose a deck'));
  fireEvent.press(await scr().findByText('Trivia Night'));
  fireEvent.press(scr().getByText('Save card'));
  await waitFor(() => {
    const card = m.store
      .getLibrary()
      .cards.find(c => c.back === 'Mitochondria');
    expect(card?.front).toBe('');
    expect(card?.frontImage).toEqual({
      file: 'lasso-1.png',
      width: 300,
      height: 150,
    });
  });
});

test('page picture: mark an area with two taps, it lands on a new card, and shows while studying', async () => {
  const m = load();
  await openApp(m);
  act(() => {
    m.router.setPanelIntent({
      kind: 'cropPicture',
      image: {file: 'page-1.png', width: 1000, height: 1400},
    });
  });
  await scr().findByText('Picture for a new card');
  // Give the picture area a size (there is no layout pass under Jest): 500×700 → scale 0.5.
  fireEvent(scr().getByTestId('crop-area'), 'layout', {
    nativeEvent: {layout: {width: 516, height: 716}},
  });
  const pic = await scr().findByLabelText('Picture to mark');
  fireEvent.press(pic, {nativeEvent: {locationX: 50, locationY: 100}});
  expect(scr().getByText('Now tap the opposite corner.')).toBeTruthy();
  fireEvent.press(pic, {nativeEvent: {locationX: 250, locationY: 200}});
  fireEvent.press(scr().getByText('Use this area'));

  await scr().findByText('New card');
  const [, back] = scr().getAllByPlaceholderText(/Question or term|Answer/);
  fireEvent.changeText(back, 'The Krebs cycle');
  fireEvent.press(scr().getByText('Choose a deck'));
  fireEvent.press(await scr().findByText('Trivia Night'));
  fireEvent.press(scr().getByText('Save card'));
  let saved: any;
  await waitFor(() => {
    saved = m.store.getLibrary().cards.find(c => c.back === 'The Krebs cycle');
    // Taps at (50,100) and (250,200) on a half-size view = (100,200)–(500,400) in the page image.
    expect(saved?.frontImage).toEqual({
      file: 'page-1.png',
      width: 1000,
      height: 1400,
      crop: {x: 100, y: 200, width: 400, height: 200},
    });
  });

  fireEvent.press(await scr().findByText('Home'));
  fireEvent.press(await scr().findByText('Trivia Night'));

  // Practise the deck, jump to that card, and the picture is what's on screen.
  fireEvent.press(await scr().findByText(/^Practice · /));
  fireEvent.press(await scr().findByText('Okay')); // first-session tips
  fireEvent.press(await scr().findByText('Regular view'));
  fireEvent.press(scr().getByLabelText('Go to a card'));
  // A picture-only front is listed as "Picture".
  fireEvent.press(await scr().findByText('Picture'));
  expect(await scr().findByLabelText('Picture')).toBeTruthy();
  expect(scr().queryByText('The Krebs cycle')).toBeNull(); // answer still hidden
  fireEvent.press(scr().getByText('Show answer'));
  expect(scr().getByText('The Krebs cycle')).toBeTruthy();
});

test('deck chooser: make a new deck right there, and the next card starts in it', async () => {
  const m = load();
  await openApp(m);
  fireEvent.press(scr().getByText('+ New'));
  fireEvent.press(await scr().findByText('Card'));
  fireEvent.press(await scr().findByText('Choose a deck'));
  // Examples is a folder: a new deck is made in the folder you are looking at.
  fireEvent.press(await scr().findByText('Examples'));
  fireEvent.press(await scr().findByText('New deck'));
  fireEvent.changeText(scr().getByDisplayValue(''), 'Biology');
  fireEvent.press(scr().getByText('Create'));
  // Back in the editor, with the new deck chosen.
  await scr().findByText('New card');
  expect(scr().getByText('Biology')).toBeTruthy();
  const biology = m.store.getLibrary().decks.find(d => d.name === 'Biology')!;
  const examples = m.store
    .getLibrary()
    .folders.find(f => f.name === 'Examples')!;
  expect(biology.folderId).toBe(examples.id);

  const [front, back] = scr().getAllByPlaceholderText(
    /Question or term|Answer/,
  );
  fireEvent.changeText(front, 'Mitosis');
  fireEvent.changeText(back, 'Cell division');
  fireEvent.press(scr().getByText('Save card'));

  // A card from the toolbar (no deck of its own) goes where the last one went.
  act(() => {
    m.router.setPanelIntent({
      kind: 'newCardDraft',
      front: 'Osmosis',
      back: '',
      note: 'Made from the selected text.',
    });
  });
  await scr().findByText('New card');
  expect(scr().getByText('Biology')).toBeTruthy();
  expect(scr().queryByText('Choose a deck')).toBeNull();
  // …and the chooser shows that deck inverted, as the current one.
  fireEvent.press(scr().getByText('Biology'));
  const currentRow = await scr().findByText('Current deck');
  // Light text on a dark row (light theme: white on black).
  const {StyleSheet} = require('react-native');
  const colorOf = (el: any) => StyleSheet.flatten(el.props.style).color;
  expect(colorOf(currentRow)).toBe('#FFFFFF');
  expect(colorOf(scr().getByText('Biology'))).toBe('#FFFFFF');
});

test('a remembered deck that was deleted is not used', async () => {
  const m = load();
  await openApp(m);
  const settings = require('../storage/settingsStore');
  act(() => {
    settings.updateSettings((s: any) => ({...s, lastDeckId: 'gone'}));
    m.router.setPanelIntent({kind: 'newCardDraft', front: 'Q', back: 'A'});
  });
  await scr().findByText('New card');
  expect(scr().getByText('Choose a deck')).toBeTruthy();
});

test('picture for the back from a page: the editor waits, Picture card fills it in', async () => {
  const m = load();
  await openApp(m);
  act(() => {
    m.router.setPanelIntent({
      kind: 'newCardDraft',
      front: 'Label the heart',
      back: '',
    });
  });
  await scr().findByText('New card');
  const adds = scr().getAllByLabelText('Add a picture');
  fireEvent.press(adds[1]); // the back's
  fireEvent.press(await scr().findByText('From a page (Picture card)'));
  // The panel closes so the page can be reached.
  await waitFor(() =>
    expect(m.sdk.PluginManager.closePluginView).toHaveBeenCalled(),
  );
  expect(scr().getByText('Waiting for a picture for the back')).toBeTruthy();

  // Tapping Picture card captures the page (in index.js) and hands it over.
  const waiter = m.router.takePictureWaiter();
  expect(waiter).toBeTruthy();
  act(() =>
    waiter!({image: {file: 'page-9.png', width: 1000, height: 1400}}, 'page'),
  );
  await scr().findByText('Picture for the back');
  fireEvent.press(scr().getByText('Use whole picture'));
  await scr().findByText('New card');
  expect(scr().queryByText('Waiting for a picture for the back')).toBeNull();
  expect(scr().getAllByLabelText('Picture')).toHaveLength(1);

  // The front can now come from that same page.
  fireEvent.press(scr().getByLabelText('Add a picture'));
  expect(await scr().findByText('From the same page as the back')).toBeTruthy();
});

test('a card that stops waiting gives Picture card back to new cards', async () => {
  const m = load();
  await openApp(m);
  act(() => {
    m.router.setPanelIntent({kind: 'newCardDraft', front: 'Q', back: ''});
  });
  await scr().findByText('New card');
  fireEvent.press(scr().getAllByLabelText('Add a picture')[1]);
  fireEvent.press(await scr().findByText('From a page (Picture card)'));
  fireEvent.press(await scr().findByText('Cancel'));
  expect(m.router.takePictureWaiter()).toBeNull();
});
