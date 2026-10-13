/**
 * "Put in note": write cards onto the note page the panel was opened over.
 *
 * Runs from the open panel, then the panel closes. That is how
 * philips/supernote-insert-screenshot-plugin inserts into a note on devices
 * (saveCurrentNote → insert → reloadFile → closePluginView); unlike the lasso
 * and page-reading calls, these don't hang while the panel is open, and JS
 * timers still run, so edits can be spaced out.
 *
 * Spacing: each edit makes NOTE reload the page, and two reloads at once can
 * crash it (seen by Tactics Board on a Manta with edits ~0.5 s apart; 1.3 s
 * never has). So inserts are at least EDIT_GAP_MS apart.
 *
 * Text goes in as one text box across the top of the page (NOTE main layer;
 * a PDF or ebook can't take text boxes, so notes only). Pictures go in with
 * insertImage, cut to their marked area by the native PictureCut module; NOTE
 * places them, and the user moves them with the lasso.
 */

import {NativeModules} from 'react-native';
import {PluginCommAPI, PluginNoteAPI} from 'sn-plugin-lib';
import {notePlan} from '../core/noteText';
import type {Card, CardImage} from '../core/model';
import {imagesDir} from '../storage/libraryStore';
import {ensureWritePermission} from './files';
import {pageSizeFor} from './lassoCard';

type Res = {success?: boolean; result?: any; error?: {message?: string}};

export const EDIT_GAP_MS = 1300;

const {FlashcardsPicture} = NativeModules as {
  FlashcardsPicture?: {
    cut(
      src: string,
      x: number,
      y: number,
      width: number,
      height: number,
    ): Promise<string>;
  };
};

const pause = (ms: number) => new Promise(done => setTimeout(done, ms));

export interface PutResult {
  ok: boolean;
  /** For the user, when something didn't go in (empty when all went well). */
  message: string;
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

/** A card picture as a PNG of exactly its marked area, ready for insertImage. */
async function pictureFile(img: CardImage): Promise<string | null> {
  const src = `${await imagesDir()}/${img.file}`;
  if (FlashcardsPicture) {
    const c = img.crop;
    return FlashcardsPicture.cut(
      src,
      c?.x ?? 0,
      c?.y ?? 0,
      c?.width ?? 0,
      c?.height ?? 0,
    );
  }
  // Without the native module, only an uncropped PNG/JPG can go in as it is.
  return !img.crop && /\.(png|jpe?g)$/i.test(img.file) ? src : null;
}

/**
 * Puts `cards` on the current note page: their text in one text box, and
 * (with `pictures`) each card's pictures. Returns what happened; the caller
 * closes the panel when it went in.
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
    const page = (await pageSizeFor(note.path, note.page)) ?? {
      width: 1404,
      height: 1872,
    };
    const plan = notePlan(cards, page);
    try {
      await PluginNoteAPI.saveCurrentNote();
    } catch (e) {
      console.warn('[cards] saveCurrentNote failed', e);
    }

    let edits = 0;
    const res = (await PluginNoteAPI.insertText({
      textContentFull: plan.text,
      textRect: plan.rect,
      fontSize: plan.fontSize,
      textAlign: 0,
      textBold: 0,
      textItalics: 0,
      textFrameWidthType: 0,
      textFrameStyle: 0,
      textEditable: 0,
    })) as Res;
    console.log('[cards] insertText', JSON.stringify(res));
    if (!res?.success) {
      return {
        ok: false,
        message: `The text couldn't be put in the note${
          res?.error?.message ? ` (${res.error.message})` : ''
        }.`,
      };
    }
    edits++;

    const missed: string[] = [];
    if (pictures) {
      for (const img of cards.flatMap(c =>
        [c.frontImage, c.backImage].filter((i): i is CardImage => !!i),
      )) {
        let file: string | null = null;
        try {
          file = await pictureFile(img);
        } catch (e) {
          console.warn('[cards] picture cut failed', e);
        }
        if (!file) {
          missed.push('a picture');
          continue;
        }
        await pause(EDIT_GAP_MS);
        const r = (await PluginNoteAPI.insertImage(file)) as Res;
        console.log('[cards] insertImage', JSON.stringify(r));
        if (r?.success) edits++;
        else missed.push('a picture');
      }
    }
    if (edits > 1) {
      // As insert-screenshot does after insertImage, so the picture shows.
      await pause(EDIT_GAP_MS);
      try {
        await PluginCommAPI.reloadFile();
      } catch (e) {
        console.warn('[cards] reloadFile failed', e);
      }
    }

    const left = cards.length - plan.included;
    const notes = [
      left > 0
        ? `${left} more ${
            left === 1 ? 'card' : 'cards'
          } wouldn't fit on this page; the first ${plan.included} went in.`
        : '',
      missed.length > 0
        ? `${missed.length} ${
            missed.length === 1 ? 'picture' : 'pictures'
          } couldn't be put in.`
        : '',
    ].filter(Boolean);
    return {ok: true, message: notes.join(' ')};
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
