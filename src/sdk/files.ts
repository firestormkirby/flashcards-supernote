/**
 * Reading deck files from, and exporting decks to, the device's shared folders.
 *
 * Under the plugin permission model, FILE:READ / FILE:WRITE cover six shared
 * folders as a whole (Document, EXPORT, INBOX, MyStyle, Note, SCREENSHOT) and
 * nothing outside them, so those six are the roots the import browser offers.
 * The library itself never lives here: it stays in the plugin's private data
 * folder (see libraryStore.ts). Files leave only when the user exports.
 */

import RNFS from 'react-native-fs';
import {PluginManager} from 'sn-plugin-lib';
import {isSupported} from '../core/deckParser';
import type {IncomingFile} from '../core/library';

export const STORAGE_ROOT = '/storage/emulated/0';
export const BROWSE_ROOTS = [
  'Document',
  'INBOX',
  'EXPORT',
  'MyStyle',
  'Note',
].map(n => `${STORAGE_ROOT}/${n}`);
export const EXPORT_DIR = `${STORAGE_ROOT}/EXPORT`;

const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_FILES = 2000;
const MAX_DEPTH = 16;

const PERMISSION_DESC =
  'Flashcards reads deck files you choose and saves exports to the EXPORT folder. ' +
  'Choose "Always allow" so you are not asked every time.';

async function ensureOne(permission: string): Promise<boolean> {
  try {
    if ((await PluginManager.hasPermission(permission)) === 1) return true;
    const result = await PluginManager.requestPermission(
      permission,
      PERMISSION_DESC,
    );
    return result === 1 || result === 2;
  } catch (e) {
    // Firmware without the permission system: access is simply allowed.
    console.warn('[cards] permission check failed for', permission, e);
    return true;
  }
}

export async function ensureReadPermission(): Promise<boolean> {
  return ensureOne('plugin.permission.FILE:READ');
}

export async function ensureWritePermission(): Promise<boolean> {
  return ensureOne('plugin.permission.FILE:WRITE');
}

export interface DirListing {
  folders: {name: string; path: string}[];
  deckFiles: {name: string; path: string; size: number}[];
}

const visible = (name: string) => !name.startsWith('.') && name !== '__MACOSX';
const byName = (a: {name: string}, b: {name: string}) =>
  a.name.toLowerCase().localeCompare(b.name.toLowerCase());

export async function listDir(path: string): Promise<DirListing> {
  const items = await RNFS.readDir(path);
  return {
    folders: items
      .filter(i => i.isDirectory() && visible(i.name))
      .map(i => ({name: i.name, path: i.path}))
      .sort(byName),
    deckFiles: items
      .filter(i => i.isFile() && visible(i.name) && isSupported(i.name))
      .map(i => ({name: i.name, path: i.path, size: Number(i.size) || 0}))
      .sort(byName),
  };
}

/** Every deck file under `dir`, with paths relative to it (so `dir` itself does not become a folder). */
export async function readDeckFolder(dir: string): Promise<IncomingFile[]> {
  const out: IncomingFile[] = [];
  const walk = async (path: string, prefix: string, depth: number) => {
    if (depth > MAX_DEPTH || out.length >= MAX_FILES) return;
    const listing = await listDir(path);
    for (const f of listing.deckFiles) {
      if (f.size > MAX_FILE_BYTES || out.length >= MAX_FILES) continue;
      out.push({
        path: prefix + f.name,
        content: await RNFS.readFile(f.path, 'utf8'),
      });
    }
    for (const sub of listing.folders)
      await walk(sub.path, `${prefix}${sub.name}/`, depth + 1);
  };
  await walk(dir, '', 0);
  return out;
}

export async function readDeckFiles(paths: string[]): Promise<IncomingFile[]> {
  const out: IncomingFile[] = [];
  for (const p of paths) {
    const name = p.slice(p.lastIndexOf('/') + 1);
    if (!isSupported(name)) continue;
    out.push({path: name, content: await RNFS.readFile(p, 'utf8')});
  }
  return out;
}

