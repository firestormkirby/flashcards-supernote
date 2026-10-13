/**
 * Bold and italics in card text, written the way many note apps do (as in the
 * Android app's RichText.kt, Cards 1.0.6):
 *
 *   **bold**     *italics*     ***both***
 *
 * The markers stay in the stored text, so they survive export and re-import,
 * and are hidden when a card is shown. A lone asterisk ("5 * 3", "* item",
 * "footnote*") is left as it is: italics need text right after the opening
 * "*" and right before the closing one.
 *
 * The Android version uses regex lookbehind; these patterns get the same
 * matches without it (the character before an italic run is matched and put
 * back instead), so they don't depend on the JS engine supporting lookbehind.
 */

export interface Span {
  start: number;
  end: number;
  bold: boolean;
  italic: boolean;
}

export interface Styled {
  text: string;
  spans: Span[];
}

/** "**", then text that starts and ends with a non-space, then "**" not followed by "*". */
const BOLD = /\*\*(\S(?:[\s\S]*?\S)?)\*\*(?!\*)/g;
/**
 * "*" not preceded by a word character or "*", then text that starts and ends
 * with neither a space nor "*", then "*" not followed by a word character or "*".
 */
const ITALIC = /(^|[^\w*])\*([^\s*](?:[\s\S]*?[^\s*])?)\*(?![\w*])/g;

/** The text without markers, plus where bold and italic runs fall in it. */
export function parseRich(source: string): Styled {
  if (!source.includes('*')) return {text: source, spans: []};
  let out = '';
  const spans: Span[] = [];

  const italics = (text: string, bold: boolean) => {
    let last = 0;
    ITALIC.lastIndex = 0;
    for (let m = ITALIC.exec(text); m; m = ITALIC.exec(text)) {
      const before = m[1];
      out += text.slice(last, m.index) + before;
      const start = out.length;
      out += m[2];
      spans.push({start, end: out.length, bold, italic: true});
      last = m.index + m[0].length;
      // The next opening "*" may follow this closing one directly ("*a* *b*"
      // has a space; "*a**b*" has none and stays as it is, as on Android).
    }
    out += text.slice(last);
  };

  let last = 0;
  BOLD.lastIndex = 0;
  for (let m = BOLD.exec(source); m; m = BOLD.exec(source)) {
    italics(source.slice(last, m.index), false);
    const start = out.length;
    italics(m[1], true);
    spans.push({start, end: out.length, bold: true, italic: false});
    last = m.index + m[0].length;
  }
  italics(source.slice(last), false);
  return {text: out, spans};
}

/** The text with the markers removed (for lists, previews and search results). */
export function plainText(source: string): string {
  return parseRich(source).text;
}

/**
 * Runs of text with their styles, in order, ready to draw as nested <Text>.
 * Overlapping spans (italics inside bold) combine.
 */
export function richRuns(
  source: string,
): {text: string; bold: boolean; italic: boolean}[] {
  const {text, spans} = parseRich(source);
  if (spans.length === 0) return [{text, bold: false, italic: false}];
  const cuts = new Set<number>([0, text.length]);
  for (const s of spans) {
    cuts.add(s.start);
    cuts.add(s.end);
  }
  const points = [...cuts].sort((a, b) => a - b);
  const runs: {text: string; bold: boolean; italic: boolean}[] = [];
  for (let i = 0; i + 1 < points.length; i++) {
    const [a, b] = [points[i], points[i + 1]];
    if (a === b) continue;
    const covering = spans.filter(s => s.start <= a && s.end >= b);
    runs.push({
      text: text.slice(a, b),
      bold: covering.some(s => s.bold),
      italic: covering.some(s => s.italic),
    });
  }
  return runs;
}

/**
 * Wraps the selection in `marker` ("**" or "*"), or unwraps it if it is
 * already wrapped. With nothing selected, inserts an empty pair at the
 * cursor. Returns the new text and selection (around the same words).
 */
export function toggleMarker(
  text: string,
  sel: {start: number; end: number},
  marker: string,
): {text: string; selection: {start: number; end: number}} {
  const start = Math.min(sel.start, sel.end);
  const end = Math.max(sel.start, sel.end);
  const n = marker.length;
  const wrapped =
    text.slice(start - n, start) === marker &&
    text.slice(end, end + n) === marker &&
    // "*" inside "**": unwrapping italics must not eat half of a bold marker.
    !(n === 1 && text[start - 2] === '*' && text[end + 1] === '*');
  if (wrapped) {
    return {
      text:
        text.slice(0, start - n) + text.slice(start, end) + text.slice(end + n),
      selection: {start: start - n, end: end - n},
    };
  }
  return {
    text:
      text.slice(0, start) +
      marker +
      text.slice(start, end) +
      marker +
      text.slice(end),
    selection: {start: start + n, end: end + n},
  };
}
