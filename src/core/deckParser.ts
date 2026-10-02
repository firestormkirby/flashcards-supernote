/**
 * Turns a plain-text deck file written on a computer into cards. Ported from
 * Cards' DeckParser.kt — the formats are identical, so a file written for the
 * Android app imports the same way here.
 *
 * Supported in .txt / .md / .tsv files (mix freely, one card per entry):
 *
 *   front :: back                    one card per line ("- " bullets are fine)
 *   front<TAB>back                   pasted from Excel / Numbers
 *
 *   Q: question (may continue        multi-line card; leave a blank line
 *      on following lines)           between cards
 *   A: answer
 *
 *   # Heading   or   // note         ignored
 *
 * .csv files: first column = front, second column = back
 * (comma or semicolon separated, optional header row).
 */

export type CardPair = [front: string, back: string];

export interface ParseResult {
  cards: CardPair[];
  warnings: string[];
}

export const SUPPORTED_EXTENSIONS = new Set([
  'txt',
  'md',
  'markdown',
  'text',
  'csv',
  'tsv',
]);

export function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  return dot < 0 ? '' : fileName.slice(dot + 1).toLowerCase();
}

export function isSupported(fileName: string): boolean {
  return (
    SUPPORTED_EXTENSIONS.has(extensionOf(fileName)) && !fileName.startsWith('.')
  );
}

export function parseDeck(fileName: string, text: string): ParseResult {
  const clean = text
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');
  return fileName.toLowerCase().endsWith('.csv')
    ? parseCsv(fileName, clean)
    : parseText(fileName, clean);
}

// "Q:" / "A:" markers — but never "Q ::", which is a one-line card whose front is "Q".
const Q_PREFIX = /^(q|question|front)\s*[:：](?![:：])\s?/i;
const A_PREFIX = /^(a|answer|back)\s*[:：](?![:：])\s?/i;
const LIST_MARKER = /^([-*+•]|\d+[.)])\s+/;

const take = (s: string, n: number) => s.slice(0, n);

function parseText(fileName: string, text: string): ParseResult {
  const cards: CardPair[] = [];
  const warnings: string[] = [];

  let front: string | null = null;
  let back: string | null = null;
  let field = 0; // 0 = not in a Q/A block, 1 = reading question, 2 = reading answer
  let blockStart = 0;

  const flush = () => {
    if (field !== 0) {
      const f = (front ?? '').trim();
      const b = (back ?? '').trim();
      if (f === '')
        warnings.push(`${fileName} line ${blockStart}: card has no question`);
      else if (b === '')
        warnings.push(
          `${fileName} line ${blockStart}: "${take(
            f,
            40,
          )}" has no answer (add an A: line)`,
        );
      else cards.push([f, b]);
    }
    front = null;
    back = null;
    field = 0;
  };

  text.split('\n').forEach((raw, index) => {
    const lineNo = index + 1;
    const t = raw.trim();
    const q = Q_PREFIX.exec(t);
    const a = A_PREFIX.exec(t);
    if (t === '') {
      flush();
    } else if (q) {
      flush();
      front = t.slice(q[0].length).trim();
      field = 1;
      blockStart = lineNo;
    } else if (a && field === 1) {
      back = t.slice(a[0].length).trim();
      field = 2;
    } else if (a) {
      warnings.push(
        `${fileName} line ${lineNo}: A: line without a Q: line above it`,
      );
    } else if (field === 2 && t.includes('::')) {
      // A one-line card right after an answer (no blank line in between).
      flush();
      addInline(t, fileName, lineNo, cards, warnings);
    } else if (field === 1) {
      front = `${front}\n${t}`;
    } else if (field === 2) {
      back = `${back}\n${t}`;
    } else if (t.startsWith('#') || t.startsWith('//')) {
      // heading or note
    } else {
      addInline(t, fileName, lineNo, cards, warnings);
    }
  });
  flush();
  return {cards, warnings};
}

function addInline(
  t: string,
  fileName: string,
  lineNo: number,
  cards: CardPair[],
  warnings: string[],
) {
  let pair: CardPair;
  if (t.includes('::')) {
    const stripped = t.replace(LIST_MARKER, '');
    const i = stripped.indexOf('::');
    pair = [stripped.slice(0, i).trim(), stripped.slice(i + 2).trim()];
  } else if (t.includes('\t')) {
    const i = t.indexOf('\t');
    pair = [t.slice(0, i).trim(), t.slice(i + 1).trim()];
  } else {
    warnings.push(
      `${fileName} line ${lineNo} skipped: "${take(t, 40)}" (no :: or Q:/A:)`,
    );
    return;
  }
  if (pair[0] === '' || pair[1] === '') {
    warnings.push(
      `${fileName} line ${lineNo} skipped: one side of the card is empty`,
    );
  } else {
    cards.push(pair);
  }
}

const FRONT_HEADERS = new Set([
  'front',
  'question',
  'q',
  'term',
  'word',
  'prompt',
]);
const BACK_HEADERS = new Set([
  'back',
  'answer',
  'a',
  'definition',
  'meaning',
  'response',
]);

function count(s: string, ch: string): number {
  let n = 0;
  for (const c of s) if (c === ch) n++;
  return n;
}

function parseCsv(fileName: string, text: string): ParseResult {
  const firstLine = text.split('\n')[0];
  const delimiter = count(firstLine, ';') > count(firstLine, ',') ? ';' : ',';
  const rows = readCsv(text, delimiter);
  const cards: CardPair[] = [];
  const warnings: string[] = [];
  rows.forEach((row, i) => {
    const cells = row.map(c => c.trim());
    if (cells.every(c => c === '')) return;
    if (
      i === 0 &&
      cells.length >= 2 &&
      FRONT_HEADERS.has(cells[0].toLowerCase()) &&
      BACK_HEADERS.has(cells[1].toLowerCase())
    ) {
      return;
    }
    if (cells.length < 2 || cells[0] === '' || cells[1] === '') {
      warnings.push(
        `${fileName} row ${i + 1} skipped: needs text in the first two columns`,
      );
    } else {
      cards.push([cells[0], cells[1]]);
    }
  });
  return {cards, warnings};
}

/** RFC 4180-style reader: quoted fields may contain delimiters, newlines and "" escapes. */
export function readCsv(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === delimiter) {
      row.push(cell);
      cell = '';
    } else if (c === '\n') {
      row.push(cell);
      cell = '';
      rows.push(row);
      row = [];
    } else {
      cell += c;
    }
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

const noBlankLines = (s: string) =>
  s
    .split('\n')
    .map(l => l.trim())
    .filter(l => l !== '')
    .join('\n');

/** Writes cards back out in the same format, so a deck can round-trip to a computer. */
export function formatDeck(cards: CardPair[]): string {
  let out = '';
  for (const [front, back] of cards) {
    const simple =
      !front.includes('\n') && !back.includes('\n') && !front.includes('::');
    if (simple) {
      out += `${front} :: ${back}\n`;
    } else {
      if (out !== '' && !out.endsWith('\n\n')) out += '\n';
      out += `Q: ${noBlankLines(front)}\nA: ${noBlankLines(back)}\n\n`;
    }
  }
  return out;
}
