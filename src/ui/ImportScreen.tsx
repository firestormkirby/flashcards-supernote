/**
 * Bringing decks in from the device's folders, and sending them out again.
 *
 * On a computer: write decks as text files, copy them (or a folder of them)
 * onto the Supernote by USB, Partner app or cloud sync, then pick them here.
 * Each file becomes a deck and folders become folders. Importing a file again
 * after editing it updates the deck and keeps progress for unchanged cards.
 */

import React, {useEffect, useState} from 'react';
import {ScrollView, View} from 'react-native';
import {decodeLibrary, encodeLibrary} from '../core/codec';
import * as L from '../core/library';
import {imageFilesOf, plural} from '../core/model';
import {
  BROWSE_ROOTS,
  DirListing,
  displayPath,
  ensureReadPermission,
  ensureWritePermission,
  listBackups,
  listDir,
  readDeckFiles,
  readDeckFolder,
  readText,
  restorePictures,
  writeBackup,
} from '../sdk/files';
import {
  getLibrary,
  imagesDir,
  updateLibrary,
  updateLibraryAndGet,
} from '../storage/libraryStore';
import {updateSettings} from '../storage/settingsStore';
import {exportToDevice} from './shared';
import {Nav} from './nav';
import {
  Button,
  ConfirmDialog,
  Divider,
  MessageDialog,
  PAD,
  Row,
  Screen,
  SectionTitle,
  Spacer,
  T,
  ToggleRow,
  useLibrary,
  useTheme,
} from './kit';

type Mode =
  | {kind: 'menu'}
  | {kind: 'browse'; restore: boolean}
  | {kind: 'help'};

export function ImportScreen({nav}: {nav: Nav}) {
  const [mode, setMode] = useState<Mode>({kind: 'menu'});
  if (mode.kind === 'browse')
    return (
      <Browser
        restore={mode.restore}
        onClose={() => setMode({kind: 'menu'})}
        nav={nav}
      />
    );
  if (mode.kind === 'help')
    return <HowToWrite onClose={() => setMode({kind: 'menu'})} />;
  return <ImportMenu setMode={setMode} />;
}

function ImportMenu({setMode}: {setMode: (m: Mode) => void}) {
  const lib = useLibrary();
  const [message, setMessage] = useState<{
    title: string;
    message: string;
  } | null>(null);

  const exportAll = async () => {
    setMessage({
      title: 'Exporting…',
      message: 'Saving your decks as text files.',
    });
    const res = await exportToDevice(lib, null, 'Flashcards');
    if (res.title === 'Exported')
      updateSettings(s => ({...s, lastBackupAt: Date.now()}));
    setMessage(res);
  };

  const backup = async () => {
    if (!(await ensureWritePermission())) {
      setMessage({
        title: "Couldn't save",
        message:
          'Flashcards needs permission to save files. Try again and choose Allow.',
      });
      return;
    }
    try {
      const current = getLibrary();
      const files = [...new Set(current.cards.flatMap(imageFilesOf))];
      const path = await writeBackup(encodeLibrary(current), {
        dir: await imagesDir(),
        files,
      });
      updateSettings(s => ({...s, lastBackupAt: Date.now()}));
      setMessage({
        title: 'Backup saved',
        message: `Saved to ${displayPath(
          path,
        )}. It holds every card with its study progress and stars${
          files.length
            ? `, and its ${files.length} ${plural(
                files.length,
                'picture',
              )} in the images folder beside it`
            : ''
        }. Restore it from this page if you ever need to.`,
      });
    } catch (e) {
      setMessage({
        title: "Couldn't save",
        message: String((e as Error)?.message ?? e),
      });
    }
  };

  return (
    <Screen title="Import & Export" scroll>
      <SectionTitle>Import</SectionTitle>
      <T size={16}>
        Copy deck files (.txt, .csv, .md) to your Supernote, for example into
        Document or INBOX, then choose them here. Each file becomes a deck, and
        folders become folders.
      </T>
      <Spacer h={14} />
      <Button
        label="Choose files or a folder"
        primary
        onPress={() => setMode({kind: 'browse', restore: false})}
      />
      <Spacer h={10} />
      <Button
        label="How to write cards"
        onPress={() => setMode({kind: 'help'})}
      />

      <SectionTitle>Export</SectionTitle>
      <T size={16}>
        Saves every deck as a text file in a new folder inside EXPORT. Edit them
        on a computer and import them again; progress is kept for cards you
        didn't change.
      </T>
      <Spacer h={14} />
      <Button
        label={`Export all cards · ${lib.cards.length}`}
        disabled={lib.decks.length === 0}
        onPress={exportAll}
      />

      <SectionTitle>Backup</SectionTitle>
      <T size={16}>
        A backup is one file holding everything, including study progress and
        stars. Keep a copy off the device.
      </T>
      <Spacer h={14} />
      <Button label="Save a backup" onPress={backup} />
      <Spacer h={10} />
      <Button
        label="Restore a backup"
        onPress={() => setMode({kind: 'browse', restore: true})}
      />

      <Spacer h={18} />
      <T size={14} muted>
        Flashcards has no internet access. Your cards stay in the plugin's private
        storage and only leave when you export or back up.
      </T>
      {message ? (
        <MessageDialog {...message} onDismiss={() => setMessage(null)} />
      ) : null}
    </Screen>
  );
}

