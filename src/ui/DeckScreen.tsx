/**
 * A deck at a glance (counts, Study, Practice, which cards to use) and, one
 * tap further, every card in it. The cards live on their own page so the
 * answers aren't sitting in view on the deck page.
 */

import React, {useState} from 'react';
import {FlatList, ScrollView, View} from 'react-native';
import {formatInterval} from '../core/fsrs';
import * as L from '../core/library';
import {plural, sideLabel} from '../core/model';
import {updateLibrary} from '../storage/libraryStore';
import {updateSettings} from '../storage/settingsStore';
import {PracticeFilterPicker, exportToDevice, studyCount} from './shared';
import {Nav} from './nav';
import {
  ActionsDialog,
  BarButton,
  Button,
  ConfirmDialog,
  EmptyState,
  MessageDialog,
  PAD,
  Row,
  RowSeparator,
  Screen,
  Spacer,
  T,
  TextInputDialog,
  useLibrary,
  useNow,
  useSettings,
} from './kit';
import {StudyTipsDialog} from './Dialogs';

type Dlg =
  | 'menu'
  | 'rename'
  | 'reset'
  | 'delete'
  | 'tips'
  | {title: string; message: string};

export function DeckScreen({deckId, nav}: {deckId: string; nav: Nav}) {
  const lib = useLibrary();
  const settings = useSettings();
  const now = useNow();
  const [dlg, setDlg] = useState<Dlg | null>(null);
  const deck = L.findDeck(lib, deckId);
  if (!deck) {
    return (
      <EmptyState
        title="Deck not found"
        children={<Button label="Back" onPress={nav.back} />}
      />
    );
  }
  const ids = new Set([deckId]);
  const cards = L.cardsOf(lib, deckId);
  const c = L.counts(lib, ids, now);
  const starred = cards.filter(x => x.starred).length;
  const filters = settings.practiceFilters;
  const studyN = studyCount(L.counts(lib, ids, now, filters));
  const practiceN = L.practiceCards(lib, ids, filters, now).length;
  const next = studyN === 0 && c.total > 0 ? L.nextDue(lib, ids) : null;
  const where = L.folderChain(lib, deck.folderId)
    .map(f => f.name)
    .join(' / ');

  const summary = [`${starred} starred`];
  if (settings.showDueCount) summary.push(`${c.due} due`);
  if (settings.showNewCount) summary.push(`${c.new} new`);

  return (
    <Screen
      title={deck.name}
      subtitle={where || null}
      onBack={nav.back}
      actions={
        <>
          <BarButton
            label="Shuffle"
            accessibilityLabel={
              settings.shuffle ? 'Shuffle is on' : 'Shuffle is off'
            }
            selected={settings.shuffle}
            onPress={() => updateSettings(s => ({...s, shuffle: !s.shuffle}))}
          />
          <BarButton
            label="⋮"
            accessibilityLabel="More"
            onPress={() => setDlg('menu')}
          />
        </>
      }>
      <ScrollView contentContainerStyle={{padding: PAD, alignItems: 'stretch'}}>
        <Spacer h={20} />
        <T size={52} bold center>
          {c.total}
        </T>
        <T size={17} center>
          {plural(c.total, 'card')}
        </T>
        <Spacer h={6} />
        <T size={14} muted center>
          {summary.join(' · ')}
        </T>
        <Spacer h={28} />
        <Button
          label={studyN > 0 ? `Study · ${studyN}` : 'Nothing to study'}
          primary
          disabled={studyN === 0}
          onPress={() =>
            nav.go({
              name: 'study',
              deckIds: [deckId],
              title: deck.name,
              practice: false,
              filters,
            })
          }
        />
        {next !== null ? (
          <T size={14} muted center style={{marginTop: 6}}>
            {`Next review in ${formatInterval(next - now)}`}
          </T>
        ) : null}
        <Spacer h={10} />
        <Button
          label={`Practice · ${practiceN}`}
          disabled={practiceN === 0}
          onPress={() => {
            const cardIds = L.practiceCards(lib, ids, filters, Date.now()).map(
              x => x.id,
            );
            nav.go({
              name: 'study',
              deckIds: [deckId],
              title: deck.name,
              practice: true,
              cardIds,
              filters: [],
            });
          }}
        />
        <Spacer h={14} />
        <PracticeFilterPicker
          filters={filters}
          count={f => L.practiceCards(lib, ids, f, now).length}
          onChange={f => updateSettings(s => ({...s, practiceFilters: f}))}
        />
        <Spacer h={16} />
        <T size={14} muted>
          Study shows cards when they're due and spaces out your reviews.
          Practice goes through cards any time without changing that schedule.
        </T>
        <Spacer h={28} />
        {cards.length === 0 ? (
          <>
            <T size={17} muted center>
              No cards yet
            </T>
            <Spacer />
            <Button
              label="Write a card"
              onPress={() => nav.go({name: 'editCard', deckId, cardId: null})}
            />
          </>
        ) : (
          <Button
            label="See all cards"
            onPress={() => nav.go({name: 'allCards', deckId})}
          />
        )}
        <Spacer h={40} />
      </ScrollView>

      {dlg === 'menu' ? (
        <ActionsDialog
          title={deck.name}
          onDismiss={() => setDlg(null)}
          actions={[
            {
              label: 'New card',
              onPress: () => nav.go({name: 'editCard', deckId, cardId: null}),
            },
            {label: 'Rename deck', onPress: () => setDlg('rename')},
            {
              label: 'Move deck',
              onPress: () =>
                nav.go({name: 'moveItems', deckIds: [deckId], folderIds: []}),
            },
            {
              label: 'Export deck',
              onPress: async () =>
                setDlg(
                  await exportToDevice(
                    {folders: [], decks: [{...deck, folderId: null}], cards},
                    null,
                    deck.name,
                  ),
                ),
            },
            {label: 'Full-screen tips', onPress: () => setDlg('tips')},
            {label: 'Reset progress', onPress: () => setDlg('reset')},
            {
              label: 'Delete deck',
              onPress: () => setDlg('delete'),
              destructive: true,
            },
          ]}
        />
      ) : null}
      {dlg === 'rename' ? (
        <TextInputDialog
          title="Rename deck"
          initial={deck.name}
          confirmLabel="Rename"
          validate={v =>
            L.nameTakenInFolder(lib, deck.folderId, v, deck.id)
              ? 'That name is already used here'
              : null
          }
          onDismiss={() => setDlg(null)}
          onConfirm={v => {
            setDlg(null);
            updateLibrary(l => L.renameDeck(l, deckId, v));
          }}
        />
      ) : null}
      {dlg === 'reset' ? (
        <ConfirmDialog
          title="Reset progress?"
          message="Every card in this deck goes back to new, and its review schedule is cleared. The cards themselves stay."
          confirmLabel="Reset"
          onDismiss={() => setDlg(null)}
          onConfirm={() => updateLibrary(l => L.resetDeck(l, deckId))}
        />
      ) : null}
      {dlg === 'delete' ? (
        <ConfirmDialog
          title={`Delete ${deck.name}?`}
          message={`This deletes the deck and its ${cards.length} ${plural(
            cards.length,
            'card',
          )}. This can't be undone.`}
          confirmLabel="Delete"
          onDismiss={() => setDlg(null)}
          onConfirm={() => {
            nav.back();
            updateLibrary(l => L.deleteDeck(l, deckId));
          }}
        />
      ) : null}
      {dlg === 'tips' ? (
        <StudyTipsDialog practice={null} onOkay={() => setDlg(null)} />
      ) : null}
      {dlg && typeof dlg === 'object' ? (
        <MessageDialog
          title={dlg.title}
          message={dlg.message}
          onDismiss={() => setDlg(null)}
        />
      ) : null}
    </Screen>
  );
}

