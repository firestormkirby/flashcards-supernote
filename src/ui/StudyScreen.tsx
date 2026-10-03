/**
 * One card at a time: read the front, tap to reveal the back, then say how
 * well you knew it. Nothing animates, so the e-ink screen only refreshes when
 * the card actually changes.
 *
 * Full screen (the default) shows only the card, with tap zones: left 30% =
 * previous card, right 30% = next card, middle = show the answer. Moving on
 * after seeing the answer counts as "Good" in Study and "Got it" in Practice.
 * The regular view has buttons for Again / Good / Easy, the star, editing,
 * and a list of the session's cards.
 */

import React, {useEffect, useMemo, useState} from 'react';
import {
  LayoutChangeEvent,
  Pressable,
  ScrollView,
  View,
  useWindowDimensions,
} from 'react-native';
import {Fsrs, Rating, formatInterval} from '../core/fsrs';
import * as L from '../core/library';
import {Card, LibraryData, ReviewState, plural, sideLabel} from '../core/model';
import {getLibrary, updateLibrary} from '../storage/libraryStore';
import {TextSize, getSettings, updateSettings} from '../storage/settingsStore';
import {CardEditScreen} from './CardEditor';
import {CardPicture} from './Picture';
import {StudyTipsDialog} from './Dialogs';
import {Nav, Route} from './nav';
import {studyCount} from './shared';
import {
  BarButton,
  Button,
  Divider,
  EmptyState,
  PAD,
  Row,
  Screen,
  Spacer,
  T,
  useLibrary,
  useSettings,
  useTheme,
} from './kit';

type StudyRoute = Extract<Route, {name: 'study'}>;

/** One step forward in a session, kept so "Previous card" can undo it. */
interface Step {
  cardId: string;
  queueBefore: string[];
  /** The card's schedule before it was rated (absent when nothing was saved). */
  undoReview?: ReviewState;
  /** Whether the step added to the "went through N cards" total. */
  counted: boolean;
}

const fsrs = new Fsrs();

function buildQueue(
  lib: LibraryData,
  route: StudyRoute,
  shuffle: boolean,
): string[] {
  let ids: string[];
  if (route.cardIds) {
    const exists = new Set(lib.cards.map(c => c.id));
    ids = route.cardIds.filter(id => exists.has(id));
  } else if (route.practice) {
    const deckIds = new Set(route.deckIds);
    ids = lib.cards.filter(c => deckIds.has(c.deckId)).map(c => c.id);
  } else {
    // Study: due cards (most overdue first) then every new card. No daily cap, as in the original.
    return L.studyQueue(
      lib,
      new Set(route.deckIds),
      Date.now(),
      Number.MAX_SAFE_INTEGER,
      {
        shuffle,
        filters: route.filters,
      },
    ).map(c => c.id);
  }
  return shuffle ? L.shuffled(ids) : ids;
}

const FRONT_SIZES: Record<TextSize, number> = {
  small: 22,
  medium: 28,
  large: 34,
};
const BACK_SIZES: Record<TextSize, number> = {small: 17, medium: 21, large: 25};

