/**
 * Anki Desktop's plain-text format, both ways.
 *
 * Import reads "Notes in Plain Text (.txt)" exactly as the Android app does
 * (AnkiText.kt, Cards 1.0.4–1.0.6), so one file gives the same cards in both:
 *
 *   #separator:tab
 *   #html:true
 *   #guid column:1
 *   #notetype column:2
 *   #deck column:3
 *   a1B2c3<TAB>Basic<TAB>Spanish::Verbs<TAB>hablar<TAB>to speak
 *
 *  - The first field is the front and the second the back. "Basic (and
 *    reversed card)" also adds the reverse card, and "optional reversed" does
 *    when its third field is set.
 *  - Cloze notes ({{c1::answer::hint}}) become one card per cloze number: the
 *    front shows "[…]" (or "[hint]") for that blank, the back the full text
 *    plus the Back Extra field.
 *  - Formatting: bold and italics become **bold** / *italics*; line breaks and
 *    list items are kept; other tags are dropped; entities are decoded.
 *    Pictures and sounds are left out, with a warning.
 *  - "Bar::Evidence::Hearsay" becomes folders Bar › Evidence and deck Hearsay.
 *    Without a deck, cards go to a deck named after the file.
 *  - Older exports have no header: rows that are all tab-separated, unquoted.
 *
 * Export writes the same format, with each card's id as Anki's GUID, so
 * importing a newer export into Anki updates those notes instead of adding
 * duplicates. (Export, and the first version of import, follow
 * taoist22/sn-flashcards, MIT.)
 */

import {CardPair, readCsv} from './deckParser';
import type {Card, LibraryData} from './model';
import {richRuns} from './richText';

const HEADER =
  /^#(separator|html|tags column|deck column|notetype column|guid column|columns|deck|notetype|if matches|tags):/i;
const Q_OR_A = /^(q|question|front|a|answer|back)\s*[:：](?![:：])/i;
const CLOZE_TEST = /\{\{c\d+::[\s\S]*?\}\}/;

/**
 * True for an Anki text export: Anki's header lines, or (older Anki) rows
 * that are all tab-separated and not in Flashcards' own formats.
 */
export function isAnkiText(fileName: string, text: string): boolean {
  const name = fileName.toLowerCase();
  if (!name.endsWith('.txt') && !name.endsWith('.tsv')) return false;
  const lines = text
    .replace(/^﻿/, '')
    .split('\n')
    .map(l => l.replace(/\r$/, ''))
    .filter(l => l.trim() !== '')
    .slice(0, 200);
  if (lines.length === 0) return false;
  if (lines.slice(0, 12).some(l => HEADER.test(l))) return true;
  return (
    lines.every(
      l =>
        l.includes('\t') &&
        !Q_OR_A.test(l.trim()) &&
        !l.trimStart().startsWith('#'),
    ) && !lines.some(l => l.includes('::') && !CLOZE_TEST.test(l))
  );
}

const SEPARATORS: Record<string, string> = {
  tab: '\t',
  comma: ',',
  semicolon: ';',
  space: ' ',
  pipe: '|',
  colon: ':',
};

const NAMED: Record<string, string> = {
  nbsp: ' ',
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  ndash: '–',
  mdash: '—',
  hellip: '…',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  bull: '•',
  middot: '·',
  times: '×',
  divide: '÷',
  deg: '°',
  plusmn: '±',
  frac12: '½',
  sect: '§',
  para: '¶',
  copy: '©',
  reg: '®',
  trade: '™',
  rarr: '→',
  larr: '←',
  harr: '↔',
  uarr: '↑',
  darr: '↓',
  le: '≤',
  ge: '≥',
  ne: '≠',
  eacute: 'é',
};

function decodeEntities(s: string): string {
  return s.replace(
    /&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z][a-zA-Z0-9]*);/g,
    (whole, e: string) => {
      if (/^#x/i.test(e)) {
        const n = parseInt(e.slice(2), 16);
        return Number.isFinite(n) ? String.fromCodePoint(n) : whole;
      }
      if (e[0] === '#') {
        const n = parseInt(e.slice(1), 10);
        return Number.isFinite(n) ? String.fromCodePoint(n) : whole;
      }
      return NAMED[e.toLowerCase()] ?? whole;
    },
  );
}

