/**
 * Holds the library in memory and saves it as JSON in the plugin's private
 * data directory (NativePluginManager.getPluginDirPath()). The file uses the
 * Android app's format, so it is a drop-in for that app's library.json.
 *
 * Saving is deliberately NOT debounced with a timer. PluginHost suspends the
 * JS timer queue while the panel is closed (state:0), so a delayed save
 * scheduled just before the user closes the panel would never run and the
 * last few reviews would be lost. Instead every change starts a write at
 * once; changes that land while a write is in flight are coalesced into one
 * follow-up write of the latest state.
 */

import RNFS from 'react-native-fs';
import {NativePluginManager} from 'sn-plugin-lib';
import {decodeLibrary, encodeLibrary} from '../core/codec';
import {EMPTY_LIBRARY, LibraryData, imageFilesOf} from '../core/model';

const FILE_NAME = 'library.json';

let data: LibraryData = EMPTY_LIBRARY;
let loaded = false;
let loadPromise: Promise<void> | null = null;
let filePath: string | null = null;
let dataDir: string | null = null;
const listeners = new Set<() => void>();

let writing = false;
let dirty = false;

export function getLibrary(): LibraryData {
  return data;
}

export function isLibraryLoaded(): boolean {
  return loaded;
}

export function subscribeLibrary(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function notify() {
  listeners.forEach(fn => {
    try {
      fn();
    } catch (e) {
      console.warn('[cards] library listener threw', e);
    }
  });
}

export function updateLibrary(
  transform: (lib: LibraryData) => LibraryData,
): void {
  const next = transform(data);
  if (next === data) return;
  data = next;
  notify();
  save();
}

/** Like updateLibrary, for transforms that also return a value (e.g. the new deck). */
export function updateLibraryAndGet<T>(
  transform: (lib: LibraryData) => [LibraryData, T],
): T {
  const [next, result] = transform(data);
  if (next !== data) {
    data = next;
    notify();
    save();
  }
  return result;
}

async function resolvePath(): Promise<string> {
  if (filePath) return filePath;
  let dir: string | null | undefined = null;
  try {
    dir = await NativePluginManager.getPluginDirPath();
  } catch (e) {
    console.warn('[cards] getPluginDirPath failed', e);
  }
  const base = dir || RNFS.DocumentDirectoryPath;
  try {
    if (!(await RNFS.exists(base))) await RNFS.mkdir(base);
  } catch (e) {
    console.warn('[cards] could not create data dir', base, e);
  }
  dataDir = base;
  filePath = `${base}/${FILE_NAME}`;
  return filePath;
}

/** Loads once; later calls return the same promise. */
export function loadLibrary(): Promise<void> {
  if (!loadPromise) {
    loadPromise = (async () => {
      const path = await resolvePath();
      try {
        if (await RNFS.exists(path)) {
          data = decodeLibrary(await RNFS.readFile(path, 'utf8'));
        }
      } catch (e) {
        // Keep the unreadable file so nothing is lost, and start fresh.
        console.warn('[cards] library unreadable, keeping a copy aside', e);
        try {
          await RNFS.moveFile(path, `${path}.unreadable-${Date.now()}`);
        } catch (_) {}
        data = EMPTY_LIBRARY;
      }
      loaded = true;
      sweepOrphanImages().catch(e =>
        console.warn('[cards] image sweep failed', e),
      );
      notify();
    })();
  }
  return loadPromise;
}

function save(): void {
  if (!loaded) return; // never overwrite the file with the empty pre-load state
  if (writing) {
    dirty = true;
    return;
  }
  writing = true;
  (async () => {
    try {
      do {
        dirty = false;
        const path = await resolvePath();
        const tmp = `${path}.tmp`;
        await RNFS.writeFile(tmp, encodeLibrary(data), 'utf8');
        if (await RNFS.exists(path)) await RNFS.unlink(path);
        await RNFS.moveFile(tmp, path);
      } while (dirty);
    } catch (e) {
      console.warn('[cards] save failed', e);
    } finally {
      writing = false;
    }
  })();
}

/** Resolves once nothing is waiting to be written. Used before closing the panel. */
export async function flushLibrary(): Promise<void> {
  for (let i = 0; i < 50 && writing; i++) {
    await new Promise<void>(resolve => setTimeout(resolve, 20));
  }
}

// ---------------------------------------------------------------- pictures

const IMAGES = 'images';

/** The folder card pictures live in, inside the plugin's private data folder. Created on demand. */
export async function imagesDir(): Promise<string> {
  await resolvePath();
  const dir = `${dataDir}/${IMAGES}`;
  try {
    if (!(await RNFS.exists(dir))) await RNFS.mkdir(dir);
  } catch (e) {
    console.warn('[cards] could not create images dir', e);
  }
  return dir;
}

/** A file:// URI for a picture, for <Image>. Valid once the library has loaded. */
export function imageUri(file: string): string {
  return `file://${dataDir ?? RNFS.DocumentDirectoryPath}/${IMAGES}/${file}`;
}

/** A fresh, unused file name in the images folder. */
export function newImageName(prefix: string, ext = 'png'): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}.${ext}`;
}

/**
 * Removes pictures no card uses any more (a deleted card, a replaced
 * picture, a capture that was cancelled). Anything newer than ten minutes is
 * left alone, so a capture still waiting in the crop screen is never swept.
 */
async function sweepOrphanImages(): Promise<void> {
  const dir = await imagesDir();
  const used = new Set(data.cards.flatMap(imageFilesOf));
  const cutoff = Date.now() - 10 * 60_000;
  for (const item of await RNFS.readDir(dir)) {
    if (!item.isFile() || used.has(item.name)) continue;
    const mtime = item.mtime ? new Date(item.mtime).getTime() : 0;
    if (mtime && mtime > cutoff) continue;
    try {
      await RNFS.unlink(item.path);
    } catch (_) {}
  }
}
