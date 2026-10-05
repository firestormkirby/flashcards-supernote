import {ankiExport, clozeCard, htmlToText, isAnkiText, parseAnki} from './anki';
import {importFiles} from './library';
import {EMPTY_LIBRARY} from './model';
import {deckNamedAfter} from '../ui/CardEditor';

// What Anki Desktop writes for "Notes in Plain Text" with deck names, GUIDs
// and note types included, and HTML left on.
const ANKI_EXPORT = [
  '#separator:tab',
  '#html:true',
  '#guid column:1',
  '#notetype column:2',
  '#deck column:3',
  'a1\tBasic\tSpanish::Verbs\thablar\tto speak',
  'a2\tBasic\tSpanish::Verbs\tcomer\tto <b>eat</b>',
  'a3\tBasic\tSpanish\t"una ""casa"""\ta house<br>(feminine)',
  'a4\tCloze\tHistory\tThe Magna Carta was sealed in {{c1::1215::year}}.\tKing John',
  'a5\tBasic\tHistory\t<img src="map.png">\t',
  '',
].join('\n');

test('recognises Anki exports by their header', () => {
  expect(isAnkiText(ANKI_EXPORT)).toBe(true);
  expect(isAnkiText('﻿#separator:Comma\nfront,back')).toBe(true);
  expect(isAnkiText('# Spanish verbs\nhablar :: to speak')).toBe(false);
});

test('parses decks, quoting, HTML and cloze', () => {
  const {decks, warnings} = parseAnki(ANKI_EXPORT, ['Fallback']);
  expect(decks).toEqual([
    {
      path: ['Spanish', 'Verbs'],
      cards: [
        ['hablar', 'to speak'],
        ['comer', 'to eat'],
      ],
    },
    {path: ['Spanish'], cards: [['una "casa"', 'a house\n(feminine)']]},
    {
      path: ['History'],
      cards: [
        [
          'The Magna Carta was sealed in [year].',
          'The Magna Carta was sealed in 1215.\n\nKing John',
        ],
      ],
    },
  ]);
  expect(warnings).toHaveLength(2); // the picture-only note: skipped, media dropped
});

test('without a deck column, cards go to the file name', () => {
  const {decks} = parseAnki('#separator:tab\n#html:false\nQ\tA a<b\n', [
    'Mine',
  ]);
  expect(decks).toEqual([{path: ['Mine'], cards: [['Q', 'A a<b']]}]);
});

test('html to text keeps line breaks and decodes entities', () => {
  expect(htmlToText('<div>one&nbsp;two</div><div>3 &lt; 4 &#233;</div>')).toBe(
    'one two\n3 < 4 é',
  );
  expect(htmlToText('[sound:x.mp3]word')).toBe('word');
  expect(clozeCard('no gaps', '')).toBeNull();
  expect(clozeCard('{{c1::a}} and {{c2::b}}', '')).toEqual([
    '[…] and […]',
    'a and b',
  ]);
});

test('import: subdecks become folders under the file, and re-import keeps progress', () => {
  const [lib, report] = importFiles(EMPTY_LIBRARY, [
    {path: 'Anki/All Decks.txt', content: ANKI_EXPORT},
  ]);
  expect(report.decksAdded).toBe(3);
  expect(report.cardsTotal).toBe(4);
  const names = (folderId: string | null) =>
    lib.folders.filter(f => f.parentId === folderId).map(f => f.name);
  expect(names(null)).toEqual(['Anki']);
  const anki = lib.folders.find(f => f.name === 'Anki')!;
  expect(names(anki.id).sort()).toEqual(['Spanish']);
  const verbs = lib.decks.find(d => d.name === 'Verbs')!;
  expect(lib.folders.find(f => f.id === verbs.folderId)!.name).toBe('Spanish');

  // Study one card, then import an edited export: progress stays with it.
  const studied = lib.cards.find(c => c.front === 'hablar')!;
  const withProgress = {
    ...lib,
    cards: lib.cards.map(c =>
      c.id === studied.id ? {...c, review: {...c.review, reps: 3}} : c,
    ),
  };
  const [again] = importFiles(withProgress, [
    {
      path: 'Anki/All Decks.txt',
      content: ANKI_EXPORT.replace('to speak', 'to speak, to talk'),
    },
  ]);
  const card = again.cards.find(c => c.front === 'hablar')!;
  expect(card.id).toBe(studied.id);
  expect(card.back).toBe('to speak, to talk');
  expect(card.review.reps).toBe(3);
});

test('export: folders become ::, ids are GUIDs, and it imports back the same', () => {
  const [lib] = importFiles(EMPTY_LIBRARY, [
    {path: 'Spanish/Verbs.txt', content: 'hablar :: to speak\ncomer :: to eat'},
    {
      path: 'Notes.txt',
      content: 'Q: Two lines\nhere\nA: a "quoted"\tanswer\n',
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

  const {decks} = parseAnki(text, ['x']);
  expect(decks).toEqual([
    {
      path: ['Spanish', 'Verbs'],
      cards: [
        ['hablar', 'to speak'],
        ['comer', 'to eat'],
      ],
    },
    // Anki's fields are HTML, where a tab is just a space.
    {path: ['Notes'], cards: [['Two lines\nhere', 'a "quoted" answer']]},
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
