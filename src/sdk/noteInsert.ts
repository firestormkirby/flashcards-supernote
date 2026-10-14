/**
 * "Put in note": write cards onto the note page the panel was opened over.
 *
 * The cards go in as elements, placed exactly: text boxes (type 500) and
 * pictures (type 200), all in ONE insertPageElements call. Then the panel
 * closes and the new block is lassoed, so it can be dragged where it's wanted
 * straight away. Each paste on a page goes below the previous one.
 *
 * The insert runs from the open panel, as philips/
 * supernote-insert-screenshot-plugin inserts into a note on devices (insert
 * calls don't hang there the way lasso and page-reading calls can); the
 * lasso waits until the panel has closed, the state the toolbar buttons'
 * lasso calls run in.
 *
 * Every edit makes NOTE reload the page, and two reloads at once can crash it
 * (Tactics Board's finding on a Manta). One insert is one edit; the panel then
 * waits EDIT_GAP_MS before closing and lassoing. If this firmware won't take
 * elements, it falls back to insertText + insertImage, spaced the same way.
 *
 * Pictures are cut to their marked area by the native PictureCut module.
 * Text boxes are NOTE main layer only, so this works in notes, not PDFs.
 */

import {NativeModules} from 'react-native';
import {PluginCommAPI, PluginNoteAPI} from 'sn-plugin-lib';
import type {Card, CardImage} from '../core/model';
import {
  CardBlock,
  NoteText,
  Rect,
  Size,
  cardBlock,
  notePlan,
  pageArea,
} from '../core/noteText';
import {imagesDir} from '../storage/libraryStore';
import {ensureWritePermission} from './files';
import {pageSizeFor} from './lassoCard';

type Res = {success?: boolean; result?: any; error?: {message?: string}};

export const EDIT_GAP_MS = 1300;
const TYPE_PICTURE = 200;
const TYPE_TEXT = 500;
const MAIN_LAYER = 0;

interface Cut {
  path: string;
  width: number;
  height: number;
  sourceWidth: number;
  sourceHeight: number;
}

const {FlashcardsPicture} = NativeModules as {
  FlashcardsPicture?: {
    cut(
      src: string,
      x: number,
      y: number,
      width: number,
      height: number,
    ): Promise<Cut>;
  };
};

const pause = (ms: number) => new Promise(done => setTimeout(done, ms));

/** Where the next paste goes on each note page, so pastes don't pile up. */
const nextTop = new Map<string, number>();

export interface PutResult {
  ok: boolean;
  /** For the user, when something didn't go in (empty when all went well). */
  message: string;
  /** What went in, to lasso once the panel has closed. */
  select?: Rect;
}

/** The current file, if it is a note (Put in note works only in notes). */
export async function currentNote(): Promise<{
  path: string;
  page: number;
} | null> {
  const [file, page] = (await Promise.all([
    PluginCommAPI.getCurrentFilePath(),
    PluginCommAPI.getCurrentPageNum(),
  ])) as Res[];
  const path: unknown = file?.success ? file.result : null;
  if (typeof path !== 'string' || !path.toLowerCase().endsWith('.note')) {
    return null;
  }
  return {path, page: typeof page?.result === 'number' ? page.result : 0};
}

/** A card picture as a PNG of exactly its marked area, ready for the note. */
async function cutPicture(img: CardImage): Promise<Cut | null> {
  const src = `${await imagesDir()}/${img.file}`;
  if (FlashcardsPicture) {
    const c = img.crop;
    const cut = await FlashcardsPicture.cut(
      src,
      c?.x ?? 0,
      c?.y ?? 0,
      c?.width ?? 0,
      c?.height ?? 0,
    );
    console.log('[cards] picture cut', JSON.stringify({card: img, cut}));
    return cut;
  }
  // Without the native module, only an uncropped PNG/JPG can go in as it is.
  return !img.crop && /\.(png|jpe?g)$/i.test(img.file)
    ? {
        path: src,
        width: img.width,
        height: img.height,
        sourceWidth: img.width,
        sourceHeight: img.height,
      }
    : null;
}

const textBoxOf = (t: NoteText) => ({
  textContentFull: t.text,
  textRect: t.rect,
  fontSize: t.fontSize,
  textAlign: 0,
  textBold: 0,
  textItalics: 0,
  textFrameWidthType: 0,
  textFrameStyle: 0,
  textEditable: 0,
});

/** The block's text boxes and pictures as note elements. */
async function elementsFor(
  block: CardBlock,
  files: {front?: string; back?: string},
  page: number,
): Promise<object[]> {
  const make = async (type: number) => {
    const res = (await PluginCommAPI.createElement(type)) as Res;
    if (!res?.success || !res.result) {
      throw new Error(res?.error?.message ?? 'createElement failed');
    }
    const el = res.result as Record<string, unknown>;
    el.type = type;
    el.layerNum = MAIN_LAYER;
    el.pageNum = page;
    return el;
  };
  const out: object[] = [];
  for (const t of block.texts) {
    const el = await make(TYPE_TEXT);
    el.textBox = textBoxOf(t);
    out.push(el);
  }
  for (const p of block.pictures) {
    const el = await make(TYPE_PICTURE);
    el.picture = {picturePath: files[p.side], rect: p.rect};
    out.push(el);
  }
  return out;
}

