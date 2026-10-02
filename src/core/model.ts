/**
 * The library's data model. Ported from Cards' Model.kt; field names and
 * meanings are kept identical so the saved JSON stays compatible with the
 * Android app's library file (see codec.ts).
 */

/** A folder. `parentId === null` means it sits at the top level of the library. */
export interface Folder {
  id: string;
  parentId: string | null;
  name: string;
  /** Its place among its siblings when a folder is arranged by hand. */
  position: number;
}

/** A deck of cards. `folderId === null` means it sits at the top level. */
export interface Deck {
  id: string;
  folderId: string | null;
  name: string;
  position: number;
}

/** Spaced-repetition memory state for one card (FSRS). Times are epoch ms. */
export interface ReviewState {
  due: number;
  stability: number;
  difficulty: number;
  reps: number;
  lapses: number;
  lastReview: number;
}

export interface Card {
  id: string;
  deckId: string;
  front: string;
  back: string;
  review: ReviewState;
  starred: boolean;
}

/** The whole library. Treated as immutable: every change produces a new object. */
export interface LibraryData {
  folders: Folder[];
  decks: Deck[];
  cards: Card[];
}

export interface DeckCounts {
  total: number;
  due: number;
  new: number;
}

export const NEW_REVIEW: ReviewState = Object.freeze({
  due: 0,
  stability: 0,
  difficulty: 0,
  reps: 0,
  lapses: 0,
  lastReview: 0,
});

export const EMPTY_LIBRARY: LibraryData = Object.freeze({
  folders: [],
  decks: [],
  cards: [],
});

export const MINUTE_MS = 60_000;
export const DAY_MS = 86_400_000;

export function isNew(review: ReviewState): boolean {
  return review.reps === 0;
}

/** Cards a study session would show right now. */
export function studyable(c: DeckCounts): number {
  return c.due + c.new;
}

export function makeCard(deckId: string, front: string, back: string): Card {
  return {id: newId(), deckId, front, back, review: NEW_REVIEW, starred: false};
}

/** 16 lowercase hex characters, matching the Android app's id shape. */
export function newId(): string {
  let s = '';
  for (let i = 0; i < 16; i++) {
    s += Math.floor(Math.random() * 16).toString(16);
  }
  return s;
}

export function plural(n: number, word: string): string {
  return n === 1 ? word : word + 's';
}
