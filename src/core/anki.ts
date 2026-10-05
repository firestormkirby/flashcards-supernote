/**
 * Anki Desktop's plain-text format, both ways. (The idea and the directive
 * handling follow taoist22/sn-flashcards, MIT.)
 *
 * Import: Anki › Export › "Notes in Plain Text (.txt)" writes a header of
 * `#key:value` lines, then one note per row:
 *
 *   #separator:tab
 *   #html:true
 *   #guid column:1
 *   #notetype column:2
 *   #deck column:3
 *   a1B2c3<TAB>Basic<TAB>Spanish::Verbs<TAB>hablar<TAB>to speak
 *
 * Fields that hold a tab, quote or line break are quoted with "" escapes,
 * which readCsv handles. Deck names use "::" for subdecks; here those become
 * folders. Cloze notes become a card with the gaps hidden on the front and
 * filled in on the back. HTML is turned into plain text, and media references
 * are dropped (a text file carries no pictures or sounds).
 *
 * Export writes the same format, with each card's id as Anki's GUID, so
 * importing a newer export into Anki updates those notes instead of adding
 * duplicates.
 */

import {CardPair, readCsv} from './deckParser';
import type {Card, LibraryData} from './model';

/** True when the text starts with Anki's header lines. */
export function isAnkiText(text: string): boolean {
  const first = text
    .replace(/^﻿/, '')
    .split(/\r?\n/)
    .find(l => l.trim() !== '');
  return (
    !!first &&
    /^#(separator|html|tags|columns|notetype|deck|guid)( column)?:/i.test(
      first.trim(),
    )
  );
}

interface Header {
  delimiter: string;
  html: boolean | null;
  /** 0-based columns that aren't the note's fields. */
  guid?: number;
  notetype?: number;
  deck?: number;
  tags?: number;
}

const SEPARATORS: Record<string, string> = {
  tab: '\t',
  comma: ',',
  semicolon: ';',
  space: ' ',
  pipe: '|',
  colon: ':',
};