/** Every card in a deck: tap to edit, ★ to star. */
export function AllCardsScreen({deckId, nav}: {deckId: string; nav: Nav}) {
  const lib = useLibrary();
  const deck = L.findDeck(lib, deckId);
  if (!deck) {
    return (
      <EmptyState
        title="Deck not found"
        children={<Button label="Back" onPress={nav.back} />}
      />
    );
  }
  const cards = L.cardsOf(lib, deckId);
  return (
    <Screen
      title={deck.name}
      subtitle={`${cards.length} ${plural(cards.length, 'card')}`}
      onBack={nav.back}
      actions={
        <BarButton
          label="+"
          accessibilityLabel="New card"
          onPress={() => nav.go({name: 'editCard', deckId, cardId: null})}
        />
      }>
      {cards.length === 0 ? (
        <EmptyState title="No cards yet" message="Tap + to write one.">
          <Button
            label="Write a card"
            primary
            onPress={() => nav.go({name: 'editCard', deckId, cardId: null})}
          />
        </EmptyState>
      ) : (
        <FlatList
          data={cards}
          keyExtractor={x => x.id}
          ItemSeparatorComponent={RowSeparator}
          renderItem={({item}) => (
            <Row
              title={sideLabel(item.front, item.frontImage)}
              subtitle={sideLabel(item.back, item.backImage)}
              onPress={() =>
                nav.go({name: 'editCard', deckId, cardId: item.id})
              }
              right={
                <BarButton
                  label={item.starred ? '★' : '☆'}
                  accessibilityLabel={item.starred ? 'Unstar' : 'Star'}
                  onPress={() => updateLibrary(l => L.toggleStar(l, item.id))}
                />
              }
            />
          )}
          ListFooterComponent={<View style={{height: 40}} />}
        />
      )}
    </Screen>
  );
}
