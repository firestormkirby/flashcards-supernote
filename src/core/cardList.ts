/**
 * Sorting and filtering for a deck's card list (All cards). Pure functions,
 * plus a small sorter that remembers its last result so a change that can't
 * move anything (starring a card) doesn't sort the deck again.
 */

import {isDue, normalizeKey} from './library';
import {Card, DAY_MS, isNew} from './model';
import {plainText} from './richText';

// ---------------------------------------------------------------- sorts

export type CardSort =
  | 'added'
  | 'front'
  | 'back'
  | 'due'
  | 'lastStudied'
  | 'hardest'
  | 'weakest'
  | 'reps';

/** Each sort's name in its usual direction and reversed, in menu order. */
export const CARD_SORTS: {key: CardSort; label: string; reversed: string}[] = [
  {key: 'added', label: 'Order added', reversed: 'Newest first'},
  {key: 'front', label: 'A→Z (front)', reversed: 'Z→A (front)'},
  {key: 'back', label: 'A→Z (back)', reversed: 'Z→A (back)'},
  {key: 'due', label: 'Next review: soonest', reversed: 'Next review: latest'},
  {
    key: 'lastStudied',
    label: 'Last studied: recently',
    reversed: 'Last studied: longest ago',
  },
  {key: 'hardest', label: 'Hardest first', reversed: 'Easiest first'},
  {key: 'weakest', label: 'Weakest first', reversed: 'Strongest first'},
  {key: 'reps', label: 'Most reviewed', reversed: 'Least reviewed'},
];

export function sortLabel(sort: CardSort, reverse: boolean): string {
  const s = CARD_SORTS.find(x => x.key === sort) ?? CARD_SORTS[0];
  return reverse ? s.reversed : s.label;
}

