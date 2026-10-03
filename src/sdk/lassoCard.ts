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

import {Dimensions, PixelRatio} from 'react-native';
import {PluginCommAPI, PluginFileAPI, PluginManager} from 'sn-plugin-lib';
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

/** Page size in pixels for each device, portrait. 5 = Manta (A5X2); everything else is 1404×1872. */
const MANTA = {width: 1920, height: 2560};
const A5X = {width: 1404, height: 1872};

/**
 * The full page size recognizeElements wants. Asked of the file first; a PDF
 * or EPUB open in the document reader may not answer a note-file query, so
 * then it falls back to the device's own page size, turned to match the
 * current orientation.
 */
export async function pageSizeFor(
  filePath: string,
  page: number,
): Promise<{width: number; height: number} | null> {
  try {
    const res = (await PluginFileAPI.getPageSize(filePath, page)) as Res;
    if (res?.success && res.result?.width > 0 && res.result?.height > 0) {
      return {width: res.result.width, height: res.result.height};
    }
  } catch (e) {
    console.log('[cards] getPageSize failed, using the device size', e);
  }
  let base = A5X;
  try {
    base = (await PluginManager.getDeviceType()) === 5 ? MANTA : A5X;
  } catch (_) {
    // Guess from the screen instead.
    const s = Dimensions.get('screen');
    if (Math.max(s.width, s.height) * PixelRatio.get() > 2200) base = MANTA;
  }
  const s = Dimensions.get('screen');
  return s.width > s.height ? {width: base.height, height: base.width} : base;
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
    const size = await pageSizeFor(fileRes.result, pageRes.result);
    if (!size) {
      return {
        front: '',
        back: '',
        note: "Couldn't read the page size, so the writing wasn't recognised.",
      };
    }
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
