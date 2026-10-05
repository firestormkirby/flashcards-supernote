/**
 * Which note or document a toolbar card came from, so the editor can suggest
 * a deck named after it. Asked at button-press time like every other SDK
 * call, after the capture itself, and never allowed to fail the capture.
 */

import {PluginCommAPI} from 'sn-plugin-lib';

export async function currentFilePath(): Promise<string | undefined> {
  try {
    const res = (await PluginCommAPI.getCurrentFilePath()) as {
      success?: boolean;
      result?: unknown;
    } | null;
    return res?.success && typeof res.result === 'string' && res.result
      ? res.result
      : undefined;
  } catch (e) {
    console.log('[cards] current file path unavailable', e);
    return undefined;
  }
}
