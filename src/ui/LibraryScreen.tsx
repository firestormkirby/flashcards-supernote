/**
 * Home and every folder: the folders and decks inside, with counts, a ▶ menu
 * to study or practice everything here, and per-item actions (rename, move,
 * export, reset, delete) from each row's ⋮ or a long press.
 */

import React, {useMemo, useState} from 'react';
import {FlatList, View} from 'react-native';
import * as L from '../core/library';
import {Deck, DeckCounts, Folder, LibraryData, plural} from '../core/model';
import {updateLibrary, updateLibraryAndGet} from '../storage/libraryStore';
import {isManual, updateSettings, withManual} from '../storage/settingsStore';
import {Nav} from './nav';
import {
  ActionsDialog,
  BarButton,
  Button,
  ConfirmDialog,
  Dialog,
  Divider,
  EmptyState,
  MessageDialog,
  PAD,
  Row,
  Screen,
  Spacer,
  T,
  TextInputDialog,
  useLibrary,
  useNow,
  useSettings,
} from './kit';
import {
  PracticeFilterPicker,
  countsLine,
  exportToDevice,
  studyCount,
} from './shared';

type Item = {kind: 'folder'; folder: Folder} | {kind: 'deck'; deck: Deck};

type Dlg =
  | {kind: 'actions'; item: Item}
  | {kind: 'rename'; item: Item}
  | {kind: 'delete'; item: Item}
  | {kind: 'reset'; item: Item | null}
  | {kind: 'menu'}
  | {kind: 'study'}
  | {kind: 'newFolder'}
  | {kind: 'newDeck'}
  | {kind: 'message'; title: string; message: string};

function sumCounts(
  lib: LibraryData,
  folderId: string,
  perDeck: Map<string, DeckCounts>,
): DeckCounts {
  const total = {total: 0, due: 0, new: 0};
  for (const d of L.decksUnder(lib, folderId)) {
    const c = perDeck.get(d.id);
    if (c) {
      total.total += c.total;
      total.due += c.due;
      total.new += c.new;
    }
  }
  return total;
}