function readHeader(lines: string[]): Header {
  const h: Header = {delimiter: '\t', html: null};
  for (const line of lines) {
    const m = line.trim().match(/^#([a-z ]+):(.*)$/i);
    if (!m) continue;
    const key = m[1].trim().toLowerCase();
    const value = m[2].trim();
    if (key === 'separator') {
      h.delimiter = SEPARATORS[value.toLowerCase()] ?? (value[0] || '\t');
    } else if (key === 'html') {
      h.html = value.toLowerCase() === 'true';
    } else if (key.endsWith(' column')) {
      const col = Number(value) - 1;
      if (!Number.isInteger(col) || col < 0) continue;
      const which = key.slice(0, -' column'.length);
      if (which === 'guid') h.guid = col;
      else if (which === 'notetype') h.notetype = col;
      else if (which === 'deck') h.deck = col;
      else if (which === 'tags') h.tags = col;
    }
  }
  return h;
}

const ENTITIES: Record<string, string> = {
  nbsp: ' ',
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
};

/** Anki's HTML as plain text: line breaks kept, tags and media dropped. */
export function htmlToText(html: string): string {
  return html
    .replace(/\[sound:[^\]]*\]/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(div|p|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (whole, code: string) => {
      if (code[0] === '#') {
        const n =
          code[1] === 'x' || code[1] === 'X'
            ? parseInt(code.slice(2), 16)
            : parseInt(code.slice(1), 10);
        return Number.isFinite(n) ? String.fromCodePoint(n) : whole;
      }
      return ENTITIES[code.toLowerCase()] ?? whole;
    })
    .split('\n')
    .map(l => l.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const CLOZE = /\{\{c\d+::([\s\S]*?)(?:::([\s\S]*?))?\}\}/g;

/** A cloze note as front (gaps hidden, showing any hint) and back (filled in). */
export function clozeCard(text: string, extra: string): CardPair | null {
  if (!CLOZE.test(text)) return null;
  CLOZE.lastIndex = 0;
  const front = text.replace(CLOZE, (_m, _a, hint?: string) =>
    hint ? `[${hint}]` : '[…]',
  );
  const filled = text.replace(CLOZE, (_m, answer: string) => answer);
  return [front, extra ? `${filled}\n\n${extra}` : filled];
}

export interface AnkiDeck {
  /** Folder names, then the deck name: "Spanish::Verbs" → ["Spanish", "Verbs"]. */
  path: string[];
  cards: CardPair[];
}

/**
 * Cards from an Anki plain-text export, grouped by deck. Without a deck
 * column every card goes to `fallbackPath` (the file's own name).
 */
export function parseAnki(
  text: string,
  fallbackPath: string[],
): {decks: AnkiDeck[]; warnings: string[]} {
  const clean = text
    .replace(/^﻿/, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');
  const lines = clean.split('\n');
  let bodyStart = 0;
  while (bodyStart < lines.length && lines[bodyStart].startsWith('#'))
    bodyStart++;
  const h = readHeader(lines.slice(0, bodyStart));
  const rows = readCsv(lines.slice(bodyStart).join('\n'), h.delimiter);
  const special = new Set(
    [h.guid, h.notetype, h.deck, h.tags].filter(
      (c): c is number => c !== undefined,
    ),
  );
  // With no #html line Anki guesses; so do we, from what the fields look like.
  const looksHtml = (s: string) => /<\/?[a-z][^>]*>|&[a-z#0-9]+;/i.test(s);
  const asText = (s: string) =>
    h.html === true || (h.html === null && looksHtml(s))
      ? htmlToText(s)
      : s.trim();

  const byDeck = new Map<string, AnkiDeck>();
  let skipped = 0;
  let mediaDropped = 0;
  for (const row of rows) {
    if (row.every(c => c.trim() === '')) continue;
    const fields = row.filter((_c, i) => !special.has(i));
    const raw = fields.slice(0, 2);
    if (raw.some(f => /<img\b|\[sound:/i.test(f))) mediaDropped++;
    const [f0, f1] = raw.map(f => asText(f ?? ''));
    const pair: CardPair | null =
      clozeCard(f0 ?? '', f1 ?? '') ?? (f0 && f1 ? [f0, f1] : null);
    if (!pair) {
      skipped++;
      continue;
    }
    const deckName = h.deck !== undefined ? row[h.deck]?.trim() : '';
    const path = deckName
      ? deckName
          .split('::')
          .map(p => p.trim())
          .filter(p => p !== '')
      : fallbackPath;
    const key = JSON.stringify(path);
    const deck = byDeck.get(key) ?? {path, cards: []};
    deck.cards.push(pair);
    byDeck.set(key, deck);
  }
  const warnings: string[] = [];
  if (skipped > 0)
    warnings.push(
      `${skipped} Anki ${
        skipped === 1 ? 'note was' : 'notes were'
      } skipped: a card needs text on both sides.`,
    );
  if (mediaDropped > 0)
    warnings.push(
      `${mediaDropped} Anki ${
        mediaDropped === 1 ? 'note had' : 'notes had'
      } pictures or sounds, which a text export doesn't carry. The text was imported.`,
    );
  return {decks: [...byDeck.values()], warnings};
}

const toAnkiField = (s: string) => {
  const html = s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');
  return /[\t"]/.test(html) ? `"${html.replace(/"/g, '""')}"` : html;
};

/**
 * The library (or some of its decks) as an Anki plain-text file. Cards with
 * a side that is only a picture are left out, since the file has no room for
 * pictures; a side with text and a picture exports its text.
 */
export function ankiExport(
  lib: LibraryData,
  deckIds?: Set<string>,
): {text: string; exported: number; skipped: number} {
  const deckName = new Map<string, string>();
  for (const d of lib.decks) {
    const names: string[] = [];
    for (let f = d.folderId; f; ) {
      const folder = lib.folders.find(x => x.id === f);
      if (!folder) break;
      names.unshift(folder.name);
      f = folder.parentId;
    }
    deckName.set(d.id, [...names, d.name].join('::'));
  }
  const rows: string[] = [];
  let skipped = 0;
  const wanted = (c: Card) => !deckIds || deckIds.has(c.deckId);
  for (const c of lib.cards.filter(wanted)) {
    if (c.front.trim() === '' || c.back.trim() === '') {
      skipped++;
      continue;
    }
    rows.push(
      [c.id, 'Basic', deckName.get(c.deckId) ?? 'Default', c.front, c.back]
        .map(toAnkiField)
        .join('\t'),
    );
  }
  const text =
    [
      '#separator:tab',
      '#html:true',
      '#guid column:1',
      '#notetype column:2',
      '#deck column:3',
      ...rows,
    ].join('\n') + '\n';
  return {text, exported: rows.length, skipped};
}
