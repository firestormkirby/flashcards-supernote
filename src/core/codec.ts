import {Card, CardImage, Deck, Folder, LibraryData} from './model';

/**
 * Saved-library format. Byte-for-byte the same shape as the Android app's
 * LibraryCodec (version 1), so a library.json can move between the two.
 */
const VERSION = 1;

export function encodeLibrary(data: LibraryData): string {
  return JSON.stringify({
    version: VERSION,
    folders: data.folders.map(f => ({
      id: f.id,
      parent: f.parentId,
      name: f.name,
      pos: f.position,
    })),
    decks: data.decks.map(d => ({
      id: d.id,
      folder: d.folderId,
      name: d.name,
      pos: d.position,
    })),
    cards: data.cards.map(c => ({
      id: c.id,
      deck: c.deckId,
      front: c.front,
      back: c.back,
      due: c.review.due,
      s: c.review.stability,
      d: c.review.difficulty,
      reps: c.review.reps,
      lapses: c.review.lapses,
      last: c.review.lastReview,
      star: c.starred,
      // Pictures are an addition of the Supernote edition. The Android app's
      // decoder ignores keys it doesn't know, so its files still read here and
      // these files still read there (minus the pictures).
      ...(c.frontImage ? {fimg: encodeImage(c.frontImage)} : {}),
      ...(c.backImage ? {bimg: encodeImage(c.backImage)} : {}),
    })),
  });
}

const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const num = (v: unknown): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : 0;
const list = (v: unknown): Record<string, unknown>[] =>
  Array.isArray(v) ? v.filter(x => x && typeof x === 'object') : [];

/** Throws on text that isn't a library file, so the caller can keep the original aside. */
export function decodeLibrary(text: string): LibraryData {
  const root = JSON.parse(text);
  if (!root || typeof root !== 'object' || Array.isArray(root)) {
    throw new Error('Not a library file');
  }
  const folders: Folder[] = list(root.folders)
    .filter(f => str(f.id))
    .map(f => ({
      id: str(f.id)!,
      parentId: str(f.parent),
      name: str(f.name) ?? '',
      position: num(f.pos),
    }));
  const decks: Deck[] = list(root.decks)
    .filter(d => str(d.id))
    .map(d => ({
      id: str(d.id)!,
      folderId: str(d.folder),
      name: str(d.name) ?? '',
      position: num(d.pos),
    }));
  const cards: Card[] = list(root.cards)
    .filter(c => str(c.id) && str(c.deck))
    .map(c => {
      const card: Card = {
        id: str(c.id)!,
        deckId: str(c.deck)!,
        front: str(c.front) ?? '',
        back: str(c.back) ?? '',
        review: {
          due: num(c.due),
          stability: num(c.s),
          difficulty: num(c.d),
          reps: num(c.reps),
          lapses: num(c.lapses),
          lastReview: num(c.last),
        },
        starred: c.star === true,
      };
      const fimg = decodeImage(c.fimg);
      const bimg = decodeImage(c.bimg);
      if (fimg) card.frontImage = fimg;
      if (bimg) card.backImage = bimg;
      return card;
    });
  return {folders, decks, cards};
}

function encodeImage(img: CardImage) {
  const out: Record<string, unknown> = {
    file: img.file,
    w: img.width,
    h: img.height,
  };
  if (img.crop)
    out.crop = [img.crop.x, img.crop.y, img.crop.width, img.crop.height];
  return out;
}

function decodeImage(v: unknown): CardImage | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const o = v as Record<string, unknown>;
  const file = str(o.file);
  // Only a bare file name is accepted: a path could point outside the images folder.
  if (
    !file ||
    file.includes('/') ||
    file.includes('\\') ||
    file.startsWith('.')
  )
    return undefined;
  const img: CardImage = {file, width: num(o.w), height: num(o.h)};
  if (
    Array.isArray(o.crop) &&
    o.crop.length === 4 &&
    o.crop.every(n => typeof n === 'number')
  ) {
    const [x, y, width, height] = o.crop as number[];
    if (width > 0 && height > 0) img.crop = {x, y, width, height};
  }
  return img;
}
