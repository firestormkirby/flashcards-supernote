/**
 * Port of Cards' CoreLogicTest.kt. The checks and fixtures are the original
 * ones, so a pass here means the TypeScript behaves like the Android app.
 * The zip checks became checks on exportFiles(), which writes the same paths.
 */
import * as fs from 'fs';
import * as path from 'path';
import {decodeLibrary, encodeLibrary} from './codec';
import {formatDeck, parseDeck, readCsv} from './deckParser';
import {Fsrs, Rating, formatInterval} from './fsrs';
import * as L from './library';
import {DAY_MS, EMPTY_LIBRARY, LibraryData, MINUTE_MS, isNew} from './model';

const NOW = 1_700_000_000_000;

const HEARSAY = [
  '# Hearsay exceptions',
  '// a note',
  'Excited utterance :: Statement relating to a startling event made under the stress of excitement',
  '- Present sense impression :: Describes an event while perceiving it',
  'Dying declaration\tStatement by declarant believing death imminent',
  '',
  'Q: What are the elements of',
  '   a dying declaration?',
  'A: 1. Declarant believed death imminent',
  '   2. Concerns cause of death',
  'Q: Missing answer here',
  '',
  'A: orphan answer',
  'just some random line',
  'Business records :: Rule 803(6)',
].join('\n');

/** Seeded PRNG so shuffle tests are deterministic. */
/* eslint-disable no-bitwise */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const imp = (
  lib: LibraryData,
  files: L.IncomingFile[],
  opts?: {mirror?: boolean; appendOnly?: boolean},
) => L.importFiles(lib, files, opts);

describe('parser', () => {
  const r = parseDeck('Hearsay.md', HEARSAY);

  test('text formats', () => {
    expect(r.cards).toHaveLength(5);
    expect(r.cards[1][0]).toBe('Present sense impression');
    expect(r.cards[2][1].startsWith('Statement by declarant')).toBe(true);
    expect(r.cards[3][0]).toBe(
      'What are the elements of\na dying declaration?',
    );
    expect(r.cards[3][1].endsWith('2. Concerns cause of death')).toBe(true);
    expect(r.warnings).toHaveLength(3);
  });

  test('csv', () => {
    const rc = parseDeck(
      'Spanish.csv',
      'Front;Back\nhola;hello\n"adiós; chau";"goodbye\nbye"\nsolo;\n',
    );
    expect(rc.cards).toEqual([
      ['hola', 'hello'],
      ['adiós; chau', 'goodbye\nbye'],
    ]);
    expect(rc.warnings).toHaveLength(1);
    const rc2 = parseDeck('x.csv', '﻿cat,gato\r\ndog,perro\r\n');
    expect(rc2.cards).toEqual([
      ['cat', 'gato'],
      ['dog', 'perro'],
    ]);
    expect(readCsv('a,"b""c"', ',')).toEqual([['a', 'b"c']]);
  });

  test('format round-trips', () => {
    expect(parseDeck('x.txt', formatDeck(r.cards)).cards).toEqual(r.cards);
  });

  test('examples from the Import page', () => {
    const ex1 = parseDeck(
      'a.txt',
      'Photosynthesis :: Turning light into food\n- Mitosis :: Cell division\nOsmosis :: Water crossing a membrane',
    );
    expect(ex1.cards).toHaveLength(3);
    expect(ex1.warnings).toHaveLength(0);
    expect(ex1.cards[1][0]).toBe('Mitosis');
    const ex2 = parseDeck(
      'a.txt',
      'Q: What are the three\nbranches of government?\nA: Legislative, executive\nand judicial.',
    );
    expect(ex2.cards).toHaveLength(1);
    expect(ex2.warnings).toHaveLength(0);
    expect(parseDeck('a.csv', 'Front,Back\ngato,cat\nperro,dog').cards).toEqual(
      [
        ['gato', 'cat'],
        ['perro', 'dog'],
      ],
    );
    expect(parseDeck('a.txt', 'Q :: front is Q').cards).toEqual([
      ['Q', 'front is Q'],
    ]);
  });

  test('bundled example decks parse cleanly', () => {
    const root = path.join(__dirname, '../../assets/examples');
    const walk = (dir: string): string[] =>
      fs
        .readdirSync(dir, {withFileTypes: true})
        .flatMap(e =>
          e.isDirectory()
            ? walk(path.join(dir, e.name))
            : [path.join(dir, e.name)],
        );
    const files = walk(root);
    expect(files.length).toBe(4);
    for (const f of files) {
      const res = parseDeck(path.basename(f), fs.readFileSync(f, 'utf8'));
      expect(res.cards.length).toBeGreaterThan(0);
      expect(res.warnings).toEqual([]);
    }
  });
});

