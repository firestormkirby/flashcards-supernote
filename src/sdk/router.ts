/**
 * Toolbar-button routing and the panel's open/close.
 *
 * Both buttons are registered with showType 0 and the panel is opened here
 * with showPluginView(). The lasso button needs that: its capture (reading the
 * selection and running handwriting recognition) must finish BEFORE the panel
 * opens, because NOTE clears the lasso selection once a full-screen panel has
 * focus, and PluginComm calls made while the panel is open can deadlock.
 */

import {PluginManager} from 'sn-plugin-lib';
import type {CardImage} from '../core/model';
import {flushLibrary} from '../storage/libraryStore';

export const BTN_OPEN = 100;
export const BTN_LASSO_CARD = 200;
export const BTN_DOC_TEXT_CARD = 300;
export const BTN_PAGE_PICTURE = 101;
export const BTN_LASSO_PICTURE = 201;

export interface ButtonEvent {
  id: number;
  pressEvent?: number;
  name?: string;
}

/** Something the panel should do when it next renders (e.g. open the card editor). */
export type PanelIntent =
  /** Open a new card, pre-filled (from a lasso, a text selection, or a lasso picture). */
  | {
      kind: 'newCardDraft';
      front: string;
      back: string;
      note?: string;
      frontImage?: CardImage;
    }
  /** Mark a region of a captured page, then open it as a new card. */
  | {kind: 'cropPicture'; image: CardImage};

let pendingIntent: PanelIntent | null = null;
const intentListeners = new Set<() => void>();
let installed = false;

export function installRouter(onPress: (event: ButtonEvent) => void): void {
  if (installed) return;
  installed = true;
  PluginManager.registerButtonListener({
    onButtonPress(event: ButtonEvent) {
      console.log('[cards] button press', JSON.stringify(event));
      try {
        onPress(event);
      } catch (e) {
        console.warn('[cards] button handler threw', e);
      }
    },
  });
}

export function setPanelIntent(intent: PanelIntent): void {
  pendingIntent = intent;
  intentListeners.forEach(fn => fn());
}

/** One-shot: returns and clears the pending intent. */
export function consumePanelIntent(): PanelIntent | null {
  const i = pendingIntent;
  pendingIntent = null;
  return i;
}

export function subscribePanelIntent(fn: () => void): () => void {
  intentListeners.add(fn);
  return () => {
    intentListeners.delete(fn);
  };
}

export function openPanel(): void {
  PluginManager.showPluginView().catch((e: unknown) =>
    console.warn('[cards] showPluginView failed', e),
  );
}

/** Waits for any pending save, then closes the panel back to the note. */
export async function closePanel(): Promise<void> {
  try {
    await flushLibrary();
  } catch (_) {}
  PluginManager.closePluginView().catch((e: unknown) =>
    console.warn('[cards] closePluginView failed', e),
  );
}