// Leading characters that don't count for A–Z: ASCII and Latin-1 punctuation
// (¿ ¡ « » …), general punctuation (dashes, curly quotes, …) and spaces.
// Written as ranges rather than \p{P}: Unicode property escapes aren't
// certain on Hermes.
const LEADING_PUNCT = /^[\s!-/:-@[-`{-~¡-¿‐-⁞]+/;

/**
 * The text a card is put in A–Z order by: one side's text without markup,
 * without leading punctuation. Null for a picture-only (or empty) side.
 */
export function frontSortText(front: string): string | null {
  const text = plainText(front).replace(/\s+/g, ' ').trim();
  if (text === '') return null;
  const stripped = text.replace(LEADING_PUNCT, '');
  // A front that is only punctuation ("?!") sorts as itself.
  return stripped === '' ? text : stripped;
}

/** Text comparison for A–Z: locale-aware where the engine has Intl, else a close stand-in. */
export type TextCompare = (a: string, b: string) => number;

/** `intl` null means the engine has none (for tests). */
export function makeTextCompare(
  intl: typeof Intl | null = typeof Intl === 'undefined' ? null : Intl,
): TextCompare {
  try {
    if (intl && typeof intl.Collator === 'function') {
      const c = new intl.Collator(undefined, {
        sensitivity: 'base',
        numeric: true,
      });
      // Some engines construct a Collator that throws on use; check once.
      c.compare('a', 'b');
      return c.compare;
    }
  } catch (_) {}
  return fallbackCompare;
}

/** Lowercase, accents removed where the engine can decompose them. */
export function foldText(s: string): string {
  let out = s.toLowerCase();
  try {
    if (typeof out.normalize === 'function') {
      out = out.normalize('NFD').replace(/[̀-ͯ]/g, '');
    }
  } catch (_) {}
  return out;
}

/** Case- and accent-insensitive, with runs of digits compared as numbers ("2" before "10"). */
export function fallbackCompare(a: string, b: string): number {
  const x = foldText(a).match(/\d+|\D+/g) ?? [];
  const y = foldText(b).match(/\d+|\D+/g) ?? [];
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    const p = x[i];
    const q = y[i];
    if (p === q) continue;
    const pn = p.charCodeAt(0) >= 48 && p.charCodeAt(0) <= 57;
    const qn = q.charCodeAt(0) >= 48 && q.charCodeAt(0) <= 57;
    if (pn && qn) {
      const d = Number(p) - Number(q);
      if (d !== 0) return d < 0 ? -1 : 1;
      continue;
    }
    return p < q ? -1 : 1;
  }
  return x.length - y.length;
}

let defaultCompare: TextCompare | null = null;
function textCompare(): TextCompare {
  if (!defaultCompare) defaultCompare = makeTextCompare();
  return defaultCompare;
}

// Per card object: cards are immutable, so a card that wasn't touched by an
// edit keeps its cached keys, and an edited card is a new object.
const frontKeys = new WeakMap<Card, string | null>();
const backKeys = new WeakMap<Card, string | null>();
const dupKeys = new WeakMap<Card, string | null>();

export function frontSortKey(card: Card): string | null {
  let k = frontKeys.get(card);
  if (k === undefined) {
    k = frontSortText(card.front);
    frontKeys.set(card, k);
  }
  return k;
}

/** As frontSortKey, for the back: null for a picture-only back. */
export function backSortKey(card: Card): string | null {
  let k = backKeys.get(card);
  if (k === undefined) {
    k = frontSortText(card.back);
    backKeys.set(card, k);
  }
  return k;
}

/**
 * What a sort compares for one card, or null when the card has nothing to
 * compare (a picture-only side, a card never studied). Nulls go last in
 * either direction, in the order they were added.
 */
export function sortValue(card: Card, sort: CardSort): string | number | null {
  const r = card.review;
  switch (sort) {
    case 'added':
      return 0;
    case 'front':
      return frontSortKey(card);
    case 'back':
      return backSortKey(card);
    case 'due':
      return isNew(r) ? null : r.due;
    case 'lastStudied':
      return isNew(r) ? null : r.lastReview;
    case 'hardest':
      // Difficulty first, times forgotten as the tie-break (both larger = harder).
      return isNew(r) ? null : r.difficulty * 10_000 + r.lapses;
    case 'weakest':
      return isNew(r) ? null : r.stability;
    case 'reps':
      return r.reps;
  }
}

/** Whether larger values come first when the sort isn't reversed. */
const DESCENDING: Record<CardSort, boolean> = {
  added: false,
  front: false,
  back: false,
  due: false,
  lastStudied: true,
  hardest: true,
  weakest: false,
  reps: true,
};

/** Positions of `cards` in sorted order. Ties keep the order added, so duplicates sit together. */
function sortedOrder(
  values: (string | number | null)[],
  sort: CardSort,
  reverse: boolean,
  compareText: TextCompare,
): number[] {
  const idx = values.map((_, i) => i);
  if (sort === 'added') return reverse ? idx.reverse() : idx;
  const sign = DESCENDING[sort] !== reverse ? -1 : 1;
  idx.sort((i, j) => {
    const a = values[i];
    const b = values[j];
    if (a === null || b === null) {
      if (a !== b) return a === null ? 1 : -1;
      return i - j;
    }
    const c =
      typeof a === 'string'
        ? compareText(a, b as string)
        : (a as number) - (b as number);
    return c !== 0 ? sign * Math.sign(c) : i - j;
  });
  return idx;
}

export function sortCards(
  cards: Card[],
  sort: CardSort,
  reverse: boolean,
  compareText: TextCompare = textCompare(),
): Card[] {
  const values = cards.map(c => sortValue(c, sort));
  return sortedOrder(values, sort, reverse, compareText).map(i => cards[i]);
}

/**
 * A sortCards that remembers its last answer. When the cards come back with
 * the same ids, in the same order, with the same values for this sort (a star
 * toggled, a back edited), the previous order is reused without sorting.
 * `sortsRun` counts real sorts, for tests.
 */
export function createCardSorter(compareText?: TextCompare) {
  let last: {
    sort: CardSort;
    reverse: boolean;
    ids: string[];
    values: (string | number | null)[];
    order: number[];
  } | null = null;
  const sorter = {
    sortsRun: 0,
    sort(cards: Card[], sort: CardSort, reverse: boolean): Card[] {
      const values = cards.map(c => sortValue(c, sort));
      const same =
        last !== null &&
        last.sort === sort &&
        last.reverse === reverse &&
        last.ids.length === cards.length &&
        cards.every(
          (c, i) => c.id === last!.ids[i] && values[i] === last!.values[i],
        );
      if (!same) {
        sorter.sortsRun++;
        last = {
          sort,
          reverse,
          ids: cards.map(c => c.id),
          values,
          order: sortedOrder(
            values,
            sort,
            reverse,
            compareText ?? textCompare(),
          ),
        };
      }
      return last!.order.map(i => cards[i]);
    },
  };
  return sorter;
}

// ---------------------------------------------------------------- duplicates

/**
 * The key two cards are "the same word" by: the front without markup, matched
 * the way import matches cards (trimmed, spaces collapsed, any case). Accents
 * count: "résumé" and "resume" are different words. Null for a picture-only front.
 */
export function duplicateKey(front: string): string | null {
  const k = normalizeKey(plainText(front));
  return k === '' ? null : k;
}

function cardDupKey(card: Card): string | null {
  let k = dupKeys.get(card);
  if (k === undefined) {
    k = duplicateKey(card.front);
    dupKeys.set(card, k);
  }
  return k;
}

/** Cards in `cards` with this front, other than `exceptId` (the card being edited). */
export function findDuplicates(
  cards: Card[],
  front: string,
  exceptId: string | null = null,
): Card[] {
  const k = duplicateKey(front);
  if (k === null) return [];
  return cards.filter(c => c.id !== exceptId && cardDupKey(c) === k);
}

/** Ids of the cards whose front appears more than once in `cards`. */
export function duplicateIds(cards: Card[]): Set<string> {
  const byKey = new Map<string, string[]>();
  for (const c of cards) {
    const k = cardDupKey(c);
    if (k === null) continue;
    const list = byKey.get(k);
    if (list) list.push(c.id);
    else byKey.set(k, [c.id]);
  }
  const out = new Set<string>();
  for (const ids of byKey.values()) {
    if (ids.length > 1) ids.forEach(id => out.add(id));
  }
  return out;
}

// ---------------------------------------------------------------- filters

export type CardFilter =
  | 'starred'
  | 'new'
  | 'due'
  | 'scheduled'
  | 'lapsed'
  | 'picture'
  | 'textOnly'
  | 'dueToday'
  | 'dueWeek'
  | 'duplicates';

export const CARD_FILTERS: {key: CardFilter; label: string}[] = [
  {key: 'starred', label: 'Starred'},
  {key: 'new', label: 'New'},
  {key: 'due', label: 'Due'},
  {key: 'dueToday', label: 'Due today'},
  {key: 'dueWeek', label: 'Due this week'},
  {key: 'scheduled', label: 'Scheduled'},
  {key: 'lapsed', label: 'Forgotten before'},
  {key: 'picture', label: 'Has picture'},
  {key: 'textOnly', label: 'Text only'},
  {key: 'duplicates', label: 'Duplicates'},
];

/** The first moment of tomorrow, local time. */
export function endOfToday(now: number): number {
  const d = new Date(now);
  d.setHours(24, 0, 0, 0);
  return d.getTime();
}

/** What a filter needs beyond the card itself, worked out once per list. */
export interface FilterContext {
  now: number;
  endOfToday: number;
  duplicates: Set<string>;
}

export function filterContext(cards: Card[], now: number): FilterContext {
  return {now, endOfToday: endOfToday(now), duplicates: duplicateIds(cards)};
}

export function matchesFilter(
  card: Card,
  filter: CardFilter,
  ctx: FilterContext,
): boolean {
  const r = card.review;
  const hasPicture = !!(card.frontImage || card.backImage);
  switch (filter) {
    case 'starred':
      return card.starred;
    case 'new':
      return isNew(r);
    case 'due':
      return isDue(card, ctx.now);
    case 'dueToday':
      return !isNew(r) && r.due < ctx.endOfToday;
    case 'dueWeek':
      return !isNew(r) && r.due <= ctx.now + 7 * DAY_MS;
    case 'scheduled':
      return !isNew(r) && r.due > ctx.now;
    case 'lapsed':
      return r.lapses > 0;
    case 'picture':
      return hasPicture;
    case 'textOnly':
      return !hasPicture;
    case 'duplicates':
      return ctx.duplicates.has(card.id);
  }
}

/** Cards picked by any of `filters` (none = every card). */
export function filterCards(
  cards: Card[],
  filters: CardFilter[],
  ctx: FilterContext,
): Card[] {
  if (filters.length === 0) return cards;
  return cards.filter(c => filters.some(f => matchesFilter(c, f, ctx)));
}

/** How many cards each filter picks on its own, in one pass. */
export function filterCounts(
  cards: Card[],
  ctx: FilterContext,
): Record<CardFilter, number> {
  const out = {} as Record<CardFilter, number>;
  for (const {key} of CARD_FILTERS) out[key] = 0;
  for (const c of cards) {
    for (const {key} of CARD_FILTERS) {
      if (matchesFilter(c, key, ctx)) out[key]++;
    }
  }
  return out;
}

// ---------------------------------------------------------------- per-deck view

/** How one deck's All cards list is arranged. Saved per deck in settings. */
export interface CardListView {
  sort: CardSort;
  reverse: boolean;
  filters: CardFilter[];
}

export const DEFAULT_VIEW: CardListView = Object.freeze({
  sort: 'added',
  reverse: false,
  filters: [],
}) as CardListView;

/** A saved view, with anything unknown (from a newer or damaged settings file) dropped. */
export function cleanView(v: unknown): CardListView {
  if (!v || typeof v !== 'object') return DEFAULT_VIEW;
  const o = v as Record<string, unknown>;
  const sort = CARD_SORTS.some(s => s.key === o.sort)
    ? (o.sort as CardSort)
    : DEFAULT_VIEW.sort;
  const filters = Array.isArray(o.filters)
    ? CARD_FILTERS.map(f => f.key).filter(k =>
        (o.filters as unknown[]).includes(k),
      )
    : [];
  return {sort, reverse: o.reverse === true, filters};
}

/** Picking the sort that's already on flips it; picking another starts it the usual way round. */
export function pickSort(view: CardListView, sort: CardSort): CardListView {
  return view.sort === sort
    ? {...view, reverse: !view.reverse}
    : {...view, sort, reverse: false};
}

export function toggleFilter(
  view: CardListView,
  filter: CardFilter,
): CardListView {
  const on = view.filters.includes(filter);
  return {
    ...view,
    filters: on
      ? view.filters.filter(f => f !== filter)
      : CARD_FILTERS.map(f => f.key).filter(
          k => k === filter || view.filters.includes(k),
        ),
  };
}

export function filterLabel(filters: CardFilter[]): string {
  if (filters.length === 0) return 'All';
  if (filters.length === 1) {
    return CARD_FILTERS.find(f => f.key === filters[0])?.label ?? 'All';
  }
  return `${filters.length} filters`;
}
