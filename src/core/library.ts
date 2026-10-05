/**
 * Everything the app does to the library, as pure functions over an immutable
 * LibraryData. Ported from Cards' Library.kt; the behaviour (including the
 * import merge rules that keep study progress when a file is re-imported) is
 * deliberately unchanged.
 *
 * The one real difference: the Android app exports a .zip, and this exports a
 * folder of .txt files instead (`exportFiles`). A Supernote has no zip tool
 * and a folder is what Partner sync and USB transfer move around anyway; the
 * paths inside are the same ones the zip would have held.
 */

import {CardPair, formatDeck, isSupported, parseDeck} from './deckParser';
import {
  Card,
  Deck,
  DeckCounts,
  Folder,
  LibraryData,
  NEW_REVIEW,
  ReviewState,
  isNew,
  newId,
  plural,
} from './model';

export interface IncomingFile {
  /** Relative path, e.g. "Law/Evidence/Hearsay.txt". */
  path: string;
  content: string;
}

export interface ImportReport {
  decksAdded: number;
  decksUpdated: number;
  decksRemoved: number;
  cardsAdded: number;
  cardsChanged: number;
  cardsRemoved: number;
  cardsTotal: number;
  filesIgnored: string[];
  warnings: string[];
}

export function importSummary(r: ImportReport): string {
  const decks = r.decksAdded + r.decksUpdated;
  const parts = [
    `${decks} ${plural(decks, 'deck')}, ${r.cardsTotal} ${plural(
      r.cardsTotal,
      'card',
    )}`,
  ];
  if (r.cardsAdded > 0) parts.push(`${r.cardsAdded} new`);
  if (r.cardsChanged > 0) parts.push(`${r.cardsChanged} edited`);
  if (r.cardsRemoved > 0) parts.push(`${r.cardsRemoved} removed`);
  if (r.decksRemoved > 0)
    parts.push(`${r.decksRemoved} ${plural(r.decksRemoved, 'deck')} removed`);
  return parts.join(' · ');
}

/** Same ordering as Kotlin's String.CASE_INSENSITIVE_ORDER, close enough for names. */
export function compareNames(a: string, b: string): number {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  return x < y ? -1 : x > y ? 1 : 0;
}

const byName = <T extends {name: string}>(a: T, b: T) =>
  compareNames(a.name, b.name);
const byPosition = <T extends {name: string; position: number}>(a: T, b: T) =>
  a.position - b.position || compareNames(a.name, b.name);

// ---------------------------------------------------------------- lookups

export function childFolders(
  lib: LibraryData,
  parentId: string | null,
): Folder[] {
  return lib.folders.filter(f => f.parentId === parentId).sort(byName);
}

export function decksIn(lib: LibraryData, folderId: string | null): Deck[] {
  return lib.decks.filter(d => d.folderId === folderId).sort(byName);
}

export function findFolder(
  lib: LibraryData,
  id: string | null | undefined,
): Folder | undefined {
  return id == null ? undefined : lib.folders.find(f => f.id === id);
}

export function findDeck(lib: LibraryData, id: string): Deck | undefined {
  return lib.decks.find(d => d.id === id);
}

export function findCard(lib: LibraryData, id: string): Card | undefined {
  return lib.cards.find(c => c.id === id);
}

export function cardsOf(lib: LibraryData, deckId: string): Card[] {
  return lib.cards.filter(c => c.deckId === deckId);
}

/** Folders from the top level down to `folderId` (inclusive). */
export function folderChain(
  lib: LibraryData,
  folderId: string | null,
): Folder[] {
  const chain: Folder[] = [];
  let current = findFolder(lib, folderId);
  while (current && chain.length < 64) {
    chain.unshift(current);
    current = findFolder(lib, current.parentId);
  }
  return chain;
}

export function deckPath(lib: LibraryData, deck: Deck): string {
  return [...folderChain(lib, deck.folderId).map(f => f.name), deck.name].join(
    '/',
  );
}

