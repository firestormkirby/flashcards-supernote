/**
 * Writing and editing cards, and the pickers for where things go.
 */

import React, {useState} from 'react';
import {FlatList, ScrollView, View, useWindowDimensions} from 'react-native';
import * as L from '../core/library';
import {Card, CardImage, Deck, Folder, makeCard, plural} from '../core/model';
import {CardPicture, CropScreen, ImageFilePicker} from './Picture';
import {updateLibrary} from '../storage/libraryStore';
import {Nav} from './nav';
import {
  BarButton,
  Button,
  ConfirmDialog,
  Divider,
  EmptyState,
  Input,
  PAD,
  Row,
  RowSeparator,
  Screen,
  Spacer,
  T,
  useLibrary,
  useTheme,
} from './kit';

/**
 * Write a new card or edit one. The Deck row at the top shows where the card
 * lives: tap it to choose a deck for a new card, or to move an existing one.
 * Also used inside a study session (so the session carries on afterwards).
 */
export function CardEditScreen({
  deckId,
  cardId,
  folderHint,
  draft,
  onClose,
}: {
  deckId: string | null;
  cardId: string | null;
  folderHint: string | null;
  draft?: CardDraft;
  onClose: () => void;
}) {
  const lib = useLibrary();
  const t = useTheme();
  const window = useWindowDimensions();
  const existing = cardId ? L.findCard(lib, cardId) : undefined;
  const [front, setFront] = useState(existing?.front ?? draft?.front ?? '');
  const [back, setBack] = useState(existing?.back ?? draft?.back ?? '');
  const [targetDeck, setTargetDeck] = useState<string | null>(
    existing?.deckId ?? deckId ?? null,
  );
  const [frontImage, setFrontImage] = useState<CardImage | undefined>(
    existing ? existing.frontImage : draft?.frontImage,
  );
  const [backImage, setBackImage] = useState<CardImage | undefined>(
    existing ? existing.backImage : draft?.backImage,
  );
  const [picture, setPicture] = useState<
    | {side: Side; step: 'file'}
    | {side: Side; step: 'crop'; img: CardImage}
    | null
  >(null);
  const [picking, setPicking] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [savedCount, setSavedCount] = useState(0);

  if (cardId && !existing) {
    return (
      <EmptyState
        title="Card not found"
        children={<Button label="Back" onPress={onClose} />}
      />
    );
  }

  const deck = targetDeck ? L.findDeck(lib, targetDeck) : undefined;
  const canSave =
    (front.trim() !== '' || !!frontImage) &&
    (back.trim() !== '' || !!backImage) &&
    !!deck;
  const setImage = (side: Side, img: CardImage | undefined) =>
    side === 'front' ? setFrontImage(img) : setBackImage(img);

  if (picture?.step === 'file') {
    return (
      <ImageFilePicker
        onClose={() => setPicture(null)}
        onPicked={img => setPicture({side: picture.side, step: 'crop', img})}
      />
    );
  }
  if (picture?.step === 'crop') {
    return (
      <CropScreen
        img={picture.img}
        title={
          picture.side === 'front'
            ? 'Picture for the front'
            : 'Picture for the back'
        }
        onCancel={() => setPicture(null)}
        onDone={img => {
          setImage(picture.side, img);
          setPicture(null);
        }}
      />
    );
  }

  if (picking) {
    return (
      <DeckPicker
        title={existing ? 'Move card to' : 'Choose a deck'}
        startFolder={deck ? deck.folderId : folderHint}
        currentDeckId={targetDeck}
        onPick={id => {
          setTargetDeck(id);
          setPicking(false);
        }}
        onClose={() => setPicking(false)}
      />
    );
  }

  const save = (another: boolean) => {
    if (!canSave || !deck) return;
    const f = front.trim();
    const b = back.trim();
    if (existing) {
      updateLibrary(l => {
        const edited: Card = withImages(
          {...existing, front: f, back: b},
          frontImage,
          backImage,
        );
        const next = L.upsertCard(l, edited);
        return existing.deckId !== deck.id
          ? L.moveCard(next, existing.id, deck.id)
          : next;
      });
      onClose();
    } else {
      updateLibrary(l =>
        L.upsertCard(l, makeCard(deck.id, f, b, {frontImage, backImage})),
      );
      if (another) {
        setFront('');
        setBack('');
        setFrontImage(undefined);
        setBackImage(undefined);
        setSavedCount(n => n + 1);
      } else {
        onClose();
      }
    }
  };

  return (
    <Screen
      title={existing ? 'Edit card' : 'New card'}
      subtitle={
        savedCount > 0
          ? `${savedCount} ${plural(savedCount, 'card')} added`
          : null
      }
      onBack={onClose}
      backLabel="✕"
      actions={
        existing ? (
          <BarButton
            label={existing.starred ? '★' : '☆'}
            accessibilityLabel={existing.starred ? 'Unstar' : 'Star'}
            onPress={() => updateLibrary(l => L.toggleStar(l, existing.id))}
          />
        ) : null
      }>
      <ScrollView
        contentContainerStyle={{padding: PAD}}
        keyboardShouldPersistTaps="handled">
        {draft?.note && !existing ? (
          <View
            style={{
              borderWidth: 2,
              borderColor: t.line,
              borderRadius: 10,
              padding: 12,
              marginBottom: 16,
            }}>
            <T size={15}>{draft.note}</T>
          </View>
        ) : null}
        <T size={14} muted>
          Deck
        </T>
        <Row
          pad={0}
          title={deck ? deck.name : 'Choose a deck'}
          subtitle={
            deck
              ? L.folderPath(lib, deck.folderId).replace(/\//g, ' / ') || 'Home'
              : null
          }
          bold={!deck}
          onPress={() => setPicking(true)}
          right={<T size={20}>›</T>}
        />
        <Divider />
        <Spacer h={16} />
        <T size={14} muted>
          Front
        </T>
        <Spacer h={6} />
        <Input
          value={front}
          onChangeText={setFront}
          multiline
          placeholder="Question or term"
          autoFocus={!existing && !draft?.front && !draft?.frontImage}
        />
        <PictureSlot
          img={frontImage}
          maxWidth={window.width - PAD * 2}
          onAdd={() => setPicture({side: 'front', step: 'file'})}
          onReCrop={() =>
            frontImage &&
            setPicture({side: 'front', step: 'crop', img: frontImage})
          }
          onRemove={() => setFrontImage(undefined)}
        />
        <View
          style={{flexDirection: 'row', alignItems: 'flex-end', marginTop: 10}}>
          <T size={14} muted style={{flex: 1}}>
            Back
          </T>
          {front !== '' || back !== '' || frontImage || backImage ? (
            <BarButton
              label="Swap sides"
              accessibilityLabel="Swap front and back"
              onPress={() => {
                setFront(back);
                setBack(front);
                setFrontImage(backImage);
                setBackImage(frontImage);
              }}
            />
          ) : null}
        </View>
        <Spacer h={6} />
        <Input
          value={back}
          onChangeText={setBack}
          multiline
          placeholder="Answer"
          autoFocus={
            !existing && !!(draft?.front || draft?.frontImage) && !draft?.back
          }
        />
        <PictureSlot
          img={backImage}
          maxWidth={window.width - PAD * 2}
          onAdd={() => setPicture({side: 'back', step: 'file'})}
          onReCrop={() =>
            backImage &&
            setPicture({side: 'back', step: 'crop', img: backImage})
          }
          onRemove={() => setBackImage(undefined)}
        />
        <Spacer h={24} />
        <Button
          label={existing ? 'Save' : 'Save card'}
          primary
          disabled={!canSave}
          onPress={() => save(false)}
        />
        {!existing ? (
          <>
            <Spacer h={10} />
            <Button
              label="Save and write another"
              disabled={!canSave}
              onPress={() => save(true)}
            />
          </>
        ) : (
          <>
            <Spacer h={10} />
            <Button
              label="Delete card"
              onPress={() => setConfirmDelete(true)}
            />
          </>
        )}
        {!deck ? (
          <T size={14} muted style={{marginTop: 10}}>
            Choose a deck to save this card into.
          </T>
        ) : null}
        <Spacer h={40} />
      </ScrollView>
      {confirmDelete && existing ? (
        <ConfirmDialog
          title="Delete this card?"
          message="The card and its study progress will be removed. This can't be undone."
          confirmLabel="Delete"
          onDismiss={() => setConfirmDelete(false)}
          onConfirm={() => {
            onClose();
            updateLibrary(l => L.deleteCard(l, existing.id));
          }}
        />
      ) : null}
    </Screen>
  );
}

type Side = 'front' | 'back';

export interface CardDraft {
  front: string;
  back: string;
  note?: string;
  frontImage?: CardImage;
  backImage?: CardImage;
}

/** The card with its pictures set (or removed), without leaving undefined keys behind. */
function withImages(
  card: Card,
  frontImage?: CardImage,
  backImage?: CardImage,
): Card {
  const out: Card = {...card};
  delete out.frontImage;
  delete out.backImage;
  if (frontImage) out.frontImage = frontImage;
  if (backImage) out.backImage = backImage;
  return out;
}

/** Under each side: the picture with Change area / Remove, or a way to add one. */
function PictureSlot({
  img,
  maxWidth,
  onAdd,
  onReCrop,
  onRemove,
}: {
  img?: CardImage;
  maxWidth: number;
  onAdd: () => void;
  onReCrop: () => void;
  onRemove: () => void;
}) {
  if (!img) {
    return (
      <View style={{flexDirection: 'row', marginTop: 8}}>
        <BarButton
          label="+ Picture"
          accessibilityLabel="Add a picture"
          onPress={onAdd}
        />
      </View>
    );
  }
  return (
    <View style={{marginTop: 10, alignItems: 'flex-start'}}>
      <CardPicture img={img} maxWidth={maxWidth} maxHeight={240} />
      <View style={{flexDirection: 'row', marginTop: 6}}>
        <BarButton label="Change area" onPress={onReCrop} />
        <BarButton label="Replace" onPress={onAdd} />
        <BarButton
          label="Remove"
          accessibilityLabel="Remove picture"
          onPress={onRemove}
        />
      </View>
    </View>
  );
}

/** Browse folders and choose a deck. */
export function DeckPicker({
  title,
  startFolder,
  currentDeckId,
  onPick,
  onClose,
}: {
  title: string;
  startFolder: string | null;
  currentDeckId: string | null;
  onPick: (deckId: string) => void;
  onClose: () => void;
}) {
  const lib = useLibrary();
  const [folderId, setFolderId] = useState<string | null>(
    L.findFolder(lib, startFolder) ? startFolder : null,
  );
  const folder = L.findFolder(lib, folderId);
  type PickRow = {key: string; folder: Folder} | {key: string; deck: Deck};
  const rows: PickRow[] = [
    ...L.childFolders(lib, folderId).map(f => ({key: `f${f.id}`, folder: f})),
    ...L.decksIn(lib, folderId).map(d => ({key: `d${d.id}`, deck: d})),
  ];
  return (
    <Screen
      title={title}
      subtitle={
        folder ? L.folderPath(lib, folderId).replace(/\//g, ' / ') : 'Home'
      }
      onBack={folder ? () => setFolderId(folder.parentId) : onClose}
      backLabel={folder ? '←' : '✕'}>
      {rows.length === 0 ? (
        <EmptyState
          title="No decks here"
          message={
            lib.decks.length === 0
              ? 'Make a deck first: + New › Deck.'
              : 'Go back to choose another folder.'
          }
        />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={r => r.key}
          ItemSeparatorComponent={RowSeparator}
          renderItem={({item}) =>
            'folder' in item ? (
              <Row
                lead="▸"
                title={item.folder.name}
                bold
                onPress={() => setFolderId(item.folder.id)}
                right={<T size={20}>›</T>}
              />
            ) : (
              <Row
                lead="▭"
                title={item.deck.name}
                bold={item.deck.id === currentDeckId}
                subtitle={
                  item.deck.id === currentDeckId ? 'Current deck' : null
                }
                onPress={() => onPick(item.deck.id)}
              />
            )
          }
        />
      )}
    </Screen>
  );
}

/** Move decks and/or folders into another folder. */
export function MoveItemsScreen({
  deckIds,
  folderIds,
  nav,
}: {
  deckIds: string[];
  folderIds: string[];
  nav: Nav;
}) {
  const lib = useLibrary();
  const decks = deckIds.map(id => L.findDeck(lib, id)).filter(Boolean);
  const folders = folderIds.map(id => L.findFolder(lib, id)).filter(Boolean);
  const origin = decks[0]?.folderId ?? folders[0]?.parentId ?? null;
  const [here, setHere] = useState<string | null>(origin);
  const folder = L.findFolder(lib, here);
  if (decks.length + folders.length === 0) {
    return (
      <EmptyState
        title="Nothing to move"
        children={<Button label="Back" onPress={nav.back} />}
      />
    );
  }
  const what =
    decks.length + folders.length === 1
      ? decks[0]?.name ?? folders[0]!.name
      : `${decks.length + folders.length} items`;
  // A folder can't go inside itself; and there is nothing to do if it is already here.
  const allowed =
    folderIds.every(id => L.canMoveFolderInto(lib, id, here)) &&
    here !== origin;
  const clash = [...decks.map(d => d!.name), ...folders.map(f => f!.name)].some(
    n => L.nameTakenInFolder(lib, here, n, undefined),
  );
  const children = L.childFolders(lib, here).filter(
    f => !folderIds.includes(f.id),
  );

  return (
    <Screen
      title={`Move ${what}`}
      subtitle={
        folder
          ? `To ${L.folderPath(lib, here).replace(/\//g, ' / ')}`
          : 'To Home'
      }
      onBack={folder ? () => setHere(folder.parentId) : nav.back}
      backLabel={folder ? '←' : '✕'}>
      <FlatList
        data={children}
        keyExtractor={f => f.id}
        ItemSeparatorComponent={RowSeparator}
        renderItem={({item}) => (
          <Row
            lead="▸"
            title={item.name}
            bold
            onPress={() => setHere(item.id)}
            right={<T size={20}>›</T>}
          />
        )}
        ListEmptyComponent={
          <View style={{padding: PAD}}>
            <T size={15} muted>
              No folders inside this one.
            </T>
          </View>
        }
      />
      <View style={{padding: PAD}}>
        {clash && allowed ? (
          <T size={14} muted style={{marginBottom: 8}}>
            Something here already has the same name. Both will be kept.
          </T>
        ) : null}
        <Button
          label={here === origin ? 'Already here' : 'Move here'}
          primary
          disabled={!allowed}
          onPress={() => {
            updateLibrary(l => {
              let next = l;
              for (const id of deckIds) next = L.moveDeck(next, id, here);
              for (const id of folderIds) next = L.moveFolder(next, id, here);
              return next;
            });
            nav.back();
          }}
        />
      </View>
    </Screen>
  );
}
