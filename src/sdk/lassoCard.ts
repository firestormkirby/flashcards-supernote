/**
 * "Make card": lasso some handwriting (or a text box) in a note, tap the
 * lasso-toolbar button, and the recognised text opens as a new card.
 *
 * Runs entirely at button-press time, in state:0, before the panel opens.
 * A lasso-toolbar button only exists while a selection is live, so the
 * selection is still there when this starts; NOTE clears it once the panel
 * takes focus, and recognizeElements is a PluginComm call, which can deadlock
 * while the panel is open. The panel is therefore opened only after
 * recognition has finished (about 1–2 s).
 *
 * How the text becomes a card:
 *  - If it reads as exactly one card in the import formats ("front :: back",
 *    or Q:/A: lines), both sides are filled in.
 *  - Otherwise the whole text goes on the front and the back is left for the
 *    user, which is the common case: lasso the question, type the answer.
 */

import {PluginCommAPI, PluginFileAPI} from 'sn-plugin-lib';
import {parseDeck} from '../core/deckParser';

export interface LassoCardResult {
  front: string;
  back: string;
  /** Shown above the editor when something went wrong or needs checking. */
  note?: string;
}

type Res =
  | {success?: boolean; result?: any; error?: {message?: string}}
  | null
  | undefined;

export function splitRecognisedText(text: string): {
  front: string;
  back: string;
} {
  const clean = text.replace(/\r\n?/g, '\n').trim();
  const parsed = parseDeck('lasso.txt', clean);
  if (parsed.cards.length === 1 && parsed.warnings.length === 0) {
    return {front: parsed.cards[0][0], back: parsed.cards[0][1]};
  }
  return {front: clean, back: ''};
}

export async function captureLassoCard(): Promise<LassoCardResult> {
  try {
    const [fileRes, pageRes, lassoRes] = (await Promise.all([
      PluginCommAPI.getCurrentFilePath(),
      PluginCommAPI.getCurrentPageNum(),
      PluginCommAPI.getLassoElements(),
    ])) as Res[];
    const elements: any[] =
      lassoRes?.success && Array.isArray(lassoRes.result)
        ? lassoRes.result
        : [];
    if (elements.length === 0) {
      return {
        front: '',
        back: '',
        note: 'Nothing was selected, so there was no writing to read.',
      };
    }
    if (
      !fileRes?.success ||
      !fileRes.result ||
      !pageRes?.success ||
      pageRes.result == null
    ) {
      return {
        front: '',
        back: '',
        note: "Couldn't tell which page the selection was on.",
      };
    }
    // recognizeElements needs the FULL page size, not the lasso rect.
    const sizeRes = (await PluginFileAPI.getPageSize(
      fileRes.result,
      pageRes.result,
    )) as Res;
    if (!sizeRes?.success || !sizeRes.result) {
      return {
        front: '',
        back: '',
        note: "Couldn't read the page size, so the writing wasn't recognised.",
      };
    }
    const size = {width: sizeRes.result.width, height: sizeRes.result.height};
    const recRes = (await PluginCommAPI.recognizeElements(
      elements,
      size,
    )) as Res;
    for (const el of elements) {
      try {
        el?.recycle?.();
      } catch (_) {}
    }
    const text =
      recRes?.success && typeof recRes.result === 'string'
        ? recRes.result.trim()
        : '';
    if (text === '') {
      return {
        front: '',
        back: '',
        note: "The selection didn't contain any writing that could be read. Only handwriting and text boxes are recognised.",
      };
    }
    return {
      ...splitRecognisedText(text),
      note: 'Check the recognised text before saving.',
    };
  } catch (e) {
    console.warn('[cards] lasso capture failed', e);
    return {
      front: '',
      back: '',
      note: 'Reading the selection failed. You can still type the card.',
    };
  }
}