export function folderPath(lib: LibraryData, folderId: string | null): string {
  return folderChain(lib, folderId)
    .map(f => f.name)
    .join('/');
}

/** Every folder id inside `folderId`, including itself (null = whole library). */
export function descendantFolderIds(
  lib: LibraryData,
  folderId: string | null,
): Set<string | null> {
  const result = new Set<string | null>([folderId]);
  let frontier: (string | null)[] = [folderId];
  while (frontier.length > 0) {
    const next = lib.folders
      .filter(f => frontier.includes(f.parentId) && !result.has(f.id))
      .map(f => f.id);
    next.forEach(id => result.add(id));
    frontier = next;
  }
  return result;
}

export function decksUnder(lib: LibraryData, folderId: string | null): Deck[] {
  const ids = descendantFolderIds(lib, folderId);
  return lib.decks.filter(d => ids.has(d.folderId));
}

export function deckIdsUnder(
  lib: LibraryData,
  folderId: string | null,
): Set<string> {
  return new Set(decksUnder(lib, folderId).map(d => d.id));
}

export function isDue(card: Card, now: number): boolean {
  return !isNew(card.review) && card.review.due <= now;
}

// ---------------------------------------------------------------- counts and queues

/** The Practice chips. None selected means "All". */
export type PracticeFilter = 'due' | 'new' | 'starred';
export const PRACTICE_FILTERS: {key: PracticeFilter; label: string}[] = [
  {key: 'due', label: 'Due'},
  {key: 'new', label: 'New'},
  {key: 'starred', label: 'Starred'},
];

/** Whether a card is picked by the All / Due / New / Starred choice (none = All). */
export function matches(
  card: Card,
  filters: PracticeFilter[],
  now: number,
): boolean {
  return (
    filters.length === 0 ||
    (filters.includes('due') && isDue(card, now)) ||
    (filters.includes('new') && isNew(card.review)) ||
    (filters.includes('starred') && card.starred)
  );
}

export function counts(
  lib: LibraryData,
  deckIds: Set<string>,
  now: number,
  filters: PracticeFilter[] = [],
): DeckCounts {
  let total = 0;
  let due = 0;
  let fresh = 0;
  for (const c of lib.cards) {
    if (!deckIds.has(c.deckId) || !matches(c, filters, now)) continue;
    total++;
    if (isNew(c.review)) fresh++;
    else if (c.review.due <= now) due++;
  }
  return {total, due, new: fresh};
}

/** Counts for every deck in one pass over the cards. */
export function countsByDeck(
  lib: LibraryData,
  now: number,
): Map<string, DeckCounts> {
  const totals = new Map<string, DeckCounts>();
  for (const d of lib.decks) totals.set(d.id, {total: 0, due: 0, new: 0});
  for (const c of lib.cards) {
    const t = totals.get(c.deckId);
    if (!t) continue;
    t.total++;
    if (isNew(c.review)) t.new++;
    else if (c.review.due <= now) t.due++;
  }
  return totals;
}

/** Earliest upcoming review in these decks, or null if nothing is scheduled. */
export function nextDue(lib: LibraryData, deckIds: Set<string>): number | null {
  let best: number | null = null;
  for (const c of lib.cards) {
    if (!deckIds.has(c.deckId) || isNew(c.review)) continue;
    if (best === null || c.review.due < best) best = c.review.due;
  }
  return best;
}

export function shuffled<T>(
  items: T[],
  random: () => number = Math.random,
): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * The cards for a study session: everything due (most overdue first), then up
 * to `newLimit` cards never seen before, in the order they appear in their decks.
 */
export function studyQueue(
  lib: LibraryData,
  deckIds: Set<string>,
  now: number,
  newLimit: number,
  opts: {
    shuffle?: boolean;
    random?: () => number;
    filters?: PracticeFilter[];
  } = {},
): Card[] {
  const filters = opts.filters ?? [];
  const inScope = lib.cards.filter(
    c => deckIds.has(c.deckId) && matches(c, filters, now),
  );
  const due = inScope
    .filter(c => isDue(c, now))
    .sort((a, b) => a.review.due - b.review.due);
  const newCards = inScope.filter(c => isNew(c.review));
  if (!opts.shuffle) return [...due, ...newCards.slice(0, newLimit)];
  // Shuffled: a random pick of new cards, mixed in with the due ones.
  const random = opts.random ?? Math.random;
  return shuffled(
    [...due, ...shuffled(newCards, random).slice(0, newLimit)],
    random,
  );
}