/** The old way, if elements don't go in: a text box, then each picture. */
async function insertOneByOne(
  block: CardBlock,
  files: {front?: string; back?: string},
): Promise<{ok: boolean; missed: number}> {
  let missed = 0;
  let first = true;
  for (const t of block.texts) {
    if (!first) await pause(EDIT_GAP_MS);
    first = false;
    const r = (await PluginNoteAPI.insertText(textBoxOf(t))) as Res;
    if (!r?.success) return {ok: false, missed};
  }
  for (const p of block.pictures) {
    const file = files[p.side];
    if (!file) {
      missed++;
      continue;
    }
    await pause(EDIT_GAP_MS);
    const r = (await PluginNoteAPI.insertImage(file)) as Res;
    if (!r?.success) missed++;
  }
  return {ok: true, missed};
}

/**
 * Puts `cards` on the current note page. One card with `pictures` goes in as
 * a block with its pictures; otherwise the cards go in as one text list.
 * Returns what happened and what to lasso; the caller closes the panel.
 */
export async function putCardsInNote(
  cards: Card[],
  {pictures}: {pictures: boolean},
): Promise<PutResult> {
  try {
    const note = await currentNote();
    if (!note) {
      return {
        ok: false,
        message:
          'Put in note works in notes. Open a note (not a PDF or ebook), then open Flashcards there and try again.',
      };
    }
    if (!(await ensureWritePermission())) {
      return {
        ok: false,
        message:
          'Flashcards needs permission to write. Try again and choose Allow.',
      };
    }
    const page: Size = (await pageSizeFor(note.path, note.page)) ?? {
      width: 1404,
      height: 1872,
    };
    const area = pageArea(page);
    const key = `${note.path}#${note.page}`;
    const start = Math.min(nextTop.get(key) ?? area.top, area.bottom);

    // Lay it out: below the last paste, or back at the top if it won't fit.
    let block: CardBlock;
    let left = 0;
    const files: {front?: string; back?: string} = {};
    let cutFailed = 0;
    const card = cards[0];
    if (pictures && cards.length === 1 && (card.frontImage || card.backImage)) {
      const sizes: {front?: Size; back?: Size} = {};
      for (const which of ['front', 'back'] as const) {
        const img = which === 'front' ? card.frontImage : card.backImage;
        if (!img) continue;
        let cut: Cut | null = null;
        try {
          cut = await cutPicture(img);
        } catch (e) {
          console.warn('[cards] picture cut failed', e);
        }
        if (cut) {
          files[which] = cut.path;
          sizes[which] = {width: cut.width, height: cut.height};
        } else {
          cutFailed++;
        }
      }
      block = cardBlock(card, page, sizes, start);
      if (block.bounds.bottom > area.bottom && start > area.top) {
        block = cardBlock(card, page, sizes, area.top);
      }
    } else {
      let plan = notePlan(cards, page, start);
      if (plan.included < cards.length && start > area.top) {
        plan = notePlan(cards, page, area.top);
      }
      left = cards.length - plan.included;
      block = {
        texts: [plan],
        pictures: [],
        bounds: plan.rect,
      };
    }

    try {
      await PluginNoteAPI.saveCurrentNote();
    } catch (e) {
      console.warn('[cards] saveCurrentNote failed', e);
    }

    let missed = cutFailed;
    let inserted = false;
    try {
      const elements = await elementsFor(block, files, note.page);
      const res = (await PluginCommAPI.insertPageElements(
        elements,
        note.page,
        MAIN_LAYER,
      )) as Res;
      console.log('[cards] insertPageElements', JSON.stringify(res));
      inserted = !!res?.success;
    } catch (e) {
      console.warn('[cards] insertPageElements failed', e);
    }
    if (!inserted) {
      // This firmware won't take elements: the old way, one at a time.
      const r = await insertOneByOne(block, files);
      console.log('[cards] inserted one by one', JSON.stringify(r));
      if (!r.ok) {
        return {ok: false, message: "The card couldn't be put in the note."};
      }
      missed += r.missed;
    }
    nextTop.set(key, block.bounds.bottom + Math.round(area.bodyFont * 0.8));
    // Let NOTE finish redrawing the page before the panel closes and the
    // block is lassoed.
    await pause(EDIT_GAP_MS);

    const notes = [
      left > 0
        ? `${left} more ${
            left === 1 ? 'card' : 'cards'
          } wouldn't fit on this page; the first ${
            cards.length - left
          } went in.`
        : '',
      missed > 0
        ? `${missed} ${
            missed === 1 ? 'picture' : 'pictures'
          } couldn't be put in.`
        : '',
    ].filter(Boolean);
    return {
      ok: true,
      message: notes.join(' '),
      // Pictures placed by insertImage aren't where the block says; only
      // lasso what is known to be there.
      select: inserted ? block.bounds : block.texts[0]?.rect,
    };
  } catch (e) {
    console.warn('[cards] put in note failed', e);
    return {
      ok: false,
      message: `Putting it in the note failed: ${String(
        (e as Error)?.message ?? e,
      )}`,
    };
  }
}

/** After the panel has closed: select what went in, ready to drag. */
export async function selectInNote(rect: Rect): Promise<void> {
  try {
    const r = (await PluginCommAPI.lassoElements(rect)) as Res;
    console.log(
      '[cards] lassoElements',
      JSON.stringify(rect),
      JSON.stringify(r),
    );
  } catch (e) {
    console.warn('[cards] lassoElements failed', e);
  }
}
