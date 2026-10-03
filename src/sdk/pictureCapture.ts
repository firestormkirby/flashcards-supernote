/**
 * Pictures for cards, captured from what the user is reading or writing.
 *
 *  - capturePage(): renders the page on screen to a PNG, so the user can then
 *    mark a region of it (a diagram, a figure, a block of text). Documents
 *    (PDF, EPUB, …) render through PluginDocAPI.generateCurrentDocImage. Notes
 *    render through generateLayerPreviewImage, which draws the ink without the
 *    page's ruled or dotted template; generateNotePng is the fallback, since it
 *    bakes the template in. (Both choices follow sn-clipper's device findings.)
 *  - captureLassoPicture(): generateLassoPreview renders exactly what is
 *    lassoed (a drawing, a sticker, an inserted picture, handwriting), so no
 *    region needs marking at all.
 *
 * Like the other buttons, these run at button-press time in state:0, before
 * the panel opens: the lasso is cleared once the panel takes focus, and SDK
 * calls are kept out of the open panel. Nothing here needs native code: a
 * region is stored as a crop over the page image rather than cut into a new
 * file (see CardImage).
 */

import {Image} from 'react-native';
import RNFS from 'react-native-fs';
import {
  PluginCommAPI,
  PluginDocAPI,
  PluginFileAPI,
  PluginNoteAPI,
} from 'sn-plugin-lib';
import type {CardImage} from '../core/model';
import {imagesDir, newImageName} from '../storage/libraryStore';
import {ensureReadPermission} from './files';
import {pageSizeFor} from './lassoCard';

type Res = {success?: boolean; result?: any} | null | undefined;

export interface PictureResult {
  image?: CardImage;
  /** Why there is no image, in words for the user. */
  note?: string;
}

const DOC_EXTENSIONS = [
  '.pdf',
  '.epub',
  '.txt',
  '.cbz',
  '.fb2',
  '.mobi',
  '.djvu',
  '.cbr',
  '.docx',
  '.doc',
];

/** True for a file the document reader shows, rather than a note. */
export function isDocPath(path: string): boolean {
  const dot = path.lastIndexOf('.');
  return dot >= 0 && DOC_EXTENSIONS.includes(path.slice(dot).toLowerCase());
}

/** The real pixel size of an image file, or null if it can't be read. */
export function measureImage(
  path: string,
): Promise<{width: number; height: number} | null> {
  return new Promise(resolve => {
    try {
      Image.getSize(
        path.startsWith('file://') ? path : `file://${path}`,
        (width, height) =>
          resolve(width > 0 && height > 0 ? {width, height} : null),
        () => resolve(null),
      );
    } catch (_) {
      resolve(null);
    }
  });
}

async function exists(path: string): Promise<boolean> {
  try {
    return await RNFS.exists(path);
  } catch (_) {
    return false;
  }
}

export async function capturePage(): Promise<PictureResult> {
  try {
    const [fileRes, pageRes] = (await Promise.all([
      PluginCommAPI.getCurrentFilePath(),
      PluginCommAPI.getCurrentPageNum(),
    ])) as Res[];
    if (
      !fileRes?.success ||
      !fileRes.result ||
      !pageRes?.success ||
      pageRes.result == null
    ) {
      return {
        note: "Couldn't tell which page is open, so there was nothing to capture.",
      };
    }
    const file: string = fileRes.result;
    const page: number = pageRes.result;
    // Rendering reads the user's document.
    await ensureReadPermission();
    const name = newImageName('page');
    const target = `${await imagesDir()}/${name}`;
    const size = (await pageSizeFor(file, page)) ?? {width: 1404, height: 1872};

    let ok = false;
    if (isDocPath(file)) {
      const res = (await PluginDocAPI.generateCurrentDocImage(
        page,
        target,
        size,
        0,
      )) as Res;
      ok = !!res?.success;
    } else {
      try {
        const res = (await PluginNoteAPI.generateLayerPreviewImage(
          file,
          page,
          0,
          target,
        )) as Res;
        ok = !!res?.success;
      } catch (e) {
        console.log('[cards] layer preview failed, trying the full page', e);
      }
      if (!ok || !(await exists(target))) {
        const res = (await PluginFileAPI.generateNotePng({
          notePath: file,
          page,
          times: 1,
          pngPath: target,
          type: 1,
        })) as Res;
        ok = !!res?.success;
      }
    }
    if (!ok || !(await exists(target))) {
      return {
        note: "The page couldn't be captured. If Cards asked for file access, allow it and try again.",
      };
    }
    const measured = (await measureImage(target)) ?? size;
    return {
      image: {file: name, width: measured.width, height: measured.height},
    };
  } catch (e) {
    console.warn('[cards] page capture failed', e);
    return {note: 'Capturing the page failed.'};
  }
}

export async function captureLassoPicture(): Promise<PictureResult> {
  try {
    const name = newImageName('lasso');
    const target = `${await imagesDir()}/${name}`;
    const res = (await PluginCommAPI.generateLassoPreview(target)) as Res;
    // The preview may be written somewhere other than the path given; use what it reports.
    const reported: string | undefined = res?.result?.imagePath;
    const file = name;
    if (reported && reported !== target && (await exists(reported))) {
      await RNFS.copyFile(reported, target);
    }
    if (!res?.success || !(await exists(target))) {
      return {
        note: "The selection couldn't be turned into a picture. Try lassoing it again.",
      };
    }
    const rect = res.result?.rect;
    const fallback =
      rect && rect.right > rect.left && rect.bottom > rect.top
        ? {width: rect.right - rect.left, height: rect.bottom - rect.top}
        : {width: 1, height: 1};
    const measured = (await measureImage(target)) ?? fallback;
    return {image: {file, width: measured.width, height: measured.height}};
  } catch (e) {
    console.warn('[cards] lasso picture failed', e);
    return {note: 'Turning the selection into a picture failed.'};
  }
}
