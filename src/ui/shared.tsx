/** Helpers shared by several screens. */

import React, {useEffect, useState} from 'react';
import {View} from 'react-native';
import * as L from '../core/library';
import {Card, DeckCounts, LibraryData, plural} from '../core/model';
import {displayPath, ensureWritePermission, writeExport} from '../sdk/files';
import {PutResult, putCardsInNote, selectInNote} from '../sdk/noteInsert';
import {closePanelThen} from '../sdk/router';
import {AppSettings} from '../storage/settingsStore';
import {Chip, Dialog, MessageDialog, Spacer, T} from './kit';

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

/**
 * Puts cards in the note the panel was opened over, then closes the panel so
 * they can be seen. If something didn't go in (not a note, too many cards
 * for the page, a picture that failed) it says so, and closes only when it
 * did put something in.
 */
function backToNote(r: PutResult) {
  closePanelThen(async () => {
    if (r.select) await selectInNote(r.select);
  });
}

export function PutInNoteDialog({
  cards,
  pictures,
  onDismiss,
}: {
  cards: Card[];
  pictures: boolean;
  onDismiss: () => void;
}) {
  const [result, setResult] = useState<PutResult | null>(null);
  useEffect(() => {
    let alive = true;
    putCardsInNote(cards, {pictures}).then(r => {
      if (!alive) return;
      if (r.ok && !r.message) {
        // All in: back to the note, without this dialog waiting there next
        // time, with what went in lassoed, ready to drag where it's wanted.
        onDismiss();
        backToNote(r);
      } else {
        setResult(r);
      }
    });
    return () => {
      alive = false;
    };
    // Runs once, for the cards it was opened with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!result) {
    return (
      <Dialog onDismiss={() => {}}>
        <T size={18}>Putting it in your note…</T>
      </Dialog>
    );
  }
  return (
    <MessageDialog
      title={result.ok ? 'Put in your note' : "Couldn't put it in the note"}
      message={result.message}
      onDismiss={() => {
        onDismiss();
        if (result.ok) backToNote(result);
      }}
    />
  );
}
