import React, {useMemo, useState} from 'react';
import {FlatList, ScrollView, View} from 'react-native';
import * as L from '../core/library';
import {plural} from '../core/model';
import {updateLibrary} from '../storage/libraryStore';
import {Nav} from './nav';
import {
  BarButton,
  Button,
  Chip,
  Divider,
  EmptyState,
  Input,
  PAD,
  Row,
  Screen,
  RowSeparator,
  SectionTitle,
  T,
  useLibrary,
} from './kit';

/** Every starred card, with a way to practice just those. */
export function StarredScreen({nav}: {nav: Nav}) {
  const lib = useLibrary();
  const cards = L.starredCards(lib);
  const deckName = (id: string) => L.findDeck(lib, id)?.name ?? '';
  return (
    <Screen
      title="Starred"
      subtitle={`${cards.length} ${plural(cards.length, 'card')}`}
      actions={
        cards.length > 0 ? (
          <BarButton
            label="▶"
            accessibilityLabel="Practice starred cards"
            onPress={() =>
              nav.go({
                name: 'study',
                deckIds: [...new Set(cards.map(c => c.deckId))],
                title: 'Starred',
                practice: true,
                cardIds: cards.map(c => c.id),
                filters: [],
              })
            }
          />
        ) : null
      }>
      {cards.length === 0 ? (
        <EmptyState
          title="No starred cards"
          message="Tap ☆ on a card while studying, or in a deck's card list, to keep it here for extra practice."
        />
      ) : (
        <FlatList
          data={cards}
          keyExtractor={c => c.id}
          ItemSeparatorComponent={RowSeparator}
          renderItem={({item}) => (
            <Row
              title={item.front.replace(/\n/g, ' ')}
              subtitle={deckName(item.deckId)}
              onPress={() =>
                nav.go({name: 'editCard', deckId: item.deckId, cardId: item.id})
              }
              right={
                <BarButton
                  label="★"
                  accessibilityLabel="Unstar"
                  onPress={() => updateLibrary(l => L.toggleStar(l, item.id))}
                />
              }
            />
          )}
          ListFooterComponent={
            <View style={{padding: PAD}}>
              <Button
                label={`Practice ${cards.length} starred`}
                primary
                onPress={() =>
                  nav.go({
                    name: 'study',
                    deckIds: [...new Set(cards.map(c => c.deckId))],
                    title: 'Starred',
                    practice: true,
                    cardIds: cards.map(c => c.id),
                    filters: [],
                  })
                }
              />
            </View>
          }
        />
      )}
    </Screen>
  );
}

const SCOPE_LABELS: {key: keyof L.SearchScope; label: string}[] = [
  {key: 'fronts', label: 'Fronts'},
  {key: 'backs', label: 'Backs'},
  {key: 'decks', label: 'Decks'},
  {key: 'folders', label: 'Folders'},
];

export function SearchScreen({nav}: {nav: Nav}) {
  const lib = useLibrary();
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<L.SearchScope>(L.FULL_SCOPE);
  const results = useMemo(
    () => L.search(lib, query, scope),
    [lib, query, scope],
  );
  const deckName = (id: string) => L.findDeck(lib, id)?.name ?? '';
  return (
    <Screen title="Search">
      <ScrollView
        contentContainerStyle={{paddingBottom: 40}}
        keyboardShouldPersistTaps="handled">
        <View style={{padding: PAD, paddingBottom: 8}}>
          <Input
            value={query}
            onChangeText={setQuery}
            placeholder="Search cards, decks, and folders"
            autoFocus
          />
          <View
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              gap: 8,
              marginTop: 12,
            }}>
            {SCOPE_LABELS.map(({key, label}) => (
              <Chip
                key={key}
                label={label}
                selected={scope[key]}
                onPress={() => setScope(s => ({...s, [key]: !s[key]}))}
              />
            ))}
          </View>
        </View>
        {query.trim() === '' ? null : L.isSearchEmpty(results) ? (
          <View style={{padding: PAD}}>
            <T size={17} muted>
              Nothing matches “{query.trim()}”.
            </T>
          </View>
        ) : (
          <>
            {results.folders.length > 0 ? (
              <View style={{paddingHorizontal: PAD}}>
                <SectionTitle>Folders</SectionTitle>
              </View>
            ) : null}
            {results.folders.map(f => (
              <Row
                key={f.id}
                lead="▸"
                title={f.name}
                bold
                subtitle={
                  L.folderPath(lib, f.parentId).replace(/\//g, ' / ') || 'Home'
                }
                onPress={() => nav.go({name: 'folder', id: f.id})}
              />
            ))}
            {results.decks.length > 0 ? (
              <View style={{paddingHorizontal: PAD}}>
                <SectionTitle>Decks</SectionTitle>
              </View>
            ) : null}
            {results.decks.map(d => (
              <Row
                key={d.id}
                lead="▭"
                title={d.name}
                subtitle={
                  L.folderPath(lib, d.folderId).replace(/\//g, ' / ') || 'Home'
                }
                onPress={() => nav.go({name: 'deck', id: d.id})}
              />
            ))}
            {results.cards.length > 0 ? (
              <View style={{paddingHorizontal: PAD}}>
                <SectionTitle>{`Cards · ${results.cards.length}${
                  results.cards.length >= 200 ? '+' : ''
                }`}</SectionTitle>
              </View>
            ) : null}
            {results.cards.map((c, i) => (
              <View key={c.id}>
                {i > 0 ? <Divider inset={PAD} /> : null}
                <Row
                  title={c.front.replace(/\n/g, ' ')}
                  subtitle={`${c.back.replace(/\n/g, ' ')} · ${deckName(
                    c.deckId,
                  )}`}
                  onPress={() =>
                    nav.go({name: 'editCard', deckId: c.deckId, cardId: c.id})
                  }
                />
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}
