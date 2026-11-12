import * as CL from './cardList';
import {Card, CardImage, DAY_MS, NEW_REVIEW, ReviewState} from './model';

const NOW = 1_700_000_000_000;
const PIC: CardImage = {file: 'p.png', width: 10, height: 10};

let n = 0;
function card(front: string, extra: Partial<Card> = {}): Card {
  n++;
  return {
    id: `c${n}`,
    deckId: 'd',
    front,
    back: `back of ${front}`,
    review: NEW_REVIEW,
    starred: false,
    ...extra,
  };
}

function reviewed(r: Partial<ReviewState>): ReviewState {
  return {
    due: NOW + DAY_MS,
    stability: 5,
    difficulty: 5,
    reps: 3,
    lapses: 0,
    lastReview: NOW - DAY_MS,
    ...r,
  };
}

const fronts = (cards: Card[]) => cards.map(c => c.front);

describe('A–Z', () => {
  const words = [
    'banana',
    'Ápple',
    '¿Cómo estás?',
    'apple',
    '"zebra"',
    'cherry',
  ];

  test('ignores case, accents and leading punctuation; ties keep the order added', () => {
    const cards = words.map(w => card(w));
    expect(fronts(CL.sortCards(cards, 'front', false))).toEqual([
      'Ápple',
      'apple',
      'banana',
      'cherry',
      '¿Cómo estás?',
      '"zebra"',
    ]);
  });

  test('Z→A reverses the words but keeps duplicates in the order added', () => {
    const cards = words.map(w => card(w));
    expect(fronts(CL.sortCards(cards, 'front', true))).toEqual([
      '"zebra"',
      '¿Cómo estás?',
      'cherry',
      'banana',
      'Ápple',
      'apple',
    ]);
  });

  test('numbers sort as numbers', () => {
    const cards = ['Chapter 10', 'Chapter 2', 'Chapter 1'].map(w => card(w));
    expect(fronts(CL.sortCards(cards, 'front', false))).toEqual([
      'Chapter 1',
      'Chapter 2',
      'Chapter 10',
    ]);
  });

  test('markup is ignored', () => {
    const cards = [card('zeta'), card('**alpha**')];
    expect(fronts(CL.sortCards(cards, 'front', false))).toEqual([
      '**alpha**',
      'zeta',
    ]);
  });

  test('picture-only fronts go last in both directions, in the order added', () => {
    const p1 = card('', {frontImage: PIC});
    const p2 = card('', {frontImage: PIC});
    const cards = [p1, card('b'), p2, card('a')];
    expect(CL.sortCards(cards, 'front', false).map(c => c.id)).toEqual([
      cards[3].id,
      cards[1].id,
      p1.id,
      p2.id,
    ]);
    expect(CL.sortCards(cards, 'front', true).map(c => c.id)).toEqual([
      cards[1].id,
      cards[3].id,
      p1.id,
      p2.id,
    ]);
  });

  test('a front that is only punctuation still has a place', () => {
    expect(CL.frontSortText('?!')).toBe('?!');
    expect(CL.frontSortText('  ¡Hola!  ')).toBe('Hola!');
    expect(CL.frontSortText('')).toBeNull();
  });

  test('without Intl, the stand-in gives the same order', () => {
    const cards = [...words, 'Chapter 10', 'Chapter 2'].map(w => card(w));
    const withIntl = CL.sortCards(cards, 'front', false);
    const without = CL.sortCards(
      cards,
      'front',
      false,
      CL.makeTextCompare(null),
    );
    expect(fronts(without)).toEqual(fronts(withIntl));
    expect(CL.makeTextCompare(null)).toBe(CL.fallbackCompare);
  });

  test('a Collator that throws falls back too', () => {
    const broken = {
      Collator: function () {
        throw new Error('no ICU');
      },
    } as unknown as typeof Intl;
    expect(CL.makeTextCompare(broken)).toBe(CL.fallbackCompare);
  });

  test('fallback compare', () => {
    expect(CL.fallbackCompare('Éclair', 'eclair')).toBe(0);
    expect(CL.fallbackCompare('a2', 'a10')).toBeLessThan(0);
    expect(CL.fallbackCompare('ab', 'a')).toBeGreaterThan(0);
  });
});

