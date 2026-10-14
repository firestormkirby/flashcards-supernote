/**
 * Cards as text and pictures for a note page ("Put in note"), and where they
 * go. Pure, so it can be tested; src/sdk/noteInsert.ts does the inserting.
 *
 * A text card is one text box:
 *
 *   Q: front
 *   A: back
 *
 * which is the deck-file format, so lassoing it and tapping Make card turns
 * it back into a card. A card with pictures is a small block: "Q: front", the
 * front picture, "A: back", the back picture, one under the other. A list of
 * cards (Starred) is one text box, with [picture] for a picture-only side.
 * Bold and italic markers are dropped (a text box is one style throughout).
 *
 * Each paste goes below the previous one on the same page (the caller passes
 * `top`), so two pastes don't land on top of each other.
 */

import type {Card} from './model';
import {plainText} from './richText';

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
/** A picture takes at most this share of the page's height. */
const PICTURE_MAX_HEIGHT = 0.3;

const side = (text: string, picture: boolean) =>
  plainText(text).trim() || (picture ? '[picture]' : '');

export function cardNoteText(card: Card): string {
  return `Q: ${side(card.front, !!card.frontImage)}\nA: ${side(
    card.back,
    !!card.backImage,
  )}`;
}

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

/** The page's usable area. */
export function pageArea(page: Size): {
  left: number;
  right: number;
  top: number;
  bottom: number;
  bodyFont: number;
  minFont: number;
} {
  return {
    left: Math.round(page.width * SIDE),
    right: Math.round(page.width * (1 - SIDE)),
    top: Math.round(page.height * TOP),
    bottom: Math.round(page.height * (1 - BOTTOM)),
    bodyFont: Math.max(24, Math.round(page.width / 50)),
    minFont: Math.max(20, Math.round(page.width / 70)),
  };
}

export interface NoteText {
  text: string;
  rect: Rect;
  fontSize: number;
}

/**
 * A list of cards as one text box starting at `top`. If they don't all fit,
 * the font shrinks (to no smaller than the area's minFont), and then only the
 * first `included` cards are used.
 */
export function notePlan(
  cards: Card[],
  page: Size,
  top = pageArea(page).top,
): NoteText & {included: number} {
  const a = pageArea(page);
  const width = a.right - a.left;
  const room = a.bottom - top;
  const texts = cards.map(cardNoteText);
  for (let n = texts.length; n >= 1; n--) {
    const text = texts.slice(0, n).join('\n\n');
    for (let size = a.bodyFont; size >= a.minFont; size -= 2) {
      const h = textHeight(text, width, size);
      if (h <= room || (n === 1 && size <= a.minFont)) {
        return {
          text,
          rect: {
            left: a.left,
            top,
            right: a.right,
            bottom: top + Math.min(h, room),
          },
          fontSize: size,
          included: n,
        };
      }
    }
  }
  return {
    text: '',
    rect: {left: a.left, top, right: a.right, bottom: top},
    fontSize: a.bodyFont,
    included: 0,
  };
}

/** A picture's box: its own size where it fits, else scaled down to fit. */
export function pictureRect(
  size: Size,
  left: number,
  top: number,
  maxWidth: number,
  maxHeight: number,
): Rect {
  const s = Math.min(1, maxWidth / size.width, maxHeight / size.height);
  const w = Math.max(1, Math.round(size.width * s));
  const h = Math.max(1, Math.round(size.height * s));
  return {left, top, right: left + w, bottom: top + h};
}

export interface CardBlock {
  texts: NoteText[];
  pictures: {side: 'front' | 'back'; rect: Rect}[];
  /** Everything in the block, to lasso it afterwards. */
  bounds: Rect;
}

/**
 * One card laid out from `top` down: "Q: front", the front picture, "A:
 * back", the back picture. `pictures` gives each picture's pixel size (the
 * cut that will be inserted); a side without one has no picture.
 */
export function cardBlock(
  card: Card,
  page: Size,
  pictures: {front?: Size; back?: Size},
  top = pageArea(page).top,
): CardBlock {
  const a = pageArea(page);
  const width = a.right - a.left;
  const maxPic = Math.round(page.height * PICTURE_MAX_HEIGHT);
  const gap = Math.round(a.bodyFont * 0.5);
  const texts: NoteText[] = [];
  const pics: CardBlock['pictures'] = [];
  let y = top;
  let right = a.left;

  const addText = (text: string) => {
    const h = textHeight(text, width, a.bodyFont);
    texts.push({
      text,
      rect: {left: a.left, top: y, right: a.right, bottom: y + h},
      fontSize: a.bodyFont,
    });
    right = a.right;
    y += h;
  };
  const addPicture = (which: 'front' | 'back', size: Size) => {
    const rect = pictureRect(size, a.left, y, width, maxPic);
    pics.push({side: which, rect});
    right = Math.max(right, rect.right);
    y = rect.bottom + gap;
  };

  if (!pictures.front && !pictures.back) {
    addText(cardNoteText(card));
  } else {
    addText(`Q: ${plainText(card.front).trim()}`.trimEnd());
    if (pictures.front) addPicture('front', pictures.front);
    addText(`A: ${plainText(card.back).trim()}`.trimEnd());
    if (pictures.back) addPicture('back', pictures.back);
  }
  return {
    texts,
    pictures: pics,
    bounds: {left: a.left, top, right, bottom: y},
  };
}