export function StudyScreen({route, nav}: {route: StudyRoute; nav: Nav}) {
  const lib = useLibrary();
  const settings = useSettings();
  const [queue, setQueue] = useState<string[]>(() =>
    buildQueue(getLibrary(), route, getSettings().shuffle),
  );
  const [revealed, setRevealed] = useState(false);
  const [studied, setStudied] = useState(0);
  const [history, setHistory] = useState<Step[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [choosing, setChoosing] = useState(false);

  // Look the card up in live data so edits show immediately.
  const current: Card | undefined = queue.length
    ? L.findCard(lib, queue[0])
    : undefined;
  useEffect(() => {
    if (queue.length > 0 && !current) setQueue(q => q.slice(1)); // the card was deleted
  }, [queue, current]);

  const left = new Set(queue).size;
  const record = (step: Step) => setHistory(h => [...h, step].slice(-200));

  const previous = () => {
    const step = history[history.length - 1];
    if (!step) return;
    setHistory(h => h.slice(0, -1));
    if (step.undoReview) {
      const undo = step.undoReview;
      updateLibrary(l => L.setReview(l, step.cardId, undo));
    }
    if (step.counted) setStudied(n => n - 1);
    setQueue(step.queueBefore);
    setRevealed(false);
  };

  const rate = (card: Card, rating: Rating) => {
    record({
      cardId: card.id,
      queueBefore: queue,
      undoReview: route.practice ? undefined : card.review,
      counted: rating !== Rating.Again,
    });
    if (!route.practice) {
      const next = fsrs.next(card.review, rating, Date.now());
      updateLibrary(l => L.setReview(l, card.id, next));
    }
    setQueue(q =>
      rating === Rating.Again ? [...q.slice(1), card.id] : q.slice(1),
    );
    if (rating !== Rating.Again) setStudied(n => n + 1);
    setRevealed(false);
  };

  const skip = (card: Card) => {
    record({cardId: card.id, queueBefore: queue, counted: false});
    setQueue(q => [...q.slice(1), card.id]);
    setRevealed(false);
  };

  const nextCard = (card: Card) => {
    if (revealed)
      rate(card, Rating.Good); // "Good" in Study, "Got it" in Practice
    else if (left > 1) skip(card);
    else setRevealed(true); // the last card: nothing to skip to, so show its answer
  };

  // Editing opens in place, so the session carries on where it was afterwards.
  if (editingId) {
    return (
      <CardEditScreen
        deckId={null}
        cardId={editingId}
        folderHint={null}
        onClose={() => setEditingId(null)}
      />
    );
  }

  if (choosing) {
    const scope = route.cardIds
      ? route.cardIds
          .map(id => L.findCard(lib, id))
          .filter((c): c is Card => !!c)
      : lib.cards.filter(c => route.deckIds.includes(c.deckId));
    return (
      <CardList
        cards={scope}
        currentId={current?.id}
        onPick={id => {
          if (id !== current?.id)
            record({cardId: id, queueBefore: queue, counted: false});
          setQueue(q => [id, ...q.filter(x => x !== id)]);
          setRevealed(false);
          setChoosing(false);
        }}
        onClose={() => setChoosing(false)}
      />
    );
  }

  const tipsSeen = route.practice
    ? settings.seenPracticeTips
    : settings.seenStudyTips;
  const tips = !tipsSeen ? (
    <StudyTipsDialog
      practice={route.practice}
      onOkay={() =>
        updateSettings(s =>
          route.practice
            ? {...s, seenPracticeTips: true}
            : {...s, seenStudyTips: true},
        )
      }
    />
  ) : null;

  if (current && settings.studyFullScreen) {
    return (
      <View style={{flex: 1}}>
        <FullScreenCard
          key={`${current.id}:${queue.length}`}
          card={current}
          left={left}
          frontSize={FRONT_SIZES[settings.frontSize]}
          backSize={BACK_SIZES[settings.backSize]}
          revealed={revealed}
          onMiddle={() => !revealed && setRevealed(true)}
          onLeft={previous}
          onRight={() => nextCard(current)}
          onRegularView={() =>
            updateSettings(s => ({...s, studyFullScreen: false}))
          }
          onEnd={nav.back}
        />
        {tips}
      </View>
    );
  }

  return (
    <Screen
      title={current ? `${left} left` : route.title}
      subtitle={current ? route.title : null}
      onBack={nav.back}
      backLabel="✕"
      actions={
        current ? (
          <>
            {revealed ? (
              <BarButton
                label="Edit"
                onPress={() => setEditingId(current.id)}
              />
            ) : null}
            <BarButton
              label={current.starred ? '★' : '☆'}
              accessibilityLabel={current.starred ? 'Unstar' : 'Star'}
              onPress={() => updateLibrary(l => L.toggleStar(l, current.id))}
            />
            <BarButton
              label="List"
              accessibilityLabel="Go to a card"
              onPress={() => setChoosing(true)}
            />
            <BarButton
              label="Full"
              accessibilityLabel="Full screen"
              onPress={() =>
                updateSettings(s => ({...s, studyFullScreen: true}))
              }
            />
          </>
        ) : null
      }>
      {!current ? (
        <Finished
          lib={lib}
          route={route}
          studied={studied}
          onMore={() => {
            setQueue(buildQueue(getLibrary(), route, getSettings().shuffle));
            setStudied(0);
            setHistory([]);
          }}
          onDone={nav.back}
        />
      ) : (
        <>
          <Pressable
            style={{flex: 1}}
            disabled={revealed}
            onPress={() => setRevealed(true)}
            accessibilityLabel="Show answer">
            <CardScroll key={`${current.id}:${queue.length}`}>
              <CardText
                card={current}
                frontSize={FRONT_SIZES[settings.frontSize]}
                backSize={BACK_SIZES[settings.backSize]}
                revealed={revealed}
              />
            </CardScroll>
          </Pressable>
          <View style={{padding: PAD, paddingTop: 8}}>
            {!revealed ? (
              <>
                <View style={{flexDirection: 'row', gap: 10}}>
                  <Button
                    label="← Previous card"
                    compact
                    disabled={history.length === 0}
                    onPress={previous}
                    style={{flex: 1.7}}
                  />
                  <Button
                    label="Skip"
                    compact
                    disabled={left <= 1}
                    onPress={() => skip(current)}
                    style={{flex: 1}}
                  />
                </View>
                <Spacer h={10} />
                <Button
                  label="Show answer"
                  primary
                  onPress={() => setRevealed(true)}
                />
              </>
            ) : route.practice ? (
              <View style={{flexDirection: 'row', gap: 10}}>
                <RateButton
                  label="Again"
                  onPress={() => rate(current, Rating.Again)}
                />
                <RateButton
                  label="Got it"
                  primary
                  onPress={() => rate(current, Rating.Good)}
                />
              </View>
            ) : (
              <RatingRow card={current} onRate={r => rate(current, r)} />
            )}
          </View>
        </>
      )}
      {tips}
    </Screen>
  );
}

function RatingRow({card, onRate}: {card: Card; onRate: (r: Rating) => void}) {
  const now = useMemo(() => Date.now(), []);
  return (
    <View style={{flexDirection: 'row', gap: 8}}>
      <RateButton
        label="Again"
        hint={fsrs.previewLabel(card.review, Rating.Again, now)}
        onPress={() => onRate(Rating.Again)}
      />
      <RateButton
        label="Good"
        primary
        hint={fsrs.previewLabel(card.review, Rating.Good, now)}
        onPress={() => onRate(Rating.Good)}
      />
      <RateButton
        label="Easy"
        hint={fsrs.previewLabel(card.review, Rating.Easy, now)}
        onPress={() => onRate(Rating.Easy)}
      />
    </View>
  );
}

function RateButton({
  label,
  hint,
  primary,
  onPress,
}: {
  label: string;
  hint?: string;
  primary?: boolean;
  onPress: () => void;
}) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={{
        flex: 1,
        minHeight: 64,
        borderWidth: 2,
        borderRadius: 10,
        borderColor: t.line,
        backgroundColor: primary ? t.fg : t.bg,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 6,
      }}>
      <T size={18} bold style={{color: primary ? t.onFg : t.fg}}>
        {label}
      </T>
      {hint ? (
        <T size={13} style={{color: primary ? t.onFg : t.fg}}>
          {hint}
        </T>
      ) : null}
    </Pressable>
  );
}