describe('other sorts', () => {
  const a = card('a', {
    review: reviewed({
      due: NOW + 3 * DAY_MS,
      lastReview: NOW - 5 * DAY_MS,
      difficulty: 2,
      stability: 20,
      reps: 2,
    }),
  });
  const b = card('b');
  const c = card('c', {
    review: reviewed({
      due: NOW - DAY_MS,
      lastReview: NOW - DAY_MS,
      difficulty: 8,
      stability: 1,
      reps: 9,
      lapses: 1,
    }),
  });
  const d = card('d', {
    review: reviewed({
      due: NOW + DAY_MS,
      lastReview: NOW - 2 * DAY_MS,
      difficulty: 8,
      stability: 4,
      reps: 5,
      lapses: 3,
    }),
  });
  const all = [a, b, c, d];
  const by = (sort: CL.CardSort, reverse = false) =>
    fronts(CL.sortCards(all, sort, reverse));

  test('order added, and newest first', () => {
    expect(by('added')).toEqual(['a', 'b', 'c', 'd']);
    expect(by('added', true)).toEqual(['d', 'c', 'b', 'a']);
  });

  test('next review: new cards last either way', () => {
    expect(by('due')).toEqual(['c', 'd', 'a', 'b']);
    expect(by('due', true)).toEqual(['a', 'd', 'c', 'b']);
  });

  test('last studied: most recent first', () => {
    expect(by('lastStudied')).toEqual(['c', 'd', 'a', 'b']);
    expect(by('lastStudied', true)).toEqual(['a', 'd', 'c', 'b']);
  });

  test('hardest: difficulty, then times forgotten', () => {
    expect(by('hardest')).toEqual(['d', 'c', 'a', 'b']);
    expect(by('hardest', true)).toEqual(['a', 'c', 'd', 'b']);
  });

  test('weakest: lowest stability first', () => {
    expect(by('weakest')).toEqual(['c', 'd', 'a', 'b']);
    expect(by('weakest', true)).toEqual(['a', 'd', 'c', 'b']);
  });

  test('reviews: new cards count as zero', () => {
    expect(by('reps')).toEqual(['c', 'd', 'a', 'b']);
    expect(by('reps', true)).toEqual(['b', 'a', 'd', 'c']);
  });
});

describe('remembered sort', () => {
  test('starring a card reuses the order; editing a front sorts again', () => {
    const cards = ['pear', 'apple', 'fig'].map(w => card(w));
    const sorter = CL.createCardSorter();
    expect(fronts(sorter.sort(cards, 'front', false))).toEqual([
      'apple',
      'fig',
      'pear',
    ]);
    expect(sorter.sortsRun).toBe(1);

    // A star toggle: a new object for one card, same front.
    const starred = cards.map(c =>
      c.front === 'fig' ? {...c, starred: true} : c,
    );
    const again = sorter.sort(starred, 'front', false);
    expect(sorter.sortsRun).toBe(1);
    // The new object is what's shown, so the star appears.
    expect(again.find(c => c.front === 'fig')!.starred).toBe(true);

    const edited = starred.map(c =>
      c.front === 'pear' ? {...c, front: 'aardvark'} : c,
    );
    expect(fronts(sorter.sort(edited, 'front', false))).toEqual([
      'aardvark',
      'apple',
      'fig',
    ]);
    expect(sorter.sortsRun).toBe(2);

    sorter.sort(edited, 'front', true);
    expect(sorter.sortsRun).toBe(3);
    sorter.sort(edited.slice(1), 'front', true);
    expect(sorter.sortsRun).toBe(4);
  });

  test('a front key is worked out once per card object', () => {
    const c = card('*word*');
    expect(CL.frontSortKey(c)).toBe('word');
    expect(CL.frontSortKey(c)).toBe('word');
  });
});