type Report = {title: string; summary: string; warnings: string[]};

function Browser({
  restore,
  onClose,
  nav,
}: {
  restore: boolean;
  onClose: () => void;
  nav: Nav;
}) {
  const t = useTheme();
  const [path, setPath] = useState<string | null>(null); // null = the list of top folders
  const [listing, setListing] = useState<DirListing | null>(null);
  const [backups, setBackups] = useState<{name: string; path: string}[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<Report | null>(null);
  const [mirror, setMirror] = useState(false);
  const [confirmRestore, setConfirmRestore] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setSelected([]);
    setError(null);
    if (path === null) {
      setListing(null);
      return;
    }
    (async () => {
      if (!(await ensureReadPermission())) {
        if (alive)
          setError(
            'Flashcards needs permission to read files. Go back and try again, then choose Allow.',
          );
        return;
      }
      try {
        const l = await listDir(path);
        const b = restore ? await listBackups(path) : [];
        if (alive) {
          setListing(l);
          setBackups(b);
        }
      } catch (e) {
        if (alive)
          setError(
            `Couldn't open this folder. ${String((e as Error)?.message ?? '')}`,
          );
      }
    })();
    return () => {
      alive = false;
    };
  }, [path, restore]);

  const runImport = async (files: Promise<L.IncomingFile[]>) => {
    setBusy(true);
    try {
      const incoming = await files;
      if (incoming.length === 0) {
        setReport({
          title: 'Nothing imported',
          summary: 'No deck files (.txt, .csv, .md, .tsv) were found.',
          warnings: [],
        });
        return;
      }
      const rep = updateLibraryAndGet(l =>
        L.importFiles(l, incoming, {mirror}),
      );
      setReport({
        title: 'Imported',
        summary: L.importSummary(rep),
        warnings: rep.warnings,
      });
    } catch (e) {
      setReport({
        title: "Couldn't import",
        summary: String((e as Error)?.message ?? e),
        warnings: [],
      });
    } finally {
      setBusy(false);
    }
  };

  const doRestore = async (file: string) => {
    setBusy(true);
    try {
      const lib = decodeLibrary(await readText(file));
      const pictures = [...new Set(lib.cards.flatMap(imageFilesOf))];
      const missing = await restorePictures(file, pictures, await imagesDir());
      updateLibrary(() => lib);
      setReport({
        title: 'Backup restored',
        summary: `${lib.decks.length} ${plural(lib.decks.length, 'deck')}, ${
          lib.cards.length
        } ${plural(lib.cards.length, 'card')}.`,
        warnings: missing
          ? [
              `${missing} ${plural(
                missing,
                'picture',
              )} weren't in the images folder next to the backup, so ${
                missing === 1 ? 'that card shows' : 'those cards show'
              } a blank space. Keep the backup's folder together when you copy it.`,
            ]
          : [],
      });
    } catch (e) {
      setReport({
        title: "Couldn't restore",
        summary: "That file isn't a Flashcards backup.",
        warnings: [],
      });
    } finally {
      setBusy(false);
    }
  };

  const name = path ? path.slice(path.lastIndexOf('/') + 1) : null;
  const parent =
    path && !BROWSE_ROOTS.includes(path)
      ? path.slice(0, path.lastIndexOf('/'))
      : null;

  if (report) {
    return (
      <Screen title={report.title} onBack={onClose} scroll>
        <T size={18} bold>
          {report.summary}
        </T>
        {report.warnings.length > 0 ? (
          <>
            <SectionTitle>{`${report.warnings.length} ${plural(
              report.warnings.length,
              'line',
            )} skipped`}</SectionTitle>
            {report.warnings.slice(0, 50).map((w, i) => (
              <T key={i} size={14} muted style={{marginBottom: 6}}>
                {w}
              </T>
            ))}
            {report.warnings.length > 50 ? (
              <T size={14} muted>{`…and ${
                report.warnings.length - 50
              } more`}</T>
            ) : null}
          </>
        ) : null}
        <Spacer h={24} />
        <Button label="Go to Home" primary onPress={nav.home} />
        <Spacer h={10} />
        <Button label="Import more" onPress={() => setReport(null)} />
      </Screen>
    );
  }

  return (
    <Screen
      title={restore ? 'Restore a backup' : name ?? 'Choose files'}
      subtitle={path ? displayPath(path) : 'Pick a folder on this Supernote'}
      onBack={path === null ? onClose : () => setPath(parent)}
      backLabel={path === null ? '✕' : '←'}>
      <ScrollView contentContainerStyle={{paddingBottom: 24}}>
        {path === null
          ? BROWSE_ROOTS.map((p, i) => (
              <View key={p}>
                {i > 0 ? <Divider inset={PAD} /> : null}
                <Row
                  lead="▸"
                  title={displayPath(p)}
                  bold
                  onPress={() => setPath(p)}
                  right={<T size={20}>›</T>}
                />
              </View>
            ))
          : null}
        {error ? (
          <View style={{padding: PAD}}>
            <T size={16}>{error}</T>
          </View>
        ) : null}
        {listing
          ? listing.folders.map(f => (
              <View key={f.path}>
                <Row
                  lead="▸"
                  title={f.name}
                  bold
                  onPress={() => setPath(f.path)}
                  right={<T size={20}>›</T>}
                />
                <Divider inset={PAD} />
              </View>
            ))
          : null}
        {listing && restore
          ? backups.map(b => (
              <View key={b.path}>
                <Row
                  lead="◇"
                  title={b.name}
                  onPress={() => setConfirmRestore(b.path)}
                />
                <Divider inset={PAD} />
              </View>
            ))
          : null}
        {listing && !restore
          ? listing.deckFiles.map(f => {
              const on = selected.includes(f.path);
              return (
                <View key={f.path}>
                  <Row
                    lead={on ? '☑' : '☐'}
                    title={f.name}
                    bold={on}
                    onPress={() =>
                      setSelected(s =>
                        on ? s.filter(x => x !== f.path) : [...s, f.path],
                      )
                    }
                  />
                  <Divider inset={PAD} />
                </View>
              );
            })
          : null}
        {listing &&
        listing.folders.length === 0 &&
        (restore ? backups.length === 0 : listing.deckFiles.length === 0) ? (
          <View style={{padding: PAD}}>
            <T size={16} muted>
              {restore
                ? 'No backup files (.json) in this folder.'
                : 'No deck files or folders here.'}
            </T>
          </View>
        ) : null}
      </ScrollView>

      {path !== null && !restore && listing ? (
        <View style={{padding: PAD, borderTopWidth: 2, borderTopColor: t.line}}>
          <ToggleRow
            title="Match exactly"
            subtitle="Also delete decks that aren't in what you import"
            value={mirror}
            onChange={setMirror}
          />
          <View style={{flexDirection: 'row', gap: 10}}>
            <Button
              label={busy ? 'Importing…' : 'Import this folder'}
              compact
              disabled={busy}
              style={{flex: 1}}
              onPress={() => runImport(readDeckFolder(path))}
            />
            <Button
              label={
                selected.length
                  ? `Import ${selected.length} ${plural(
                      selected.length,
                      'file',
                    )}`
                  : 'Select files'
              }
              compact
              primary
              disabled={busy || selected.length === 0}
              style={{flex: 1}}
              onPress={() => runImport(readDeckFiles(selected))}
            />
          </View>
        </View>
      ) : null}

      {confirmRestore ? (
        <ConfirmDialog
          title="Restore this backup?"
          message="Your whole library will be replaced by what's in the backup, including study progress. Cards and decks added since the backup will be lost."
          confirmLabel="Restore"
          onDismiss={() => setConfirmRestore(null)}
          onConfirm={() => doRestore(confirmRestore)}
        />
      ) : null}
    </Screen>
  );
}