/** Cards to practice: every card when `filters` is empty ("All"), else the picked kinds combined. */
export function practiceCards(
  lib: LibraryData,
  deckIds: Set<string>,
  filters: PracticeFilter[],
  now: number,
): Card[] {
  return lib.cards.filter(
    c => deckIds.has(c.deckId) && matches(c, filters, now),
  );
}

export function isFolderEmpty(lib: LibraryData, folderId: string): boolean {
  return (
    !lib.folders.some(f => f.parentId === folderId) &&
    !lib.decks.some(d => d.folderId === folderId)
  );
}

export function starredCards(lib: LibraryData): Card[] {
  return lib.cards.filter(c => c.starred);
}

// ---------------------------------------------------------------- search

export interface SearchScope {
  fronts: boolean;
  backs: boolean;
  decks: boolean;
  folders: boolean;
}

export const FULL_SCOPE: SearchScope = {
  fronts: true,
  backs: true,
  decks: true,
  folders: true,
};

export interface SearchResults {
  folders: Folder[];
  decks: Deck[];
  cards: Card[];
}

/** Case-insensitive search across folder names, deck names, and card fronts/backs. */
export function search(
  lib: LibraryData,
  query: string,
  scope: SearchScope = FULL_SCOPE,
  cardLimit = 200,
): SearchResults {
  const q = query.trim().toLowerCase();
  if (q === '') return {folders: [], decks: [], cards: []};
  const hit = (s: string) => s.toLowerCase().includes(q);
  return {
    folders: scope.folders
      ? lib.folders.filter(f => hit(f.name)).sort(byName)
      : [],
    decks: scope.decks ? lib.decks.filter(d => hit(d.name)).sort(byName) : [],
    cards: lib.cards
      .filter(
        c => (scope.fronts && hit(c.front)) || (scope.backs && hit(c.back)),
      )
      .slice(0, cardLimit),
  };
}

export function isSearchEmpty(r: SearchResults): boolean {
  return r.folders.length === 0 && r.decks.length === 0 && r.cards.length === 0;
}

// ---------------------------------------------------------------- editing