describe('import / merge', () => {
  const files: L.IncomingFile[] = [
    {path: 'Law/Evidence/Hearsay.md', content: HEARSAY},
    {
      path: 'Law/Crim Pro.txt',
      content:
        'Miranda :: custodial interrogation warnings\nTerry stop :: reasonable suspicion',
    },
    {path: 'Spanish.csv', content: 'hola,hello\ngato,cat'},
    {path: '.DS_Store', content: 'junk'},
    {path: 'Law/notes.pdf', content: 'junk'},
  ];
  const fsrs = new Fsrs();

  test('full flow', () => {
    let [lib, rep] = imp(EMPTY_LIBRARY, files);
    expect(lib.decks).toHaveLength(3);
    expect(lib.folders).toHaveLength(2);
    expect(new Set(lib.decks.map(d => L.deckPath(lib, d)))).toEqual(
      new Set(['Law/Evidence/Hearsay', 'Law/Crim Pro', 'Spanish']),
    );
    expect(rep.filesIgnored).toHaveLength(2);
    const law = lib.folders.find(f => f.name === 'Law')!;
    expect(L.decksUnder(lib, law.id)).toHaveLength(2);
    expect(L.childFolders(lib, null).map(f => f.name)).toEqual(['Law']);

    // Review a card, then re-import an edited file: progress must survive.
    const miranda = lib.cards.find(c => c.front === 'Miranda')!;
    lib = L.setReview(
      lib,
      miranda.id,
      fsrs.next(miranda.review, Rating.Good, NOW),
    );
    const [lib2, rep2] = imp(lib, [
      {
        path: 'law/crim pro.txt',
        content:
          'miranda :: Warnings before custodial interrogation\nKatz :: reasonable expectation of privacy',
      },
    ]);
    const m2 = lib2.cards.find(c => c.front === 'miranda')!;
    expect(m2.id).toBe(miranda.id);
    expect(m2.review.reps).toBe(1);
    expect([rep2.cardsRemoved, rep2.cardsAdded, rep2.cardsChanged]).toEqual([
      1, 1, 1,
    ]);
    expect(lib2.folders).toHaveLength(2);
    expect(lib2.decks).toHaveLength(3);

    const [lib3] = imp(
      lib2,
      [{path: 'Law/Crim Pro.txt', content: 'Gideon :: right to counsel'}],
      {appendOnly: true},
    );
    expect(
      L.cardsOf(lib3, lib3.decks.find(d => d.name === 'Crim Pro')!.id),
    ).toHaveLength(3);

    const [lib4] = imp(lib3, [{path: 'Spanish.csv', content: 'hola,hello'}], {
      mirror: true,
    });
    expect(lib4.decks).toHaveLength(1);
    expect(lib4.folders).toHaveLength(0);

    // Queue + counts on lib2
    const ids = new Set(lib2.decks.map(d => d.id));
    const c = L.counts(lib2, ids, NOW + 10 * DAY_MS);
    expect(c.due).toBe(1);
    expect(c.new).toBe(c.total - 1);
    const q = L.studyQueue(lib2, ids, NOW + 10 * DAY_MS, 3);
    expect(q).toHaveLength(4);
    expect(q[0].front).toBe('miranda');

    // Codec
    expect(decodeLibrary(encodeLibrary(lib2))).toEqual(lib2);

    // Export paths match the Android app's zip entries (minus its "Cards/" root).
    expect(new Set(L.exportFiles(lib2).map(f => f.path))).toEqual(
      new Set(['Law/Evidence/Hearsay.txt', 'Law/Crim Pro.txt', 'Spanish.txt']),
    );
    expect(L.importSummary(rep)).toContain('3 decks');
  });

  test('append keeps order', () => {
    const [la] = imp(EMPTY_LIBRARY, [
      {path: 'D.txt', content: 'a :: 1\nb :: 2\nc :: 3'},
    ]);
    const [lb] = imp(la, [{path: 'D.txt', content: 'd :: 4\nb :: 2 edited'}], {
      appendOnly: true,
    });
    expect(lb.cards.map(c => `${c.front}=${c.back}`)).toEqual([
      'a=1',
      'b=2 edited',
      'c=3',
      'd=4',
    ]);
  });
});

