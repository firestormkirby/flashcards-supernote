/**
 * The panel: a bottom bar of sections, and a stack of screens opened on top.
 */

import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {Pressable, Text, View} from 'react-native';
import {EXAMPLE_DECKS} from '../core/examples.generated';
import {importFiles} from '../core/library';
import {DAY_MS} from '../core/model';
import {
  closePanel,
  consumePanelIntent,
  subscribePanelIntent,
} from '../sdk/router';
import {
  getLibrary,
  loadLibrary,
  updateLibraryAndGet,
} from '../storage/libraryStore';
import {
  getSettings,
  loadSettings,
  updateSettings,
} from '../storage/settingsStore';
import {CardEditScreen, MoveItemsScreen} from './CardEditor';
import {DeckScreen, AllCardsScreen} from './DeckScreen';
import {BackupDialog, WelcomeDialog} from './Dialogs';
import {ImportScreen} from './ImportScreen';
import {LibraryScreen, NewItemFlow} from './LibraryScreen';
import {Nav, Route, Tab} from './nav';
import {SearchScreen, StarredScreen} from './OtherScreens';
import {SettingsScreen} from './SettingsScreen';
import {StudyScreen} from './StudyScreen';
import {EmptyState, ThemeProvider, useSettings, useTheme} from './kit';

const TABS: {tab: Tab | 'new' | 'close'; label: string}[] = [
  {tab: 'home', label: 'Home'},
  {tab: 'starred', label: 'Starred'},
  {tab: 'new', label: '+ New'},
  {tab: 'search', label: 'Search'},
  {tab: 'import', label: 'Import'},
  {tab: 'settings', label: 'Settings'},
  {tab: 'close', label: 'Close ✕'},
];

export default function Root() {
  return (
    <ThemeProvider>
      <Panel />
    </ThemeProvider>
  );
}