export function LibraryScreen({
  folderId,
  nav,
}: {
  folderId: string | null;
  nav: Nav;
}) {
  const lib = useLibrary();
  const settings = useSettings();
  const now = useNow();
  const [dlg, setDlg] = useState<Dlg | null>(null);
  const [arranging, setArranging] = useState(false);
  const folder = L.findFolder(lib, folderId);
  const manual = isManual(settings, folderId);

  const perDeck = useMemo(() => L.countsByDeck(lib, now), [lib, now]);
  const items: Item[] = useMemo(
    () => [
      ...L.orderedFolders(lib, folderId, manual || arranging).map(f => ({
        kind: 'folder' as const,
        folder: f,
      })),
      ...L.orderedDecks(lib, folderId, manual || arranging).map(d => ({
        kind: 'deck' as const,
        deck: d,
      })),
    ],
    [lib, folderId, manual, arranging],
  );

  if (folderId !== null && !folder) {
    // The folder was deleted or moved away.
    return (
      <EmptyState
        title="Folder not found"
        children={<Button label="Back" onPress={nav.back} />}
      />
    );
  }

  const here = L.deckIdsUnder(lib, folderId);
  const title = folder ? folder.name : 'Cards';
  const subtitle = folder
    ? L.folderPath(lib, folder.parentId).replace(/\//g, ' / ') || 'Home'
    : null;
  const name = (item: Item) =>
    item.kind === 'folder' ? item.folder.name : item.deck.name;
  const idOf = (item: Item) =>
    item.kind === 'folder' ? item.folder.id : item.deck.id;

  const startArranging = () => {
    // Freeze whatever order is on screen as the hand-arranged order, then nudge from there.
    if (!manual) updateLibrary(l => L.sortByName(l, folderId));
    updateSettings(s => withManual(s, folderId, true));
    setArranging(true);
  };

  const runExport = async (fid: string | null, label: string) => {
    setDlg({
      kind: 'message',
      title: 'Exporting…',
      message: 'Saving your decks as text files.',
    });
    setDlg({kind: 'message', ...(await exportToDevice(lib, fid, label))});
  };

  const itemActions = (item: Item) => {
    const actions: {
      label: string;
      onPress: () => void;
      destructive?: boolean;
    }[] = [
      {label: 'Rename', onPress: () => setDlg({kind: 'rename', item})},
      {
        label: 'Move',
        onPress: () =>
          nav.go({
            name: 'moveItems',
            deckIds: item.kind === 'deck' ? [item.deck.id] : [],
            folderIds: item.kind === 'folder' ? [item.folder.id] : [],
          }),
      },
      {label: 'Arrange', onPress: startArranging},
      {
        label: 'Export',
        onPress: () =>
          item.kind === 'folder'
            ? runExport(item.folder.id, item.folder.name)
            : exportDeck(item.deck),
      },
      {label: 'Reset progress', onPress: () => setDlg({kind: 'reset', item})},
      {
        label: 'Delete',
        onPress: () => setDlg({kind: 'delete', item}),
        destructive: true,
      },
    ];
    return actions;
  };

  const exportDeck = async (deck: Deck) => {
    const only: LibraryData = {
      folders: [],
      decks: [{...deck, folderId: null}],
      cards: L.cardsOf(lib, deck.id),
    };
    setDlg({kind: 'message', ...(await exportToDevice(only, null, deck.name))});
  };

  const renderItem = ({item, index}: {item: Item; index: number}) => {
    const sameKind = items.filter(i => i.kind === item.kind);
    const pos = sameKind.indexOf(item);
    const right = arranging ? (
      <View style={{flexDirection: 'row'}}>
        <BarButton
          label="▲"
          accessibilityLabel={`Move ${name(item)} up`}
          onPress={() =>
            pos > 0 && updateLibrary(l => L.shift(l, folderId, idOf(item), -1))
          }
        />
        <BarButton
          label="▼"
          accessibilityLabel={`Move ${name(item)} down`}
          onPress={() =>
            pos < sameKind.length - 1 &&
            updateLibrary(l => L.shift(l, folderId, idOf(item), 1))
          }
        />
      </View>
    ) : (
      <BarButton
        label="⋮"
        accessibilityLabel={`${name(item)} options`}
        onPress={() => setDlg({kind: 'actions', item})}
      />
    );
    const row =
      item.kind === 'folder' ? (
        <Row
          lead="▸"
          title={item.folder.name}
          bold
          subtitle={countsLine(
            sumCounts(lib, item.folder.id, perDeck),
            settings,
            settings.showDeckCount
              ? `${L.decksUnder(lib, item.folder.id).length} ${plural(
                  L.decksUnder(lib, item.folder.id).length,
                  'deck',
                )}`
              : undefined,
          )}
          onPress={
            arranging
              ? undefined
              : () => nav.go({name: 'folder', id: item.folder.id})
          }
          onLongPress={
            arranging ? undefined : () => setDlg({kind: 'actions', item})
          }
          right={right}
        />
      ) : (
        <Row
          lead="▭"
          title={item.deck.name}
          subtitle={countsLine(
            perDeck.get(item.deck.id) ?? {total: 0, due: 0, new: 0},
            settings,
          )}
          onPress={
            arranging
              ? undefined
              : () => nav.go({name: 'deck', id: item.deck.id})
          }
          onLongPress={
            arranging ? undefined : () => setDlg({kind: 'actions', item})
          }
          right={right}
        />
      );
    return (
      <View>
        {index > 0 ? <Divider inset={PAD} /> : null}
        {row}
      </View>
    );
  };

  const c = L.counts(lib, here, now);
  const actions = arranging ? (
    <>
      <BarButton
        label="A–Z"
        accessibilityLabel="Sort A to Z"
        onPress={() => updateLibrary(l => L.sortByName(l, folderId))}
      />
      <BarButton label="Done" onPress={() => setArranging(false)} />
    </>
  ) : (
    <>
      {here.size > 0 ? (
        <BarButton
          label="▶"
          accessibilityLabel="Study and practice"
          onPress={() => setDlg({kind: 'study'})}
        />
      ) : null}
      <BarButton
        label="⋮"
        accessibilityLabel="More"
        onPress={() => setDlg({kind: 'menu'})}
      />
    </>
  );

  return (
    <Screen
      title={title}
      subtitle={subtitle}
      onBack={folder ? nav.back : null}
      actions={actions}>
      {items.length === 0 ? (
        <EmptyState
          title={folder ? 'This folder is empty' : 'No decks yet'}
          message="Tap + New to write a deck, or Import to bring in decks from your device.">
          <Button
            label="New deck"
            primary
            onPress={() => setDlg({kind: 'newDeck'})}
          />
          <Spacer />
          <Button
            label="New folder"
            onPress={() => setDlg({kind: 'newFolder'})}
          />
        </EmptyState>
      ) : (
        <FlatList
          data={items}
          keyExtractor={i => `${i.kind}:${idOf(i)}`}
          renderItem={renderItem}
          ListHeaderComponent={
            arranging ? (
              <View style={{padding: PAD, paddingBottom: 6}}>
                <T size={15} muted>
                  Use ▲ ▼ to change the order, or A–Z to sort by name. Folders
                  stay above decks.
                </T>
              </View>
            ) : folder && settings.showCardCount ? (
              <View style={{paddingHorizontal: PAD, paddingTop: 12}}>
                <T size={14} muted>
                  {countsLine(c, settings)}
                </T>
              </View>
            ) : null
          }
          ListFooterComponent={<View style={{height: 40}} />}
        />
      )}

      {dlg?.kind === 'actions' ? (
        <ActionsDialog
          title={name(dlg.item)}
          actions={itemActions(dlg.item)}
          onDismiss={() => setDlg(null)}
        />
      ) : null}

      {dlg?.kind === 'menu' ? (
        <ActionsDialog
          title={title}
          onDismiss={() => setDlg(null)}
          actions={[
            {label: 'New deck', onPress: () => setDlg({kind: 'newDeck'})},
            {label: 'New folder', onPress: () => setDlg({kind: 'newFolder'})},
            {
              label: 'New card',
              onPress: () =>
                nav.go({
                  name: 'editCard',
                  deckId: null,
                  cardId: null,
                  folderHint: folderId,
                }),
            },
            ...(items.length > 1
              ? [{label: 'Arrange', onPress: startArranging}]
              : []),
            ...(manual
              ? [
                  {
                    label: 'Back to A–Z order',
                    onPress: () =>
                      updateSettings(s => withManual(s, folderId, false)),
                  },
                ]
              : []),
            ...(folder
              ? [
                  {
                    label: 'Rename folder',
                    onPress: () =>
                      setDlg({kind: 'rename', item: {kind: 'folder', folder}}),
                  },
                  {
                    label: 'Export folder',
                    onPress: () => runExport(folder.id, folder.name),
                  },
                  {
                    label: 'Reset progress',
                    onPress: () =>
                      setDlg({kind: 'reset', item: {kind: 'folder', folder}}),
                  },
                  {
                    label: 'Delete folder',
                    destructive: true,
                    onPress: () =>
                      setDlg({kind: 'delete', item: {kind: 'folder', folder}}),
                  },
                ]
              : []),
          ]}
        />
      ) : null}

      {dlg?.kind === 'study' ? (
        <StudyMenu
          lib={lib}
          deckIds={here}
          title={title}
          now={now}
          onDismiss={() => setDlg(null)}
          nav={nav}
        />
      ) : null}

      {dlg?.kind === 'newFolder' || dlg?.kind === 'newDeck' ? (
        <TextInputDialog
          title={dlg.kind === 'newFolder' ? 'New folder' : 'New deck'}
          initial=""
          confirmLabel="Create"
          validate={v =>
            L.nameTakenInFolder(lib, folderId, v)
              ? 'That name is already used here'
              : null
          }
          onDismiss={() => setDlg(null)}
          onConfirm={v => {
            setDlg(null);
            if (dlg.kind === 'newFolder')
              updateLibrary(l => L.addFolder(l, folderId, v));
            else
              nav.go({
                name: 'deck',
                id: updateLibraryAndGet(l => L.addDeck(l, folderId, v)).id,
              });
          }}
        />
      ) : null}

      {dlg?.kind === 'rename' ? (
        <TextInputDialog
          title={dlg.item.kind === 'folder' ? 'Rename folder' : 'Rename deck'}
          initial={name(dlg.item)}
          confirmLabel="Rename"
          validate={v =>
            L.nameTakenInFolder(
              lib,
              dlg.item.kind === 'folder'
                ? dlg.item.folder.parentId
                : dlg.item.deck.folderId,
              v,
              idOf(dlg.item),
            )
              ? 'That name is already used here'
              : null
          }
          onDismiss={() => setDlg(null)}
          onConfirm={v => {
            const item = dlg.item;
            setDlg(null);
            updateLibrary(l =>
              item.kind === 'folder'
                ? L.renameFolder(l, item.folder.id, v)
                : L.renameDeck(l, item.deck.id, v),
            );
          }}
        />
      ) : null}

      {dlg?.kind === 'delete' ? (
        <ConfirmDialog
          title={`Delete ${name(dlg.item)}?`}
          message={
            dlg.item.kind === 'folder'
              ? `This deletes the folder and everything inside it: ${
                  L.decksUnder(lib, dlg.item.folder.id).length
                } decks and their cards. This can't be undone.`
              : `This deletes the deck and its ${
                  L.cardsOf(lib, dlg.item.deck.id).length
                } cards. This can't be undone.`
          }
          confirmLabel="Delete"
          onDismiss={() => setDlg(null)}
          onConfirm={() => {
            const item = dlg.item;
            updateLibrary(l =>
              item.kind === 'folder'
                ? L.deleteFolder(l, item.folder.id)
                : L.deleteDeck(l, item.deck.id),
            );
            if (item.kind === 'folder' && item.folder.id === folderId)
              nav.back();
          }}
        />
      ) : null}

      {dlg?.kind === 'reset' && dlg.item ? (
        <ConfirmDialog
          title="Reset progress?"
          message={`Every card in ${name(
            dlg.item,
          )} goes back to new, and its review schedule is cleared. The cards themselves stay.`}
          confirmLabel="Reset"
          onDismiss={() => setDlg(null)}
          onConfirm={() => {
            const item = dlg.item!;
            updateLibrary(l =>
              item.kind === 'folder'
                ? L.resetFolder(l, item.folder.id)
                : L.resetDeck(l, item.deck.id),
            );
          }}
        />
      ) : null}

      {dlg?.kind === 'message' ? (
        <MessageDialog
          title={dlg.title}
          message={dlg.message}
          onDismiss={() => setDlg(null)}
        />
      ) : null}
    </Screen>
  );
}

/** The ▶ menu: Study or Practice everything in this folder (and its sub-folders). */
function StudyMenu({
  lib,
  deckIds,
  title,
  now,
  onDismiss,
  nav,
}: {
  lib: LibraryData;
  deckIds: Set<string>;
  title: string;
  now: number;
  onDismiss: () => void;
  nav: Nav;
}) {
  const settings = useSettings();
  const filters = settings.practiceFilters;
  const studyN = studyCount(L.counts(lib, deckIds, now, filters));
  const practiceN = L.practiceCards(lib, deckIds, filters, now).length;
  const ids = [...deckIds];
  return (
    <Dialog onDismiss={onDismiss}>
      <T size={20} bold>
        Study & Practice
      </T>
      <T size={14} muted>
        Everything in {title}
      </T>
      <Spacer h={16} />
      <Button
        label={studyN > 0 ? `Study · ${studyN}` : 'Nothing to study'}
        primary
        disabled={studyN === 0}
        onPress={() => {
          onDismiss();
          nav.go({
            name: 'study',
            deckIds: ids,
            title,
            practice: false,
            filters,
          });
        }}
      />
      <Spacer h={10} />
      <Button
        label={`Practice · ${practiceN}`}
        disabled={practiceN === 0}
        onPress={() => {
          onDismiss();
          const cardIds = L.practiceCards(
            lib,
            deckIds,
            filters,
            Date.now(),
          ).map(c => c.id);
          nav.go({
            name: 'study',
            deckIds: ids,
            title,
            practice: true,
            cardIds,
            filters: [],
          });
        }}
      />
      <Spacer h={12} />
      <PracticeFilterPicker
        filters={filters}
        count={f => L.practiceCards(lib, deckIds, f, now).length}
        onChange={f => updateSettings(s => ({...s, practiceFilters: f}))}
      />
      <Spacer h={16} />
      <Button label="Cancel" compact onPress={onDismiss} />
    </Dialog>
  );
}

/** "+ New": choose card, deck, or folder, then name it. */
export function NewItemFlow({
  parentId,
  onDismiss,
  onCreatedDeck,
  onNewCard,
}: {
  parentId: string | null;
  onDismiss: () => void;
  onCreatedDeck: (deckId: string) => void;
  onNewCard: () => void;
}) {
  const lib = useLibrary();
  const [kind, setKind] = useState<'folder' | 'deck' | null>(null);
  if (kind === null) {
    return (
      <ActionsDialog
        title="New"
        onDismiss={onDismiss}
        actions={[
          {label: 'Card', onPress: onNewCard},
          {label: 'Deck', onPress: () => setKind('deck')},
          {label: 'Folder', onPress: () => setKind('folder')},
        ]}
        dismissOnSelect={false}
      />
    );
  }
  return (
    <TextInputDialog
      title={kind === 'folder' ? 'New folder' : 'New deck'}
      initial=""
      confirmLabel="Create"
      validate={v =>
        L.nameTakenInFolder(lib, parentId, v)
          ? 'That name is already used here'
          : null
      }
      onDismiss={onDismiss}
      onConfirm={v => {
        if (kind === 'folder') {
          updateLibrary(l => L.addFolder(l, parentId, v));
          onDismiss();
        } else {
          onCreatedDeck(updateLibraryAndGet(l => L.addDeck(l, parentId, v)).id);
        }
      }}
    />
  );
}