/** A vertically centred, scrollable area for a card's text. */
function CardScroll({
  children,
  padV = 24,
}: {
  children: React.ReactNode;
  padV?: number;
}) {
  const [h, setH] = useState(0);
  return (
    <ScrollView
      style={{flex: 1}}
      onLayout={(e: LayoutChangeEvent) => setH(e.nativeEvent.layout.height)}
      contentContainerStyle={{
        minHeight: h,
        justifyContent: 'center',
        paddingHorizontal: 28,
        paddingVertical: padV,
      }}>
      {children}
    </ScrollView>
  );
}

/** The front in bold, and once revealed a short rule and the back beneath it. */
function CardText({
  card,
  frontSize,
  backSize,
  revealed,
}: {
  card: Card;
  frontSize: number;
  backSize: number;
  revealed: boolean;
}) {
  const t = useTheme();
  const window = useWindowDimensions();
  // Pictures fit the card's width, and each side gets at most ~40% of the height.
  const picW = window.width - 56;
  const picH = window.height * 0.4;
  return (
    <View style={{alignItems: 'center'}}>
      {card.frontImage ? (
        <View style={{marginBottom: card.front ? 18 : 0}}>
          <CardPicture img={card.frontImage} maxWidth={picW} maxHeight={picH} />
        </View>
      ) : null}
      {card.front ? (
        <T
          size={frontSize}
          bold
          center
          style={{lineHeight: Math.round(frontSize * 1.25)}}>
          {card.front}
        </T>
      ) : null}
      {revealed ? (
        <>
          <View
            style={{
              width: 56,
              height: 3,
              backgroundColor: t.fg,
              marginVertical: 28,
            }}
          />
          {card.backImage ? (
            <View style={{marginBottom: card.back ? 18 : 0}}>
              <CardPicture
                img={card.backImage}
                maxWidth={picW}
                maxHeight={picH}
              />
            </View>
          ) : null}
          {card.back ? (
            <T
              size={backSize}
              center
              style={{lineHeight: Math.round(backSize * 1.3)}}>
              {card.back}
            </T>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

function FullScreenCard({
  card,
  left,
  frontSize,
  backSize,
  revealed,
  onMiddle,
  onLeft,
  onRight,
  onRegularView,
  onEnd,
}: {
  card: Card;
  left: number;
  frontSize: number;
  backSize: number;
  revealed: boolean;
  onMiddle: () => void;
  onLeft: () => void;
  onRight: () => void;
  onRegularView: () => void;
  onEnd: () => void;
}) {
  const t = useTheme();
  const window = useWindowDimensions();
  const [width, setWidth] = useState(window.width);
  const tap = (x: number) => {
    if (x < width * 0.3) onLeft();
    else if (x > width * 0.7) onRight();
    else onMiddle();
  };
  return (
    <View
      style={{flex: 1, backgroundColor: t.bg}}
      onLayout={e => setWidth(e.nativeEvent.layout.width || window.width)}>
      <Pressable style={{flex: 1}} onPress={e => tap(e.nativeEvent.pageX)}>
        <CardScroll padV={72}>
          <CardText
            card={card}
            frontSize={frontSize}
            backSize={backSize}
            revealed={revealed}
          />
        </CardScroll>
      </Pressable>
      <View
        style={{
          position: 'absolute',
          top: 6,
          left: 6,
          right: 6,
          flexDirection: 'row',
          alignItems: 'center',
        }}>
        <BarButton label="✕" accessibilityLabel="End session" onPress={onEnd} />
        <View style={{flex: 1}}>
          <T size={14} muted center>
            {`${left} left`}
          </T>
        </View>
        <BarButton label="Regular view" onPress={onRegularView} />
      </View>
    </View>
  );
}

function Finished({
  lib,
  route,
  studied,
  onMore,
  onDone,
}: {
  lib: LibraryData;
  route: StudyRoute;
  studied: number;
  onMore: () => void;
  onDone: () => void;
}) {
  const now = Date.now();
  const deckIds = new Set(route.deckIds);
  const remaining = L.counts(lib, deckIds, now, route.filters);
  const more = !route.practice && (remaining.due > 0 || remaining.new > 0);
  const next = L.nextDue(lib, deckIds);
  const message =
    studied === 0 && route.practice
      ? 'There are no cards to practice here.'
      : studied === 0
      ? 'Nothing is due right now.'
      : `You went through ${studied} ${plural(studied, 'card')}.`;
  const nextLine =
    !route.practice && !more && next !== null && next > now
      ? `Next review in ${formatInterval(next - now)}.`
      : '';
  return (
    <EmptyState
      title={studied > 0 ? 'Well done!' : 'All caught up'}
      message={[message, nextLine].filter(Boolean).join('\n')}>
      {more ? (
        <>
          <Button
            label={`Keep going · ${studyCount(remaining)}`}
            primary
            onPress={onMore}
          />
          <Spacer />
          <Button label="Done" onPress={onDone} />
        </>
      ) : route.practice && studied > 0 ? (
        <>
          <Button label="Practice again" primary onPress={onMore} />
          <Spacer />
          <Button label="Done" onPress={onDone} />
        </>
      ) : (
        <Button label="Done" primary onPress={onDone} />
      )}
    </EmptyState>
  );
}

/** "Go to card": the fronts of every card in the session; tap one to study it next. */
function CardList({
  cards,
  currentId,
  onPick,
  onClose,
}: {
  cards: Card[];
  currentId?: string;
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <Screen
      title="Go to card"
      subtitle={`${cards.length} ${plural(cards.length, 'card')}`}
      onBack={onClose}
      backLabel="✕">
      <ScrollView>
        {cards.map((c, i) => (
          <View key={c.id}>
            {i > 0 ? <Divider inset={PAD} /> : null}
            <Row
              title={sideLabel(c.front, c.frontImage)}
              subtitle={c.id === currentId ? 'Showing now' : null}
              bold={c.id === currentId}
              onPress={() => onPick(c.id)}
            />
          </View>
        ))}
      </ScrollView>
    </Screen>
  );
}