test('stars, move, search, shuffle', () => {
  let [l] = imp(EMPTY_LIBRARY, [
    {path: 'A/One.txt', content: 'cat :: gato\ndog :: perro\nbird :: pajaro'},
    {path: 'B.txt', content: 'red :: rojo'},
  ]);
  const dog = l.cards.find(c => c.front === 'dog')!;
  l = L.toggleStar(l, dog.id);
  expect(L.starredCards(l).map(c => c.front)).toEqual(['dog']);
  [l] = imp(l, [
    {path: 'A/One.txt', content: 'cat :: gato\ndog :: perro!\nbird :: pajaro'},
  ]);
  expect(l.cards.find(c => c.front === 'dog')!.starred).toBe(true);
  const b = l.decks.find(d => d.name === 'B')!;
  l = L.moveCard(l, dog.id, b.id);
  const moved = l.cards.find(c => c.id === dog.id)!;
  expect(moved.deckId).toBe(b.id);
  expect(moved.starred).toBe(true);
  expect(L.cardsOf(l, b.id).map(c => c.front)).toEqual(['red', 'dog']);
  expect(decodeLibrary(encodeLibrary(l))).toEqual(l);
  const r = L.search(l, 'PERR');
  expect(r.cards.map(c => c.front)).toEqual(['dog']);
  expect(r.decks).toHaveLength(0);
  expect(L.search(l, 'one').decks).toHaveLength(1);
  expect(L.search(l, 'a').folders).toHaveLength(1);
  expect(L.isSearchEmpty(L.search(l, '  '))).toBe(true);
  expect(L.isFolderEmpty(l, l.folders.find(f => f.name === 'A')!.id)).toBe(
    false,
  );
  const ids = new Set(l.decks.map(d => d.id));
  const ordered = L.studyQueue(l, ids, 0, 10).map(c => c.front);
  const mixed = L.studyQueue(l, ids, 0, 10, {
    shuffle: true,
    random: mulberry32(7),
  }).map(c => c.front);
  expect([...mixed].sort()).toEqual([...ordered].sort());
  expect(ordered).toHaveLength(4);
  expect(mixed).not.toEqual(ordered);
});

test('move deck / folder', () => {
  let [l] = imp(EMPTY_LIBRARY, [
    {path: 'A/B/Deck1.txt', content: 'x :: 1'},
    {path: 'C/Deck2.txt', content: 'y :: 2'},
  ]);
  const id = (n: string) => l.folders.find(f => f.name === n)!.id;
  const [a, b, c] = [id('A'), id('B'), id('C')];
  const d1 = l.decks.find(d => d.name === 'Deck1')!;
  l = L.moveDeck(l, d1.id, c);
  expect(L.findDeck(l, d1.id)!.folderId).toBe(c);
  expect(L.cardsOf(l, d1.id)).toHaveLength(1);
  l = L.moveDeck(l, d1.id, null);
  expect(L.findDeck(l, d1.id)!.folderId).toBeNull();
  expect(L.canMoveFolderInto(l, a, a)).toBe(false);
  expect(L.canMoveFolderInto(l, a, b)).toBe(false);
  expect(L.moveFolder(l, a, b)).toBe(l);
  l = L.moveFolder(l, b, c);
  expect(L.findFolder(l, b)!.parentId).toBe(c);
  l = L.moveFolder(l, c, null);
  expect(L.findFolder(l, c)!.parentId).toBeNull();
});

test('arrange / folder reset', () => {
  let [l] = imp(EMPTY_LIBRARY, [
    {path: 'F/Beta.txt', content: 'b :: 1'},
    {path: 'F/Alpha.txt', content: 'a :: 1'},
    {path: 'F/Gamma.txt', content: 'g :: 1\nh :: 2'},
    {path: 'F/Sub/Delta.txt', content: 'd :: 1'},
    {path: 'Other.txt', content: 'o :: 1'},
  ]);
  const f = l.folders.find(x => x.name === 'F')!.id;
  const names = (manual: boolean) =>
    L.orderedDecks(l, f, manual).map(d => d.name);
  expect(names(false)).toEqual(['Alpha', 'Beta', 'Gamma']);
  expect(names(true)).toEqual(['Beta', 'Alpha', 'Gamma']);
  const gamma = l.decks.find(d => d.name === 'Gamma')!.id;
  l = L.shift(l, f, gamma, -1);
  expect(names(true)).toEqual(['Beta', 'Gamma', 'Alpha']);
  l = L.shift(L.shift(l, f, gamma, -1), f, gamma, -1);
  expect(names(true)).toEqual(['Gamma', 'Beta', 'Alpha']);
  expect(decodeLibrary(encodeLibrary(l))).toEqual(l);
  const [l2, zeta] = L.addDeck(l, f, 'Zeta');
  expect(L.orderedDecks(l2, f, true).slice(-1)[0].id).toBe(zeta.id);
  l = L.sortByName(l, f);
  expect(names(true)).toEqual(['Alpha', 'Beta', 'Gamma']);

  const fsrs = new Fsrs();
  l = l.cards.reduce(
    (acc, c) => L.setReview(acc, c.id, fsrs.next(c.review, Rating.Good, NOW)),
    l,
  );
  l = L.resetFolder(l, f);
  const inF = L.deckIdsUnder(l, f);
  expect(inF.size).toBe(4);
  expect(
    l.cards.filter(c => inF.has(c.deckId)).every(c => isNew(c.review)),
  ).toBe(true);
  expect(
    l.cards.filter(c => !inF.has(c.deckId)).some(c => isNew(c.review)),
  ).toBe(false);
  expect(L.studyQueue(l, inF, NOW, Number.MAX_SAFE_INTEGER)).toHaveLength(5);
});