function Panel() {
  const t = useTheme();
  const settings = useSettings();
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<Tab>('home');
  const [stack, setStack] = useState<Route[]>([]);
  const [creating, setCreating] = useState(false);
  const [askBackup, setAskBackup] = useState(false);
  const stackRef = useRef(stack);
  stackRef.current = stack;

  const nav: Nav = useMemo(
    () => ({
      go: r => setStack(s => [...s, r]),
      back: () => setStack(s => s.slice(0, -1)),
      replace: r => setStack(s => [...s.slice(0, -1), r]),
      home: () => {
        setStack([]);
        setTab('home');
      },
      close: () => {
        closePanel();
      },
      hereFolder: () => {
        const top = stackRef.current[stackRef.current.length - 1];
        return top?.name === 'folder' ? top.id : null;
      },
      hereDeck: () => {
        const top = stackRef.current[stackRef.current.length - 1];
        return top?.name === 'deck' || top?.name === 'allCards'
          ? top.name === 'deck'
            ? top.id
            : top.deckId
          : null;
      },
    }),
    [],
  );

  const applyIntent = useCallback(() => {
    const intent = consumePanelIntent();
    if (intent?.kind === 'newCardDraft') {
      setStack(s => [
        ...s.filter(r => r.name !== 'study'),
        {
          name: 'editCard',
          deckId: null,
          cardId: null,
          draft: {front: intent.front, back: intent.back, note: intent.note},
        },
      ]);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    Promise.all([loadLibrary(), loadSettings()]).then(() => {
      if (!alive) return;
      firstLaunchChores(setAskBackup);
      setReady(true);
      applyIntent();
    });
    const unsub = subscribePanelIntent(() => {
      if (alive) applyIntent();
    });
    return () => {
      alive = false;
      unsub();
    };
  }, [applyIntent]);

  if (!ready) {
    return (
      <View style={{flex: 1, backgroundColor: t.bg}}>
        <EmptyState title="Cards" message="Opening your library…" />
      </View>
    );
  }

  const route = stack[stack.length - 1];
  const studying = route?.name === 'study';

  let screen: React.ReactNode;
  if (!route) {
    switch (tab) {
      case 'home':
        screen = <LibraryScreen folderId={null} nav={nav} />;
        break;
      case 'starred':
        screen = <StarredScreen nav={nav} />;
        break;
      case 'search':
        screen = <SearchScreen nav={nav} />;
        break;
      case 'import':
        screen = <ImportScreen nav={nav} />;
        break;
      case 'settings':
        screen = <SettingsScreen nav={nav} />;
        break;
    }
  } else {
    switch (route.name) {
      case 'folder':
        screen = <LibraryScreen folderId={route.id} nav={nav} />;
        break;
      case 'deck':
        screen = <DeckScreen deckId={route.id} nav={nav} />;
        break;
      case 'allCards':
        screen = <AllCardsScreen deckId={route.deckId} nav={nav} />;
        break;
      case 'study':
        screen = <StudyScreen route={route} nav={nav} />;
        break;
      case 'editCard':
        screen = (
          <CardEditScreen
            deckId={route.deckId}
            cardId={route.cardId}
            folderHint={route.folderHint ?? null}
            draft={route.draft}
            onClose={nav.back}
          />
        );
        break;
      case 'moveItems':
        screen = (
          <MoveItemsScreen
            deckIds={route.deckIds}
            folderIds={route.folderIds}
            nav={nav}
          />
        );
        break;
    }
  }

  return (
    <View style={{flex: 1, backgroundColor: t.bg}}>
      {/* Fresh state (scroll position, dialogs) for every screen. */}
      <View
        style={{flex: 1}}
        key={`${tab}:${stack.length}:${route ? JSON.stringify(route) : ''}`}>
        {screen}
      </View>

      {studying ? null : (
        <View
          style={{
            flexDirection: 'row',
            borderTopWidth: 2,
            borderTopColor: t.line,
          }}>
          {TABS.map(item => {
            const selected = !route && item.tab === tab;
            return (
              <Pressable
                key={item.tab}
                accessibilityRole="tab"
                accessibilityState={{selected}}
                onPress={() => {
                  if (item.tab === 'new') setCreating(true);
                  else if (item.tab === 'close') nav.close();
                  else {
                    // From any depth, a section takes you to its top.
                    setStack([]);
                    setTab(item.tab);
                  }
                }}
                style={{
                  flex: 1,
                  minHeight: 60,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: selected ? t.fg : t.bg,
                }}>
                <Text
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  style={{
                    color: selected ? t.onFg : t.fg,
                    fontSize: 15,
                    fontWeight: selected ? '700' : '400',
                  }}>
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}

      {creating ? (
        <NewItemFlow
          parentId={nav.hereFolder()}
          onDismiss={() => setCreating(false)}
          onCreatedDeck={deckId => {
            setCreating(false);
            if (!nav.hereFolder()) {
              setStack([]);
              setTab('home');
            }
            nav.go({name: 'deck', id: deckId});
          }}
          onNewCard={() => {
            setCreating(false);
            nav.go({
              name: 'editCard',
              deckId: nav.hereDeck(),
              cardId: null,
              folderHint: nav.hereFolder(),
            });
          }}
        />
      ) : null}

      {!settings.seenWelcome ? (
        <WelcomeDialog
          onDone={() => updateSettings(s => ({...s, seenWelcome: true}))}
        />
      ) : null}

      {askBackup && settings.seenWelcome ? (
        <BackupDialog
          everyDays={settings.backupEveryDays}
          onLater={() => {
            setAskBackup(false);
            updateSettings(s => ({...s, backupPromptAt: Date.now()}));
          }}
          onExport={() => {
            setAskBackup(false);
            updateSettings(s => ({...s, backupPromptAt: Date.now()}));
            setStack([]);
            setTab('import');
          }}
        />
      ) : null}
    </View>
  );
}

/** First launch: add the example decks (only into an empty library); later, the backup nudge. */
function firstLaunchChores(setAskBackup: (v: boolean) => void) {
  const s = getSettings();
  if (!s.seededExamples) {
    const lib = getLibrary();
    if (lib.decks.length === 0 && lib.folders.length === 0) {
      updateLibraryAndGet(l => importFiles(l, EXAMPLE_DECKS));
    }
    updateSettings(x => ({...x, seededExamples: true}));
  }
  const now = Date.now();
  if (s.backupPromptAt === 0) {
    updateSettings(x => ({...x, backupPromptAt: now})); // start counting from the first launch
  } else if (
    s.backupReminder &&
    getLibrary().cards.length > 0 &&
    now - Math.max(s.lastBackupAt, s.backupPromptAt) >
      s.backupEveryDays * DAY_MS
  ) {
    setAskBackup(true);
  }
}
