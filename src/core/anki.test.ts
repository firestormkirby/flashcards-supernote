import {ankiExport, ankiFieldToText, isAnkiText, parseAnki} from './anki';
import {importFiles} from './library';
import {EMPTY_LIBRARY} from './model';
import {deckNamedAfter} from '../ui/CardEditor';

// The Android app's own fixture (CoreLogicTest.kt, Cards 1.0.4–1.0.6): the
// same file must give the same cards in both apps.
const ANKI_NEW = [
  '#separator:tab',
  '#html:true',
  '#guid column:1',
  '#notetype column:2',
  '#deck column:3',
  '#tags column:6',
  'g1\tBasic\tBar::Evidence\tHearsay?\tAn <b>out-of-court</b> statement<br>offered for its truth&nbsp;&amp; more\ttag1',
  'g2\tBasic (and reversed card)\tSpanish\tgato\tcat\t',
  'g3\tCloze\tBar::Evidence\t{{c1::Erie}} applies {{c2::state::which law?}} substantive law\tBack extra here\t',
  'g4\tBasic\tSpanish\t"Line one<div>line ""two""</div>"\t"multi\nline"\t',
  'g5\tBasic\tSpanish\t<img src="x.png">\tpicture\t',
].join('\n');

test('Anki exports are recognised, with or without a header', () => {
  expect(isAnkiText('export.txt', ANKI_NEW)).toBe(true);
  const old = 'gato\tcat\tanimals\nperro\t"dog" (pet)\t\n';
  expect(isAnkiText('Spanish.txt', old)).toBe(true);
  expect(parseAnki('Spanish.txt', old).decks).toEqual([
    {
      path: ['Spanish'],
      cards: [
        ['gato', 'cat'],
        ['perro', '"dog" (pet)'],
      ],
    },
  ]);
  // Flashcards' own formats are not Anki.
  expect(
    isAnkiText(
      'x.txt',
      'Photosynthesis :: Turning light into food\nQ: a\nA: b',
    ),
  ).toBe(false);
  expect(isAnkiText('x.csv', ANKI_NEW)).toBe(false);
});

test('subdecks, HTML, cloze per blank, reversed cards and quoting (as on Android)', () => {
  const ak = parseAnki('export.txt', ANKI_NEW);
  const evidence = ak.decks.find(d => d.path.join('/') === 'Bar/Evidence')!;
  const spanish = ak.decks.find(d => d.path.join('/') === 'Spanish')!;
  expect(evidence.cards).toEqual([
    ['Hearsay?', 'An **out-of-court** statement\noffered for its truth & more'],
    [
      '[…] applies state substantive law',
      'Erie applies state substantive law\nBack extra here',
    ],
    [
      'Erie applies [which law?] substantive law',
      'Erie applies state substantive law\nBack extra here',
    ],
  ]);
  expect(spanish.cards).toEqual([
    ['gato', 'cat'],
    ['cat', 'gato'],
    ['Line one\nline "two"', 'multi\nline'],
  ]);
  expect(ak.warnings).toHaveLength(2);
  expect(ak.warnings.some(w => w.includes('1 image'))).toBe(true);
});

test('bold and italics come across as markers', () => {
  expect(
    ankiFieldToText('A <b>key</b> word and <i>emphasis </i>here', true),
  ).toBe('A **key** word and *emphasis* here');
  expect(ankiFieldToText('<ul><li>one</li><li>two</li></ul>', true)).toBe(
    '• one\n\n• two',
  );
});

test('import: subdecks become folders under the file, and re-import keeps progress', () => {
  const [lib] = importFiles(EMPTY_LIBRARY, [
    {path: 'Downloads/export.txt', content: ANKI_NEW},
  ]);
  expect(new Set(lib.folders.map(f => f.name))).toEqual(
    new Set(['Downloads', 'Bar']),
  );
  expect(new Set(lib.decks.map(d => d.name))).toEqual(
    new Set(['Evidence', 'Spanish']),
  );
  expect(lib.cards).toHaveLength(6);

  const studied = lib.cards.find(c => c.front === 'gato')!;
  const withProgress = {
    ...lib,
    cards: lib.cards.map(c =>
      c.id === studied.id ? {...c, review: {...c.review, reps: 3}} : c,
    ),
  };
  const [again] = importFiles(withProgress, [
    {
      path: 'Downloads/export.txt',
      content: ANKI_NEW.replace('\tcat\t', '\tcat (feline)\t'),
    },
  ]);
  const card = again.cards.find(c => c.front === 'gato')!;
  expect(card.id).toBe(studied.id);
  expect(card.back).toBe('cat (feline)');
  expect(card.review.reps).toBe(3);
});

test('export: folders become ::, ids are GUIDs, bold is <b>, and it imports back the same', () => {
  const [lib] = importFiles(EMPTY_LIBRARY, [
    {path: 'Spanish/Verbs.txt', content: 'hablar :: to speak\ncomer :: to eat'},
    {
      path: 'Notes.txt',
      content: 'Q: Two lines\nhere\nA: a **"quoted"** *answer* & more\n',
    },
  ]);
  const withPicture = {
    ...lib,
    cards: [
      ...lib.cards,
      {
        ...lib.cards[0],
        id: 'pic',
        front: '',
        frontImage: {file: 'page-1.png', width: 10, height: 10},
      },
    ],
  };
  const {text, exported, skipped} = ankiExport(withPicture);
  expect(exported).toBe(3);
  expect(skipped).toBe(1);
  const lines = text.trim().split('\n');
  expect(lines.slice(0, 5)).toEqual([
    '#separator:tab',
    '#html:true',
    '#guid column:1',
    '#notetype column:2',
    '#deck column:3',
  ]);
  const hablar = lib.cards.find(c => c.front === 'hablar')!;
  expect(lines).toContain(
    `${hablar.id}\tBasic\tSpanish::Verbs\thablar\tto speak`,
  );
  expect(text).toContain('"a <b>""quoted""</b> <i>answer</i> &amp; more"');

  const {decks} = parseAnki('x.txt', text);
  expect(decks).toEqual([
    {
      path: ['Spanish', 'Verbs'],
      cards: [
        ['hablar', 'to speak'],
        ['comer', 'to eat'],
      ],
    },
    {
      path: ['Notes'],
      cards: [['Two lines\nhere', 'a **"quoted"** *answer* & more']],
    },
  ]);
});

test('a deck named like the note, or its folder, is suggested', () => {
  const [lib] = importFiles(EMPTY_LIBRARY, [
    {path: 'School/Biology.txt', content: 'a :: b'},
    {path: 'Spanish.txt', content: 'c :: d'},
  ]);
  const id = (name: string) => lib.decks.find(d => d.name === name)!.id;
  const NOTE = '/storage/emulated/0/Note';
  expect(deckNamedAfter(lib, `${NOTE}/biology.note`)).toBe(id('Biology'));
  expect(deckNamedAfter(lib, `${NOTE}/Spanish/Week 3.note`)).toBe(
    id('Spanish'),
  );
  expect(deckNamedAfter(lib, `${NOTE}/Journal.note`)).toBeNull();
});