describe('duplicates', () => {
  test('the key: markup gone, trimmed, spaces collapsed, any case; accents count', () => {
    expect(CL.duplicateKey('  **Ephemeral**   word ')).toBe('ephemeral word');
    expect(CL.duplicateKey('résumé')).not.toBe(CL.duplicateKey('resume'));
    expect(CL.duplicateKey('')).toBeNull();
    expect(CL.duplicateKey('   ')).toBeNull();
  });

  test('finds matches, leaving out the card being edited', () => {
    const one = card('Ephemeral');
    const two = card('ephemeral ');
    const other = card('Eternal');
    const cards = [one, two, other];
    expect(CL.findDuplicates(cards, ' EPHEMERAL').map(c => c.id)).toEqual([
      one.id,
      two.id,
    ]);
    expect(
      CL.findDuplicates(cards, 'ephemeral', one.id).map(c => c.id),
    ).toEqual([two.id]);
    expect(CL.findDuplicates(cards, '')).toEqual([]);
  });

  test('picture-only fronts are never duplicates', () => {
    const cards = [
      card('', {frontImage: PIC}),
      card('', {frontImage: PIC}),
      card('x'),
      card('X'),
    ];
    expect([...CL.duplicateIds(cards)]).toEqual([cards[2].id, cards[3].id]);
  });
});

describe('filters', () => {
  const fresh = card('fresh');
  const due = card('due', {review: reviewed({due: NOW - DAY_MS, lapses: 2})});
  const later = card('later', {review: reviewed({due: NOW + 3 * DAY_MS})});
  const far = card('far', {
    review: reviewed({due: NOW + 30 * DAY_MS}),
    starred: true,
  });
  const pic = card('Fresh', {backImage: PIC});
  const all = [fresh, due, later, far, pic];
  const ctx = CL.filterContext(all, NOW);
  const pick = (...f: CL.CardFilter[]) => fronts(CL.filterCards(all, f, ctx));

  test('each filter', () => {
    expect(pick()).toEqual(['fresh', 'due', 'later', 'far', 'Fresh']);
    expect(pick('starred')).toEqual(['far']);
    expect(pick('new')).toEqual(['fresh', 'Fresh']);
    expect(pick('due')).toEqual(['due']);
    expect(pick('dueToday')).toEqual(['due']);
    expect(pick('dueWeek')).toEqual(['due', 'later']);
    expect(pick('scheduled')).toEqual(['later', 'far']);
    expect(pick('lapsed')).toEqual(['due']);
    expect(pick('picture')).toEqual(['Fresh']);
    expect(pick('textOnly')).toEqual(['fresh', 'due', 'later', 'far']);
    expect(pick('duplicates')).toEqual(['fresh', 'Fresh']);
  });

  test('several filters show cards matching any of them', () => {
    expect(pick('starred', 'due')).toEqual(['due', 'far']);
  });

  test('counts match the filters one by one', () => {
    const counts = CL.filterCounts(all, ctx);
    for (const {key} of CL.CARD_FILTERS) {
      expect(counts[key]).toBe(CL.filterCards(all, [key], ctx).length);
    }
  });

  test('due today ends at local midnight', () => {
    const end = CL.endOfToday(NOW);
    expect(end).toBeGreaterThan(NOW);
    expect(end - NOW).toBeLessThanOrEqual(DAY_MS);
    expect(new Date(end).getHours()).toBe(0);
  });
});

describe('saved view', () => {
  test('picking the current sort flips it; another starts the usual way', () => {
    let v = CL.DEFAULT_VIEW;
    v = CL.pickSort(v, 'front');
    expect(v).toEqual({sort: 'front', reverse: false, filters: []});
    v = CL.pickSort(v, 'front');
    expect(v.reverse).toBe(true);
    v = CL.pickSort(v, 'due');
    expect(v).toEqual({sort: 'due', reverse: false, filters: []});
  });

  test('filters toggle and keep menu order', () => {
    let v = CL.toggleFilter(CL.DEFAULT_VIEW, 'duplicates');
    v = CL.toggleFilter(v, 'starred');
    expect(v.filters).toEqual(['starred', 'duplicates']);
    expect(CL.filterLabel(v.filters)).toBe('2 filters');
    v = CL.toggleFilter(v, 'duplicates');
    expect(CL.filterLabel(v.filters)).toBe('Starred');
    expect(CL.filterLabel([])).toBe('All');
  });

  test('unknown or damaged saved views are cleaned', () => {
    expect(CL.cleanView(null)).toEqual(CL.DEFAULT_VIEW);
    expect(
      CL.cleanView({sort: 'bogus', reverse: 'yes', filters: ['new', 'nope']}),
    ).toEqual({
      sort: 'added',
      reverse: false,
      filters: ['new'],
    });
  });
});