export function cleanName(name: string): string {
  return name.trim().replace(/\//g, '-') || 'Untitled';
}

export function nameTakenInFolder(
  lib: LibraryData,
  parentId: string | null,
  name: string,
  exceptId?: string,
): boolean {
  const n = name.trim().toLowerCase();
  return (
    lib.folders.some(
      f =>
        f.parentId === parentId &&
        f.id !== exceptId &&
        f.name.toLowerCase() === n,
    ) ||
    lib.decks.some(
      d =>
        d.folderId === parentId &&
        d.id !== exceptId &&
        d.name.toLowerCase() === n,
    )
  );
}

/** The next free position in a folder, so new items land at the end when arranged by hand. */
export function nextPosition(
  lib: LibraryData,
  parentId: string | null,
): number {
  const positions = [
    ...lib.folders.filter(f => f.parentId === parentId).map(f => f.position),
    ...lib.decks.filter(d => d.folderId === parentId).map(d => d.position),
  ];
  return positions.length === 0 ? 0 : Math.max(...positions) + 1;
}

export function addFolder(
  lib: LibraryData,
  parentId: string | null,
  name: string,
): LibraryData {
  const folder: Folder = {
    id: newId(),
    parentId,
    name: cleanName(name),
    position: nextPosition(lib, parentId),
  };
  return {...lib, folders: [...lib.folders, folder]};
}

export function addDeck(
  lib: LibraryData,
  folderId: string | null,
  name: string,
): [LibraryData, Deck] {
  const deck: Deck = {
    id: newId(),
    folderId,
    name: cleanName(name),
    position: nextPosition(lib, folderId),
  };
  return [{...lib, decks: [...lib.decks, deck]}, deck];
}

export function renameFolder(
  lib: LibraryData,
  id: string,
  name: string,
): LibraryData {
  return {
    ...lib,
    folders: lib.folders.map(f =>
      f.id === id ? {...f, name: cleanName(name)} : f,
    ),
  };
}

export function renameDeck(
  lib: LibraryData,
  id: string,
  name: string,
): LibraryData {
  return {
    ...lib,
    decks: lib.decks.map(d =>
      d.id === id ? {...d, name: cleanName(name)} : d,
    ),
  };
}

/** Moves a deck into another folder (null = top level), keeping all its cards. */
export function moveDeck(
  lib: LibraryData,
  deckId: string,
  toFolderId: string | null,
): LibraryData {
  if (toFolderId !== null && !lib.folders.some(f => f.id === toFolderId))
    return lib;
  const position = nextPosition(lib, toFolderId);
  return {
    ...lib,
    decks: lib.decks.map(d =>
      d.id === deckId ? {...d, folderId: toFolderId, position} : d,
    ),
  };
}

/** Whether `folderId` may be moved under `toParentId`: anywhere except itself or inside itself. */
export function canMoveFolderInto(
  lib: LibraryData,
  folderId: string,
  toParentId: string | null,
): boolean {
  return (
    toParentId === null ||
    (!descendantFolderIds(lib, folderId).has(toParentId) &&
      lib.folders.some(f => f.id === toParentId))
  );
}

/** Moves a folder (with everything inside it) under another folder (null = top level). */
export function moveFolder(
  lib: LibraryData,
  folderId: string,
  toParentId: string | null,
): LibraryData {
  if (!canMoveFolderInto(lib, folderId, toParentId)) return lib;
  const position = nextPosition(lib, toParentId);
  return {
    ...lib,
    folders: lib.folders.map(f =>
      f.id === folderId ? {...f, parentId: toParentId, position} : f,
    ),
  };
}

export function deleteFolder(lib: LibraryData, id: string): LibraryData {
  const folderIds = descendantFolderIds(lib, id);
  const deckIds = new Set(
    lib.decks.filter(d => folderIds.has(d.folderId)).map(d => d.id),
  );
  return {
    folders: lib.folders.filter(f => !folderIds.has(f.id)),
    decks: lib.decks.filter(d => !deckIds.has(d.id)),
    cards: lib.cards.filter(c => !deckIds.has(c.deckId)),
  };
}

export function deleteDeck(lib: LibraryData, id: string): LibraryData {
  return {
    ...lib,
    decks: lib.decks.filter(d => d.id !== id),
    cards: lib.cards.filter(c => c.deckId !== id),
  };
}

export function upsertCard(lib: LibraryData, card: Card): LibraryData {
  return lib.cards.some(c => c.id === card.id)
    ? {...lib, cards: lib.cards.map(c => (c.id === card.id ? card : c))}
    : {...lib, cards: [...lib.cards, card]};
}

export function deleteCard(lib: LibraryData, id: string): LibraryData {
  return {...lib, cards: lib.cards.filter(c => c.id !== id)};
}

export function setReview(
  lib: LibraryData,
  cardId: string,
  review: ReviewState,
): LibraryData {
  return {
    ...lib,
    cards: lib.cards.map(c => (c.id === cardId ? {...c, review} : c)),
  };
}

export function toggleStar(lib: LibraryData, cardId: string): LibraryData {
  return {
    ...lib,
    cards: lib.cards.map(c =>
      c.id === cardId ? {...c, starred: !c.starred} : c,
    ),
  };
}

/** Moves a card (with its progress and star) to the end of another deck. */
export function moveCard(
  lib: LibraryData,
  cardId: string,
  toDeckId: string,
): LibraryData {
  const card = findCard(lib, cardId);
  if (
    !card ||
    card.deckId === toDeckId ||
    !lib.decks.some(d => d.id === toDeckId)
  )
    return lib;
  return {
    ...lib,
    cards: [
      ...lib.cards.filter(c => c.id !== cardId),
      {...card, deckId: toDeckId},
    ],
  };
}

export function resetDeck(lib: LibraryData, deckId: string): LibraryData {
  return {
    ...lib,
    cards: lib.cards.map(c =>
      c.deckId === deckId ? {...c, review: NEW_REVIEW} : c,
    ),
  };
}

/** Resets study progress for every deck inside a folder, including sub-folders. */
export function resetFolder(
  lib: LibraryData,
  folderId: string | null,
): LibraryData {
  const ids = deckIdsUnder(lib, folderId);
  return {
    ...lib,
    cards: lib.cards.map(c =>
      ids.has(c.deckId) ? {...c, review: NEW_REVIEW} : c,
    ),
  };
}

// ---------------------------------------------------------------- arranging

/** Sub-folders of `parentId` in A–Z order, or in their hand-arranged order. */
export function orderedFolders(
  lib: LibraryData,
  parentId: string | null,
  manual: boolean,
): Folder[] {
  return manual
    ? lib.folders.filter(f => f.parentId === parentId).sort(byPosition)
    : childFolders(lib, parentId);
}

/** Decks in `folderId` in A–Z order, or in their hand-arranged order. */
export function orderedDecks(
  lib: LibraryData,
  folderId: string | null,
  manual: boolean,
): Deck[] {
  return manual
    ? lib.decks.filter(d => d.folderId === folderId).sort(byPosition)
    : decksIn(lib, folderId);
}

/**
 * Moves one folder or deck up (delta = -1) or down (+1) among its kind in
 * `parentId`. Positions are renumbered 0, 1, 2… so the on-screen order is kept exactly.
 */
export function shift(
  lib: LibraryData,
  parentId: string | null,
  itemId: string,
  delta: number,
): LibraryData {
  const fs = orderedFolders(lib, parentId, true);
  const ds = orderedDecks(lib, parentId, true);
  const swap = <T>(list: T[], i: number) => {
    const t = i + delta;
    if (t >= 0 && t < list.length) [list[i], list[t]] = [list[t], list[i]];
  };
  const fi = fs.findIndex(f => f.id === itemId);
  const di = ds.findIndex(d => d.id === itemId);
  if (fi >= 0) swap(fs, fi);
  else if (di >= 0) swap(ds, di);
  else return lib;
  return renumber(lib, fs, ds);
}

/** Makes the A–Z order the hand-arranged order, so items can still be nudged afterwards. */
export function sortByName(
  lib: LibraryData,
  parentId: string | null,
): LibraryData {
  return renumber(lib, childFolders(lib, parentId), decksIn(lib, parentId));
}

function renumber(lib: LibraryData, fs: Folder[], ds: Deck[]): LibraryData {
  const fPos = new Map(fs.map((f, i) => [f.id, i]));
  const dPos = new Map(ds.map((d, i) => [d.id, i]));
  return {
    ...lib,
    folders: lib.folders.map(f =>
      fPos.has(f.id) ? {...f, position: fPos.get(f.id)!} : f,
    ),
    decks: lib.decks.map(d =>
      dPos.has(d.id) ? {...d, position: dPos.get(d.id)!} : d,
    ),
  };
}

// ---------------------------------------------------------------- import

const normalizeKey = (front: string) =>
  front.trim().replace(/\s+/g, ' ').toLowerCase();

/** Splits "Law/Evidence/Hearsay.txt" into folder names and deck name; null if not a deck file. */
export function splitDeckPath(path: string): [string[], string] | null {
  const parts = path
    .replace(/\\/g, '/')
    .split('/')
    .map(p => p.trim())
    .filter(p => p !== '' && p !== '.');
  if (parts.length === 0 || parts.some(p => p.startsWith('.'))) return null;
  const file = parts[parts.length - 1];
  if (!isSupported(file)) return null;
  const dot = file.lastIndexOf('.');
  const deckName = file.slice(0, dot).trim();
  if (deckName === '') return null;
  return [parts.slice(0, -1), deckName];
}

/**
 * Brings deck files into the library. Folders in the files' paths become folders.
 *
 * A deck that already exists at the same path is updated in place: cards are
 * matched by their front text, so review progress is kept for unchanged cards.
 *
 * @param appendOnly keep cards that aren't in the file.
 * @param mirror also delete decks that weren't sent, so the library matches the files exactly.
 */
export function importFiles(
  lib: LibraryData,
  files: IncomingFile[],
  opts: {mirror?: boolean; appendOnly?: boolean} = {},
): [LibraryData, ImportReport] {
  const folders = lib.folders.slice();
  let decks = lib.decks.slice();
  const cardsByDeck = new Map<string, Card[]>();
  for (const c of lib.cards) {
    const list = cardsByDeck.get(c.deckId);
    if (list) list.push(c);
    else cardsByDeck.set(c.deckId, [c]);
  }
  const warnings: string[] = [];
  const ignored: string[] = [];

  // Several files can map to one deck (Verbs.txt + Verbs.csv); combine them in order.
  const parsedByDeck = new Map<
    string,
    {folderNames: string[]; deckName: string; cards: CardPair[]}
  >();
  for (const file of files) {
    const split = splitDeckPath(file.path);
    if (!split) {
      ignored.push(file.path);
      continue;
    }
    const name = file.path.slice(
      file.path.replace(/\\/g, '/').lastIndexOf('/') + 1,
    );
    const result = parseDeck(name, file.content);
    warnings.push(...result.warnings);
    const key = JSON.stringify(split);
    const entry = parsedByDeck.get(key) ?? {
      folderNames: split[0],
      deckName: split[1],
      cards: [],
    };
    entry.cards.push(...result.cards);
    parsedByDeck.set(key, entry);
  }

  const positionIn = (parentId: string | null) => {
    const ps = [
      ...folders.filter(f => f.parentId === parentId).map(f => f.position),
      ...decks.filter(d => d.folderId === parentId).map(d => d.position),
    ];
    return ps.length === 0 ? 0 : Math.max(...ps) + 1;
  };

  const folderIdFor = (names: string[]): string | null => {
    let parent: string | null = null;
    for (const name of names) {
      const existing = folders.find(
        f =>
          f.parentId === parent && f.name.toLowerCase() === name.toLowerCase(),
      );
      if (existing) {
        parent = existing.id;
      } else {
        const created: Folder = {
          id: newId(),
          parentId: parent,
          name,
          position: positionIn(parent),
        };
        folders.push(created);
        parent = created.id;
      }
    }
    return parent;
  };

  let decksAdded = 0;
  let decksUpdated = 0;
  let cardsAdded = 0;
  let cardsChanged = 0;
  let cardsRemoved = 0;
  let cardsTotal = 0;
  const touched = new Set<string>();

  for (const {folderNames, deckName, cards: parsed} of parsedByDeck.values()) {
    const folderId = folderIdFor(folderNames);
    let deck = decks.find(
      d =>
        d.folderId === folderId &&
        d.name.toLowerCase() === deckName.toLowerCase(),
    );
    if (!deck) {
      deck = {
        id: newId(),
        folderId,
        name: deckName,
        position: positionIn(folderId),
      };
      decks.push(deck);
      decksAdded++;
    } else {
      decksUpdated++;
    }
    touched.add(deck.id);
    const deckId = deck.id;

    const existing = cardsByDeck.get(deckId) ?? [];
    const pool = new Map<string, Card[]>();
    for (const c of existing) {
      const k = normalizeKey(c.front);
      const list = pool.get(k);
      if (list) list.push(c);
      else pool.set(k, [c]);
    }
    const updated = new Map<string, Card>(); // existing card id -> its new text
    const result: Card[] = [];
    for (const [front, back] of parsed) {
      const match = pool.get(normalizeKey(front))?.shift();
      if (match) {
        if (match.front !== front || match.back !== back) cardsChanged++;
        const card = {...match, front, back};
        updated.set(match.id, card);
        result.push(card);
      } else {
        cardsAdded++;
        result.push({
          id: newId(),
          deckId,
          front,
          back,
          review: NEW_REVIEW,
          starred: false,
        });
      }
    }
    let finalCards: Card[];
    if (opts.appendOnly) {
      // Keep the deck's existing order; edited cards stay in place, new ones go at the end.
      finalCards = [
        ...existing.map(c => updated.get(c.id) ?? c),
        ...result.filter(c => !updated.has(c.id)),
      ];
    } else {
      cardsRemoved += existing.filter(c => !updated.has(c.id)).length;
      finalCards = result;
    }
    cardsTotal += finalCards.length;
    cardsByDeck.set(deckId, finalCards);
  }

  let decksRemoved = 0;
  let finalFolders = folders;
  if (opts.mirror) {
    const gone = decks.filter(d => !touched.has(d.id));
    decksRemoved = gone.length;
    for (const d of gone) {
      cardsRemoved += cardsByDeck.get(d.id)?.length ?? 0;
      cardsByDeck.delete(d.id);
    }
    decks = decks.filter(d => touched.has(d.id));
    // Remove folders that no longer contain any deck.
    let pruned = true;
    while (pruned) {
      const empty = finalFolders.filter(
        f =>
          !decks.some(d => d.folderId === f.id) &&
          !finalFolders.some(c => c.parentId === f.id),
      );
      pruned = empty.length > 0;
      finalFolders = finalFolders.filter(f => !empty.includes(f));
    }
  }

  const newCards = decks.flatMap(d => cardsByDeck.get(d.id) ?? []);
  const report: ImportReport = {
    decksAdded,
    decksUpdated,
    decksRemoved,
    cardsAdded,
    cardsChanged,
    cardsRemoved,
    cardsTotal,
    filesIgnored: ignored,
    warnings,
  };
  return [{folders: finalFolders, decks, cards: newCards}, report];
}

// ---------------------------------------------------------------- export

export function deckText(lib: LibraryData, deck: Deck): string {
  return formatDeck(
    // A text file can't hold a picture, so a picture-only side says so rather than vanishing.
    cardsOf(lib, deck.id).map(
      c =>
        [
          c.front || (c.frontImage ? '[picture]' : ''),
          c.back || (c.backImage ? '[picture]' : ''),
        ] as CardPair,
    ),
  );
}

const safeSegment = (s: string) => s.replace(/[\\:*?"<>|]/g, '-');
const safePath = (path: string) => path.split('/').map(safeSegment).join('/');

/** A safe file name for exporting one deck or folder. */
export function exportFileName(name: string, extension: string): string {
  return (
    (name.replace(/[\\/:*?"<>|]/g, '-').trim() || 'Flashcards') + '.' + extension
  );
}

/**
 * Text files to write for an export, with paths relative to the export folder.
 * With no `folderId`, every deck in the library ("Export all cards"). With a
 * folder, that folder and everything inside it, starting with the folder's own
 * name — the same layout the Android app puts in its zips, so either can
 * re-import the other's export.
 */
export function exportFiles(
  lib: LibraryData,
  folderId: string | null = null,
): IncomingFile[] {
  if (folderId === null) {
    return lib.decks.map(d => ({
      path: `${safePath(deckPath(lib, d))}.txt`,
      content: deckText(lib, d),
    }));
  }
  const top = findFolder(lib, folderId);
  if (!top) return [];
  const parentPath = folderPath(lib, top.parentId);
  return decksUnder(lib, folderId).map(d => {
    let rel = deckPath(lib, d);
    if (parentPath !== '' && rel.startsWith(parentPath + '/'))
      rel = rel.slice(parentPath.length + 1);
    return {path: `${safePath(rel)}.txt`, content: deckText(lib, d)};
  });
}
