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
  await scr().findByText('Welcome to Cards');
  fireEvent.press(scr().getByText('Get started'));
  await scr().findByText('Trivia Night');
}

test('first launch seeds the examples and closes back to the note', async () => {
  const m = load();
  await openApp(m);
  expect(scr().getByText('Examples')).toBeTruthy();
  expect(m.store.getLibrary().decks).toHaveLength(4);
  fireEvent.press(scr().getByText('Close ✕'));
  await waitFor(() => expect(m.sdk.PluginManager.closePluginView).toHaveBeenCalled());
  // The library was written to the plugin's private folder, never to shared storage.
  const written = m.RNFS.writeFile.mock.calls.map((c: any[]) => c[0]);
  expect(written.length).toBeGreaterThan(0);
  expect(written.every((p: string) => p.startsWith('/plugin/data/'))).toBe(true);
});

test('full-screen study: tap middle to reveal, right side rates Good, left side undoes', async () => {
  const m = load();
  await openApp(m);
  fireEvent.press(scr().getByText('Trivia Night'));
  const total = m.store.getLibrary().cards.filter(c => c.deckId === m.store.getLibrary().decks.find(d => d.name === 'Trivia Night')!.id).length;
  fireEvent.press(scr().getByText(`Study · ${total}`));
  fireEvent.press(await scr().findByText('Okay')); // first-session tips
  await scr().findByText(`${total} left`);

  const reviewed = () => m.store.getLibrary().cards.filter(c => c.review.reps > 0);
  const zone = () => scr().getByText(`${total - reviewed().length} left`).parent!;
  expect(zone()).toBeTruthy();

  // The card area is the first Pressable under the full-screen view; press it at x positions.
  const press = (x: number) => {
    const target = scr().UNSAFE_root.findAll((n: any) => n.props?.onPress && n.props?.style?.flex === 1)[0];
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
  const [front, back] = scr().getAllByPlaceholderText(/Question or term|Answer/);
  fireEvent.changeText(front, 'Capital of Peru');
  fireEvent.changeText(back, 'Lima');
  fireEvent.press(scr().getByText('Save card'));
  await waitFor(() => expect(m.store.getLibrary().cards.some(c => c.front === 'Capital of Peru' && c.back === 'Lima')).toBe(true));
});

test('"Make card" from a lasso opens the editor with the recognised text', async () => {
  const m = load();
  await openApp(m);
  act(() => {
    m.router.setPanelIntent({kind: 'newCardFromLasso', front: 'Mitochondria', back: 'Powerhouse of the cell', note: 'Check the recognised text before saving.'});
  });
  await scr().findByText('New card');
  expect(scr().getByDisplayValue('Mitochondria')).toBeTruthy();
  expect(scr().getByDisplayValue('Powerhouse of the cell')).toBeTruthy();
  expect(scr().getByText('Check the recognised text before saving.')).toBeTruthy();
});

test('import a folder from the device, then export it', async () => {
  const m = load();
  const dir = (name: string, path: string) => ({name, path, isDirectory: () => true, isFile: () => false, size: 0});
  const file = (name: string, path: string) => ({name, path, isDirectory: () => false, isFile: () => true, size: 10});
  m.RNFS.readDir.mockImplementation(async (p: string) => {
    if (p === '/storage/emulated/0/Document') return [dir('Biology', '/storage/emulated/0/Document/Biology')];
    if (p === '/storage/emulated/0/Document/Biology')
      return [file('Cells.txt', '/d/Cells.txt'), file('notes.pdf', '/d/notes.pdf'), dir('Plants', '/d/Plants')];
    if (p === '/d/Plants') return [file('Leaves.csv', '/d/Plants/Leaves.csv')];
    return [];
  });
  m.RNFS.readFile.mockImplementation(async (p: string) =>
    p.endsWith('Cells.txt') ? 'Nucleus :: Holds DNA\nRibosome :: Makes protein\nbad line' : 'Front,Back\nchlorophyll,green pigment',
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
  const paths = m.RNFS.writeFile.mock.calls.map((c: any[]) => c[0]).filter((p: string) => p.startsWith('/storage'));
  expect(paths.some((p: string) => /EXPORT\/Cards \d{4}-\d\d-\d\d\/Plants\/Leaves\.txt$/.test(p))).toBe(true);
});