function today(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Writes the files into a NEW folder under EXPORT, named "<base> <date>"
 * (with a counter if that exists already). Never overwrites or deletes
 * anything, so an earlier export is never lost. Returns the folder's path.
 */
export async function writeExport(
  base: string,
  files: IncomingFile[],
): Promise<string> {
  const stem = `${EXPORT_DIR}/${
    base.replace(/[\\/:*?"<>|]/g, '-').trim() || 'Flashcards'
  } ${today()}`;
  let dir = stem;
  for (let n = 2; await RNFS.exists(dir); n++) dir = `${stem} (${n})`;
  await RNFS.mkdir(dir);
  for (const f of files) {
    const target = `${dir}/${f.path}`;
    const parent = target.slice(0, target.lastIndexOf('/'));
    if (parent !== dir) await RNFS.mkdir(parent);
    await RNFS.writeFile(target, f.content, 'utf8');
  }
  return dir;
}

/**
 * Writes one file into EXPORT as "<base> <date>.<ext>" (with a counter if
 * that exists already). Never overwrites anything. Returns the file's path.
 */
export async function writeExportFile(
  base: string,
  ext: string,
  content: string,
): Promise<string> {
  if (!(await RNFS.exists(EXPORT_DIR))) await RNFS.mkdir(EXPORT_DIR);
  const stem = `${EXPORT_DIR}/${
    base.replace(/[\\/:*?"<>|]/g, '-').trim() || 'Flashcards'
  } ${today()}`;
  let target = `${stem}.${ext}`;
  for (let n = 2; await RNFS.exists(target); n++)
    target = `${stem} (${n}).${ext}`;
  await RNFS.writeFile(target, content, 'utf8');
  return target;
}

/** "/storage/emulated/0/EXPORT/Flashcards" → "EXPORT/Flashcards", for messages. */
export function displayPath(path: string): string {
  return path.startsWith(STORAGE_ROOT + '/')
    ? path.slice(STORAGE_ROOT.length + 1)
    : path;
}

/** Library backups (with study progress), named "Flashcards backup <date>.json". */
export async function listBackups(
  path: string,
): Promise<{name: string; path: string}[]> {
  const items = await RNFS.readDir(path);
  return items
    .filter(
      i =>
        i.isFile() && i.name.toLowerCase().endsWith('.json') && visible(i.name),
    )
    .map(i => ({name: i.name, path: i.path}))
    .sort(byName);
}

/**
 * Saves a backup into EXPORT. Without pictures it is one .json file. With
 * pictures it is a folder holding that .json and an images/ folder beside it,
 * since a picture can't live inside the JSON. Never overwrites anything.
 * Returns the path of the .json.
 */
export async function writeBackup(
  json: string,
  pictures: {dir: string; files: string[]} = {dir: '', files: []},
): Promise<string> {
  if (!(await RNFS.exists(EXPORT_DIR))) await RNFS.mkdir(EXPORT_DIR);
  const stem = `Flashcards backup ${today()}`;
  if (pictures.files.length === 0) {
    let target = `${EXPORT_DIR}/${stem}.json`;
    for (let n = 2; await RNFS.exists(target); n++)
      target = `${EXPORT_DIR}/${stem} (${n}).json`;
    await RNFS.writeFile(target, json, 'utf8');
    return target;
  }
  let name = stem;
  for (let n = 2; await RNFS.exists(`${EXPORT_DIR}/${name}`); n++)
    name = `${stem} (${n})`;
  const folder = `${EXPORT_DIR}/${name}`;
  await RNFS.mkdir(`${folder}/images`);
  for (const f of pictures.files) {
    try {
      await RNFS.copyFile(`${pictures.dir}/${f}`, `${folder}/images/${f}`);
    } catch (e) {
      console.warn('[cards] backup could not copy picture', f, e);
    }
  }
  const target = `${folder}/${name}.json`;
  await RNFS.writeFile(target, json, 'utf8');
  return target;
}

/**
 * Copies the pictures a restored backup needs from the images/ folder next to
 * its .json into the plugin's images folder. Returns how many weren't found.
 */
export async function restorePictures(
  backupJsonPath: string,
  files: string[],
  intoDir: string,
): Promise<number> {
  const from = `${backupJsonPath.slice(
    0,
    backupJsonPath.lastIndexOf('/'),
  )}/images`;
  let missing = 0;
  for (const f of files) {
    const target = `${intoDir}/${f}`;
    try {
      if (await RNFS.exists(target)) continue;
      if (await RNFS.exists(`${from}/${f}`))
        await RNFS.copyFile(`${from}/${f}`, target);
      else missing++;
    } catch (e) {
      missing++;
    }
  }
  return missing;
}

export async function readText(path: string): Promise<string> {
  return RNFS.readFile(path, 'utf8');
}

/** Where pictures usually are: Supernote's own screenshots first. */
export const IMAGE_ROOTS = [
  'SCREENSHOT',
  'Document',
  'INBOX',
  'EXPORT',
  'MyStyle',
].map(n => `${STORAGE_ROOT}/${n}`);
const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.bmp'];

export function isImageName(name: string): boolean {
  const dot = name.lastIndexOf('.');
  return dot > 0 && IMAGE_EXTENSIONS.includes(name.slice(dot).toLowerCase());
}

export async function listImageDir(path: string): Promise<{
  folders: {name: string; path: string}[];
  images: {name: string; path: string}[];
}> {
  const items = await RNFS.readDir(path);
  return {
    folders: items
      .filter(i => i.isDirectory() && visible(i.name))
      .map(i => ({name: i.name, path: i.path}))
      .sort(byName),
    images: items
      .filter(i => i.isFile() && visible(i.name) && isImageName(i.name))
      .map(i => ({name: i.name, path: i.path}))
      .sort(byName),
  };
}
