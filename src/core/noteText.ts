/**
 * Cards as text for a note page ("Put in note"), and how big a text box that
 * text needs. Pure, so it can be tested; src/sdk/noteInsert.ts does the
 * inserting.
 *
 * Each card is written as
 *
 *   Q: front
 *   A: back
 *
 * with a blank line between cards. That is the deck-file format, so lassoing
 * a pasted card and tapping Make card turns it back into a card. Bold and
 * italic markers are dropped (a text box is one style throughout), and a side
 * that is only a picture says [picture].
 */

import type {Card} from './model';
import {plainText} from './richText';

export function cardNoteText(card: Card): string {
  const side = (text: string, picture: boolean) =>
    plainText(text).trim() || (picture ? '[picture]' : '');
  return `Q: ${side(card.front, !!card.frontImage)}\nA: ${side(
    card.back,
    !!card.backImage,
  )}`;
}

export interface Size {
  width: number;
  height: number;
}

export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Margins as a share of the page. */
const SIDE = 0.06;
const TOP = 0.06;
const BOTTOM = 0.04;
/** An average character is about this wide, as a share of the font size. */
const CHAR_WIDTH = 0.55;
const LINE_HEIGHT = 1.45;

/** About how tall `text` is in a box `width` wide at `fontSize`. */
export function textHeight(
  text: string,
  width: number,
  fontSize: number,
): number {
  const perLine = Math.max(8, Math.floor(width / (fontSize * CHAR_WIDTH)));
  const lines = text
    .split('\n')
    .reduce((n, para) => n + Math.max(1, Math.ceil(para.length / perLine)), 0);
  return Math.ceil(lines * fontSize * LINE_HEIGHT + fontSize);
}

/**
 * What to put on the page: the cards' text in a box across the top, sized to
 * fit. If they don't all fit, the font shrinks (to no smaller than
 * `minFont`), and then only the first `included` cards are used.
 */
export function notePlan(
  cards: Card[],
  page: Size,
): {text: string; rect: Rect; fontSize: number; included: number} {
  const left = Math.round(page.width * SIDE);
  const right = Math.round(page.width * (1 - SIDE));
  const top = Math.round(page.height * TOP);
  const room = Math.round(page.height * (1 - BOTTOM)) - top;
  const width = right - left;
  const bodyFont = Math.max(24, Math.round(page.width / 50));
  const minFont = Math.max(20, Math.round(page.width / 70));
  const texts = cards.map(cardNoteText);

  for (let n = texts.length; n >= 1; n--) {
    const text = texts.slice(0, n).join('\n\n');
    for (let size = bodyFont; size >= minFont; size -= 2) {
      const h = textHeight(text, width, size);
      if (h <= room || (n === 1 && size <= minFont)) {
        return {
          text,
          rect: {left, top, right, bottom: top + Math.min(h, room)},
          fontSize: size,
          included: n,
        };
      }
    }
  }
  return {
    text: '',
    rect: {left, top, right, bottom: top},
    fontSize: bodyFont,
    included: 0,
  };
}