test('search scope / folder export', () => {
  const [l] = imp(EMPTY_LIBRARY, [
    {
      path: 'Law/Crim/Theft.txt',
      content: 'larceny :: taking\nrobbery :: larceny plus force',
    },
    {path: 'Law/Larceny notes.txt', content: 'x :: y'},
    {path: 'Other.txt', content: 'o :: 1'},
  ]);
  const scope = (s: Partial<L.SearchScope>) => ({
    fronts: false,
    backs: false,
    decks: false,
    folders: false,
    ...s,
  });
  const def = L.search(l, 'larceny');
  expect(def.cards).toHaveLength(2);
  expect(def.decks).toHaveLength(1);
  expect(
    L.search(l, 'larceny', scope({fronts: true})).cards.map(c => c.front),
  ).toEqual(['larceny']);
  expect(
    L.search(l, 'larceny', scope({backs: true})).cards.map(c => c.front),
  ).toEqual(['robbery']);
  expect(L.search(l, 'larceny', scope({decks: true})).decks).toHaveLength(1);
  expect(
    L.search(l, 'crim', scope({folders: true})).folders.map(f => f.name),
  ).toEqual(['Crim']);
  const law = l.folders.find(f => f.name === 'Law')!.id;
  expect(new Set(L.exportFiles(l, law).map(f => f.path))).toEqual(
    new Set(['Law/Crim/Theft.txt', 'Law/Larceny notes.txt']),
  );
  const crim = l.folders.find(f => f.name === 'Crim')!.id;
  expect(L.exportFiles(l, crim).map(f => f.path)).toEqual(['Crim/Theft.txt']);
  expect(L.exportFileName('A/B: c?', 'txt')).toBe('A-B- c-.txt');
});

test('practice filters', () => {
  let [l] = imp(EMPTY_LIBRARY, [
    {path: 'D.txt', content: 'a :: 1\nb :: 2\nc :: 3\nd :: 4'},
  ]);
  const [a, b] = l.cards;
  l = L.setReview(l, a.id, {
    due: NOW - 1,
    reps: 1,
    stability: 1,
    difficulty: 0,
    lapses: 0,
    lastReview: NOW - DAY_MS,
  });
  l = L.setReview(l, b.id, {
    due: NOW + 9 * DAY_MS,
    reps: 1,
    stability: 5,
    difficulty: 0,
    lapses: 0,
    lastReview: NOW,
  });
  l = L.toggleStar(l, b.id);
  const ids = new Set(l.decks.map(d => d.id));
  const f = (...x: L.PracticeFilter[]) =>
    L.practiceCards(l, ids, x, NOW)
      .map(c => c.front)
      .sort();
  expect(f()).toEqual(['a', 'b', 'c', 'd']);
  expect(f('due')).toEqual(['a']);
  expect(f('new')).toEqual(['c', 'd']);
  expect(f('starred')).toEqual(['b']);
  expect(f('due', 'starred')).toEqual(['a', 'b']);
  expect(f('due', 'new', 'starred')).toEqual(['a', 'b', 'c', 'd']);
});