function Example({children}: {children: string}) {
  const t = useTheme();
  return (
    <View
      style={{
        borderWidth: 2,
        borderColor: t.line,
        borderRadius: 8,
        padding: 12,
        marginVertical: 8,
      }}>
      <T size={15} style={{fontFamily: 'monospace'}}>
        {children}
      </T>
    </View>
  );
}

function HowToWrite({onClose}: {onClose: () => void}) {
  return (
    <Screen title="How to write cards" onBack={onClose} scroll>
      <T size={16}>
        Write cards in any plain-text app on a computer, or save a spreadsheet
        as .csv.
      </T>
      <SectionTitle>One line per card</SectionTitle>
      <T size={16}>Put :: between the front and the back.</T>
      <Example>
        {'Photosynthesis :: Turning light into food\nMitosis :: Cell division'}
      </Example>
      <SectionTitle>Longer cards</SectionTitle>
      <T size={16}>
        Start the front with Q: and the back with A:, and leave a blank line
        between cards.
      </T>
      <Example>
        {
          'Q: What are the three\nbranches of government?\nA: Legislative, executive,\nand judicial.'
        }
      </Example>
      <SectionTitle>From a spreadsheet</SectionTitle>
      <T size={16}>
        Save it as .csv. Column A is the front and column B is the back.
      </T>
      <Example>{'Front,Back\ngato,cat\nperro,dog'}</Example>
      <SectionTitle>Folders</SectionTitle>
      <T size={16}>
        Folders on your computer become folders in Flashcards. Lines that start with
        # are ignored, so you can use them as headings.
      </T>
      <SectionTitle>Getting files onto the Supernote</SectionTitle>
      <T size={16}>
        Connect by USB and copy them into Document or INBOX, use the Supernote
        Partner app, or let a cloud sync folder bring them down. Then open
        Import, choose the folder, and import.
      </T>
      <SectionTitle>From your handwriting</SectionTitle>
      <T size={16}>
        In a note, or on a PDF you've written on, lasso what you wrote and tap
        Make card in the lasso toolbar. Write “front :: back” to fill in both
        sides at once.
      </T>
      <SectionTitle>Pictures</SectionTitle>
      <T size={16}>
        Tap Picture card in the toolbar, in a PDF, an ebook or a note, then tap
        two corners of the part you want, such as a diagram or a figure. Or
        lasso a drawing, sticker or picture in a note and tap Picture card in
        the lasso toolbar. In the card editor, + Picture adds a picture to
        either side, including Supernote screenshots from the SCREENSHOT folder.
      </T>
      <SectionTitle>From a PDF or ebook</SectionTitle>
      <T size={16}>
        Select text in the document and tap Make card in the selection menu. The
        text goes on the front; type the answer, or tap Swap sides if you
        selected the answer. You can also open Flashcards from the reader's toolbar
        to study without leaving the book.
      </T>
    </Screen>
  );
}
