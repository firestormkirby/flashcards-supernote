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
  'Cards reads deck files you choose and saves exports to the EXPORT folder. ' +
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
    base.replace(/[\\/:*?"<>|]/g, '-').trim() || 'Cards'
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

/** "/storage/emulated/0/EXPORT/Cards" → "EXPORT/Cards", for messages. */
export function displayPath(path: string): string {
  return path.startsWith(STORAGE_ROOT + '/')
    ? path.slice(STORAGE_ROOT.length + 1)
    : path;
}

/** Library backups (with study progress), named "Cards backup <date>.json". */
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

export async function writeBackup(json: string): Promise<string> {
  const stem = `${EXPORT_DIR}/Cards backup ${today()}`;
  let target = `${stem}.json`;
  for (let n = 2; await RNFS.exists(target); n++)
    target = `${stem} (${n}).json`;
  if (!(await RNFS.exists(EXPORT_DIR))) await RNFS.mkdir(EXPORT_DIR);
  await RNFS.writeFile(target, json, 'utf8');
  return target;
}

export async function readText(path: string): Promise<string> {
  return RNFS.readFile(path, 'utf8');
}