test('FSRS', () => {
  const fsrs = new Fsrs();
  const s0 = {
    due: 0,
    stability: 0,
    difficulty: 0,
    reps: 0,
    lapses: 0,
    lastReview: 0,
  };
  const good1 = fsrs.next(s0, Rating.Good, NOW);
  const good2 = fsrs.next(good1, Rating.Good, good1.due);
  const again2 = fsrs.next(good1, Rating.Again, good1.due);
  expect(good2.due - good1.due).toBeGreaterThan(good1.due - NOW);
  expect(again2.stability).toBeLessThan(good1.stability);
  expect(again2.lapses).toBe(1);
  expect(again2.due - good1.due).toBe(10 * MINUTE_MS);
  const easy = fsrs.next(s0, Rating.Easy, NOW);
  const hard = fsrs.next(s0, Rating.Hard, NOW);
  expect(easy.due).toBeGreaterThan(good1.due);
  expect(good1.due).toBeGreaterThan(hard.due);
  expect(
    [5 * MINUTE_MS, 3 * DAY_MS, 21 * DAY_MS, 90 * DAY_MS, 400 * DAY_MS].map(
      formatInterval,
    ),
  ).toEqual(['5m', '3d', '3w', '3mo', '1.1y']);
  // New-card intervals from the published FSRS-4.5 defaults.
  expect(fsrs.previewLabel(s0, Rating.Good, NOW)).toBe('4d');
  expect(fsrs.previewLabel(s0, Rating.Again, NOW)).toBe('10m');
});

test('codec escapes and bad input', () => {
  const weird: LibraryData = {
    folders: [],
    decks: [],
    cards: [
      {
        id: 'a',
        deckId: 'd',
        front: 'quote " back\\slash ⏎\n\ttab é 😀',
        back: 'x\u0001y',
        review: {
          due: 0,
          stability: 0,
          difficulty: 0,
          reps: 0,
          lapses: 0,
          lastReview: 0,
        },
        starred: false,
      },
    ],
  };
  expect(decodeLibrary(encodeLibrary(weird))).toEqual(weird);
  expect(() => decodeLibrary('not json')).toThrow();
  expect(() => decodeLibrary('[]')).toThrow();
  // A file written by the Android app's codec.
  const android =
    '{"version":1,"folders":[{"id":"f1","parent":null,"name":"Law","pos":0}],' +
    '"decks":[{"id":"d1","folder":"f1","name":"Crim","pos":2}],' +
    '"cards":[{"id":"c1","deck":"d1","front":"Q","back":"A","due":5,"s":1.5,"d":3.25,"reps":2,"lapses":1,"last":4,"star":true}]}';
  const lib = decodeLibrary(android);
  expect(lib.cards[0]).toEqual({
    id: 'c1',
    deckId: 'd1',
    front: 'Q',
    back: 'A',
    review: {
      due: 5,
      stability: 1.5,
      difficulty: 3.25,
      reps: 2,
      lapses: 1,
      lastReview: 4,
    },
    starred: true,
  });
  expect(lib.decks[0].position).toBe(2);
});

test('bundled examples match assets/examples', () => {
  const {EXAMPLE_DECKS} = require('./examples.generated');
  const root = path.join(__dirname, '../../assets/examples');
  for (const f of EXAMPLE_DECKS as L.IncomingFile[]) {
    expect(fs.readFileSync(path.join(root, f.path), 'utf8')).toBe(f.content);
  }
  const [lib, rep] = L.importFiles(EMPTY_LIBRARY, EXAMPLE_DECKS);
  expect(rep.warnings).toEqual([]);
  expect(lib.folders.map(x => x.name)).toEqual(['Examples']);
  expect(lib.decks).toHaveLength(4);
});

test('pictures: saved and read back, and unsafe file names refused', () => {
  const card = {
    id: 'c',
    deckId: 'd',
    front: '',
    back: 'Mitochondria',
    review: {
      due: 0,
      stability: 0,
      difficulty: 0,
      reps: 0,
      lapses: 0,
      lastReview: 0,
    },
    starred: false,
    frontImage: {
      file: 'page-1.png',
      width: 1920,
      height: 2560,
      crop: {x: 10, y: 20, width: 300, height: 200},
    },
    backImage: {file: 'lasso-2.png', width: 80, height: 60},
  };
  const lib: LibraryData = {
    folders: [],
    decks: [{id: 'd', folderId: null, name: 'Bio', position: 0}],
    cards: [card],
  };
  expect(decodeLibrary(encodeLibrary(lib))).toEqual(lib);
  const bad = encodeLibrary(lib).replace('page-1.png', '../../etc/passwd');
  expect(decodeLibrary(bad).cards[0].frontImage).toBeUndefined();
  // A text export can't hold a picture, so it says so rather than leaving the side blank.
  expect(L.deckText(lib, lib.decks[0])).toBe('[picture] :: Mitochondria\n');
});
