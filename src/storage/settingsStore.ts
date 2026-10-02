/**
 * Settings, kept as one small JSON blob in AsyncStorage. Ported from the
 * Android app's SettingsStore, minus what a Supernote panel has no use for
 * (bottom-bar customisation, Wi-Fi sync).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type {PracticeFilter} from '../core/library';

export type TextSize = 'small' | 'medium' | 'large';

export interface AppSettings {
  frontSize: TextSize;
  backSize: TextSize;
  shuffle: boolean;
  /** White on black instead of black on white. */
  darkMode: boolean;
  /** Folders arranged by hand rather than A–Z ("" = Home). */
  manualFolders: string[];
  /** Study with only the card on screen (tap zones instead of buttons). */
  studyFullScreen: boolean;
  showCardCount: boolean;
  showDeckCount: boolean;
  showNewCount: boolean;
  showDueCount: boolean;
  /** Practice chips: empty = All. */
  practiceFilters: PracticeFilter[];
  seenWelcome: boolean;
  seededExamples: boolean;
  seenStudyTips: boolean;
  seenPracticeTips: boolean;
  /** A gentle prompt to export a backup every `backupEveryDays` days. */
  backupReminder: boolean;
  backupEveryDays: number;
  lastBackupAt: number;
  backupPromptAt: number;
}

export const DEFAULT_SETTINGS: AppSettings = {
  frontSize: 'medium',
  backSize: 'medium',
  shuffle: true,
  darkMode: false,
  manualFolders: [],
  studyFullScreen: true,
  showCardCount: true,
  showDeckCount: true,
  showNewCount: true,
  showDueCount: true,
  practiceFilters: [],
  seenWelcome: false,
  seededExamples: false,
  seenStudyTips: false,
  seenPracticeTips: false,
  backupReminder: true,
  backupEveryDays: 30,
  lastBackupAt: 0,
  backupPromptAt: 0,
};

const KEY = 'cards:settings:v1';

let settings: AppSettings = DEFAULT_SETTINGS;
let loadPromise: Promise<void> | null = null;
const listeners = new Set<() => void>();

export function getSettings(): AppSettings {
  return settings;
}

export function subscribeSettings(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function loadSettings(): Promise<void> {
  if (!loadPromise) {
    loadPromise = (async () => {
      try {
        const raw = await AsyncStorage.getItem(KEY);
        if (raw) settings = {...DEFAULT_SETTINGS, ...JSON.parse(raw)};
      } catch (e) {
        console.warn('[cards] settings unreadable, using defaults', e);
      }
      listeners.forEach(fn => fn());
    })();
  }
  return loadPromise;
}

export function updateSettings(
  transform: (s: AppSettings) => AppSettings,
): void {
  settings = transform(settings);
  listeners.forEach(fn => fn());
  AsyncStorage.setItem(KEY, JSON.stringify(settings)).catch(e =>
    console.warn('[cards] settings save failed', e),
  );
}

export function isManual(s: AppSettings, folderId: string | null): boolean {
  return s.manualFolders.includes(folderId ?? '');
}

export function withManual(
  s: AppSettings,
  folderId: string | null,
  manual: boolean,
): AppSettings {
  const key = folderId ?? '';
  const rest = s.manualFolders.filter(k => k !== key);
  return {...s, manualFolders: manual ? [...rest, key] : rest};
}