const MEDIA = /\[sound:[^\]]*]|<img\b[^>]*>/gi;

/** Bold or italics: the markers go round the words, spaces stay outside. */
const marked =
  (marker: string) =>
  (_all: string, _tag: string, pre: string, inner: string, post: string) =>
    inner.trim() === ''
      ? pre + inner + post
      : `${pre}${marker}${inner}${marker}${post}`;

/** Anki's field HTML as Flashcards text. `html` false: the field is already plain text. */
export function ankiFieldToText(field: string, html: boolean | null): string {
  let s = field.replace(MEDIA, '');
  const isHtml = html ?? /<[a-zA-Z/][^>]*>|&[#a-zA-Z0-9]+;/.test(s);
  if (isHtml) {
    s = s
      .replace(/<(b|strong)\b[^>]*>(\s*)([\s\S]*?)(\s*)<\/\1>/gi, marked('**'))
      .replace(/<(i|em)\b[^>]*>(\s*)([\s\S]*?)(\s*)<\/\1>/gi, marked('*'))
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<li\b[^>]*>/gi, '\n• ')
      .replace(/<(div|p|tr|ul|ol|h[1-6])\b[^>]*>/gi, '\n')
      .replace(/<\/(div|p|li|tr|ul|ol|h[1-6])>/gi, '\n')
      .replace(/<[^>]+>/g, '');
    s = decodeEntities(s);
  }
  return s
    .replace(/ /g, ' ')
    .split('\n')
    .map(l => l.trim().replace(/[ \t]{2,}/g, ' '))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const CLOZE = /\{\{c(\d+)::([\s\S]*?)(?:::([\s\S]*?))?\}\}/g;

/** One card per cloze number: that blank hidden on the front, all filled in on the back. */
export function clozeCards(
  rawText: string,
  extra: string,
  html: boolean | null,
): CardPair[] {
  const numbers = [
    ...new Set([...rawText.matchAll(CLOZE)].map(m => Number(m[1]))),
  ].sort((a, b) => a - b);
  if (numbers.length === 0) return [];
  const filled = ankiFieldToText(
    rawText.replace(CLOZE, (_m, _n, answer: string) => answer),
    html,
  );
  const back = extra ? `${filled}\n${extra}` : filled;
  return numbers
    .map(n => {
      const front = rawText.replace(
        CLOZE,
        (_m, num: string, answer: string, hint?: string) =>
          Number(num) === n ? (hint ? `[${hint}]` : '[…]') : answer,
      );
      return [ankiFieldToText(front, html), back] as CardPair;
    })
    .filter(([front]) => front !== '');
}

export interface AnkiDeck {
  /** Folder names, then the deck name: "Spanish::Verbs" → ["Spanish", "Verbs"]. */
  path: string[];
  cards: CardPair[];
}

/** Cards from an Anki plain-text export, grouped by deck, in the order they first appear. */
export function parseAnki(
  fileName: string,
  text: string,
): {decks: AnkiDeck[]; warnings: string[]} {
  const warnings: string[] = [];
  const clean = text
    .replace(/^﻿/, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');

  let separator = '\t';
  let html: boolean | null = null;
  let deckCol = 0;
  let notetypeCol = 0;
  let guidCol = 0;
  let tagsCol = 0;
  let fixedNotetype = '';
  let fixedDeck = '';
  const body: string[] = [];
  let inHeader = true;
  let hasHeader = false;
  for (const line of clean.split('\n')) {
    if (inHeader && line.startsWith('#')) {
      hasHeader = true;
      const colon = line.indexOf(':');
      const key = (colon < 0 ? line : line.slice(0, colon))
        .slice(1)
        .trim()
        .toLowerCase();
      const value = colon < 0 ? '' : line.slice(colon + 1).trim();
      const col = parseInt(value, 10) || 0;
      if (key === 'separator') {
        separator = SEPARATORS[value.toLowerCase()] ?? (value[0] || '\t');
      } else if (key === 'html') {
        html = value.toLowerCase() === 'true';
      } else if (key === 'deck column') {
        deckCol = col;
      } else if (key === 'notetype column') {
        notetypeCol = col;
      } else if (key === 'guid column') {
        guidCol = col;
      } else if (key === 'tags column') {
        tagsCol = col;
      } else if (key === 'notetype') {
        fixedNotetype = value;
      } else if (key === 'deck') {
        fixedDeck = value;
      }
      continue;
    }
    inHeader = false;
    body.push(line);
  }

  const special = new Set(
    [deckCol, notetypeCol, guidCol, tagsCol].filter(c => c > 0),
  );
  // Newer exports quote fields holding the separator, a quote or a line
  // break; older ones (no header) don't quote, so a stray quote is just text.
  const rows = hasHeader
    ? readCsv(body.join('\n'), separator)
    : body.map(l => l.split(separator));

  const byDeck = new Map<string, CardPair[]>();
  let media = 0;
  let row = 0;
  for (const cells of rows) {
    row++;
    if (cells.every(c => c.trim() === '')) continue;
    const raw = cells.filter((_c, i) => !special.has(i + 1)).map(c => c.trim());
    const notetype =
      (notetypeCol > 0 ? cells[notetypeCol - 1] : fixedNotetype) ?? '';
    const deck = ((deckCol > 0 ? cells[deckCol - 1] : fixedDeck) ?? '').trim();
    media += raw.reduce((n, f) => n + (f.match(MEDIA)?.length ?? 0), 0);
    const f = raw.map(x => ankiFieldToText(x, html));

    const cards: CardPair[] = [];
    const first = raw[0] ?? '';
    if (/cloze/i.test(notetype) || CLOZE_TEST.test(first)) {
      cards.push(...clozeCards(first, f[1] ?? '', html));
    } else {
      const front = f[0] ?? '';
      const back = f[1] ?? '';
      if (front && back) {
        cards.push([front, back]);
        const reversed =
          /and reversed/i.test(notetype) ||
          (/optional reversed/i.test(notetype) && !!f[2]);
        if (reversed) cards.push([back, front]);
      }
    }
    if (cards.length === 0) {
      warnings.push(
        `${fileName} row ${row} skipped: no text on one side (image or sound only?)`,
      );
      continue;
    }
    const list = byDeck.get(deck);
    if (list) list.push(...cards);
    else byDeck.set(deck, cards);
  }
  if (media > 0)
    warnings.push(
      `${fileName}: ${media} image or sound ${
        media === 1 ? 'reference' : 'references'
      } left out (only text comes across)`,
    );

  const base = fileName.slice(fileName.lastIndexOf('/') + 1);
  const dot = base.lastIndexOf('.');
  const fileDeck = (dot > 0 ? base.slice(0, dot) : base).trim() || 'Anki';
  const decks = [...byDeck.entries()].map(([ankiDeck, cards]) => {
    const parts = ankiDeck
      .split('::')
      .map(p => p.trim().replace(/\//g, '-'))
      .filter(p => p !== '');
    return {path: parts.length ? parts : [fileDeck], cards};
  });
  return {decks, warnings};
}

// ---------------------------------------------------------------- export

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** A field for Anki: HTML (bold and italics as <b>/<i>, line breaks as <br>), quoted if needed. */
const toAnkiField = (s: string, rich = false) => {
  const html = (
    rich
      ? richRuns(s)
          .map(r => {
            let x = escapeHtml(r.text);
            if (r.italic) x = `<i>${x}</i>`;
            if (r.bold) x = `<b>${x}</b>`;
            return x;
          })
          .join('')
      : escapeHtml(s)
  ).replace(/\n/g, '<br>');
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
      [
        toAnkiField(c.id),
        'Basic',
        toAnkiField(deckName.get(c.deckId) ?? 'Default'),
        toAnkiField(c.front, true),
        toAnkiField(c.back, true),
      ].join('\t'),
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
