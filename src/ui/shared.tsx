/** Helpers shared by several screens. */

import React from 'react';
import {View} from 'react-native';
import * as L from '../core/library';
import {DeckCounts, LibraryData, plural} from '../core/model';
import {displayPath, ensureWritePermission, writeExport} from '../sdk/files';
import {AppSettings} from '../storage/settingsStore';
import {Chip, Spacer, T} from './kit';

export function studyCount(c: DeckCounts): number {
  return c.due + c.new;
}

export function countsLine(
  c: DeckCounts,
  s: AppSettings,
  extra?: string,
): string | null {
  const parts: string[] = [];
  if (extra) parts.push(extra);
  if (s.showCardCount) parts.push(`${c.total} ${plural(c.total, 'card')}`);
  if (s.showDueCount && c.due > 0) parts.push(`${c.due} due`);
  if (s.showNewCount && c.new > 0) parts.push(`${c.new} new`);
  return parts.length ? parts.join(' · ') : null;
}

export async function exportToDevice(
  lib: LibraryData,
  folderId: string | null,
  name: string,
): Promise<{title: string; message: string}> {
  const files = L.exportFiles(lib, folderId);
  if (files.length === 0)
    return {
      title: 'Nothing to export',
      message: 'There are no decks here yet.',
    };
  if (!(await ensureWritePermission())) {
    return {
      title: "Couldn't export",
      message:
        'Flashcards needs permission to save files. Try again and choose Allow.',
    };
  }
  try {
    const dir = await writeExport(name, files);
    return {
      title: 'Exported',
      message: `${files.length} ${plural(
        files.length,
        'deck',
      )} saved to ${displayPath(
        dir,
      )}. Each deck is a text file you can edit on a computer and import again.`,
    };
  } catch (e) {
    console.warn('[cards] export failed', e);
    return {
      title: "Couldn't export",
      message: String((e as Error)?.message ?? e),
    };
  }
}

/** All / Due / New / Starred, with how many cards each choice would use. */
export function PracticeFilterPicker({
  filters,
  count,
  onChange,
}: {
  filters: L.PracticeFilter[];
  count: (f: L.PracticeFilter[]) => number;
  onChange: (f: L.PracticeFilter[]) => void;
}) {
  return (
    <View>
      <T size={14} muted>
        Which cards
      </T>
      <Spacer h={6} />
      <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 8}}>
        <Chip
          label={`All · ${count([])}`}
          selected={filters.length === 0}
          onPress={() => onChange([])}
        />
        {L.PRACTICE_FILTERS.map(({key, label}) => {
          const on = filters.includes(key);
          return (
            <Chip
              key={key}
              label={`${label} · ${count([key])}`}
              selected={on}
              onPress={() =>
                onChange(
                  on ? filters.filter(f => f !== key) : [...filters, key],
                )
              }
            />
          );
        })}
      </View>
    </View>
  );
}
