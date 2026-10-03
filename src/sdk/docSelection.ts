/**
 * "Make card" in the document reader (PDF, EPUB): select some printed text,
 * tap the button in the text-selection toolbar, and the selection opens as a
 * new card.
 *
 * Read at button-press time in state:0 like the lasso capture, before the
 * panel opens. getLastSelectedText() returns the most recent selection even
 * after it has been cleared, so this is less timing-sensitive than the lasso,
 * but PluginDoc calls are still kept out of the open panel.
 */

import {PluginDocAPI} from 'sn-plugin-lib';
import {LassoCardResult, splitRecognisedText} from './lassoCard';

type Res = {success?: boolean; result?: unknown} | null | undefined;

/**
 * Text selected in a PDF keeps the page's hard line breaks, and words split
 * across lines keep their hyphen. Rejoin those so the card reads as written,
 * while keeping blank-line paragraph breaks.
 */
export function cleanSelectedText(raw: string): string {
  return raw
    .replace(/\r\n?/g, '\n')
    .replace(/\u00AD/g, '') // soft hyphens
    .split(/\n\s*\n/)
    .map(para =>
      para
        // "photo-\nsynthesis" → "photosynthesis". Explicit Latin ranges rather
        // than \p{L}: Unicode property escapes aren't certain on Hermes.
        .replace(
          /([A-Za-z\u00C0-\u024F])-\n([a-z\u00DF-\u00FF\u0100-\u024F])/g,
          '$1$2',
        )
        .replace(/-\n\s*/g, '-') // any other line-end hyphen is a real one: "Franco-\nPrussian"
        .replace(/\s*\n\s*/g, ' ')
        .replace(/[ \t]+/g, ' ')
        .trim(),
    )
    .filter(p => p !== '')
    .join('\n\n');
}

export async function captureDocSelection(): Promise<LassoCardResult> {
  try {
    const res = (await PluginDocAPI.getLastSelectedText()) as Res;
    const text =
      res?.success && typeof res.result === 'string'
        ? cleanSelectedText(res.result)
        : '';
    if (text === '') {
      return {
        front: '',
        back: '',
        note: 'No selected text came through. Select some text in the document first, then tap Make card.',
      };
    }
    const split = splitRecognisedText(text);
    return {
      ...split,
      note: split.back
        ? 'Made from the selected text. Check both sides before saving.'
        : 'Made from the selected text. Type the answer on the back, or tap Swap sides if you selected the answer.',
    };
  } catch (e) {
    console.warn('[cards] reading the document selection failed', e);
    return {
      front: '',
      back: '',
      note: 'Reading the selection failed. You can still type the card.',
    };
  }
}
