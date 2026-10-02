import React, {useState} from 'react';
import pluginConfig from '../../PluginConfig.json';
import {View} from 'react-native';
import {EXAMPLE_DECKS} from '../core/examples.generated';
import * as L from '../core/library';
import {updateLibrary, updateLibraryAndGet} from '../storage/libraryStore';
import {TextSize, updateSettings} from '../storage/settingsStore';
import {Nav} from './nav';
import {
  Button,
  ConfirmDialog,
  Divider,
  MessageDialog,
  Screen,
  SectionTitle,
  Segmented,
  Spacer,
  T,
  ToggleRow,
  useSettings,
} from './kit';

const SIZES: {value: TextSize; label: string}[] = [
  {value: 'small', label: 'Small'},
  {value: 'medium', label: 'Medium'},
  {value: 'large', label: 'Large'},
];

const VERSION = pluginConfig.versionName;

export function SettingsScreen({nav: _nav}: {nav: Nav}) {
  const s = useSettings();
  const [dlg, setDlg] = useState<
    'resetAll' | {title: string; message: string} | null
  >(null);
  const set = (patch: Partial<typeof s>) =>
    updateSettings(x => ({...x, ...patch}));

  return (
    <Screen title="Settings" scroll>
      <SectionTitle>Appearance</SectionTitle>
      <ToggleRow
        title="Dark mode"
        subtitle="White on black instead of black on white."
        value={s.darkMode}
        onChange={v => set({darkMode: v})}
      />
      <Divider />
      <Spacer h={14} />
      <T size={18}>Card front text</T>
      <Spacer h={8} />
      <Segmented
        options={SIZES}
        value={s.frontSize}
        onChange={v => set({frontSize: v})}
      />
      <Spacer h={16} />
      <T size={18}>Card back text</T>
      <Spacer h={8} />
      <Segmented
        options={SIZES}
        value={s.backSize}
        onChange={v => set({backSize: v})}
      />

      <SectionTitle>Studying</SectionTitle>
      <ToggleRow
        title="Shuffle cards"
        subtitle="Mix up the order when studying a deck, a folder, or Starred."
        value={s.shuffle}
        onChange={v => set({shuffle: v})}
      />
      <Divider />
      <ToggleRow
        title="Full-screen study"
        subtitle="Only the card on screen. Tap the middle for the answer, the sides to move between cards."
        value={s.studyFullScreen}
        onChange={v => set({studyFullScreen: v})}
      />
      <Divider />
      <ToggleRow
        title="Show the full-screen tips again"
        subtitle="Before the next Study and Practice session."
        value={!s.seenStudyTips || !s.seenPracticeTips}
        onChange={v => set({seenStudyTips: !v, seenPracticeTips: !v})}
      />

      <SectionTitle>Lists</SectionTitle>
      <ToggleRow
        title="Show card counts"
        value={s.showCardCount}
        onChange={v => set({showCardCount: v})}
      />
      <Divider />
      <ToggleRow
        title="Show deck counts"
        value={s.showDeckCount}
        onChange={v => set({showDeckCount: v})}
      />
      <Divider />
      <ToggleRow
        title="Show new-card counts"
        value={s.showNewCount}
        onChange={v => set({showNewCount: v})}
      />
      <Divider />
      <ToggleRow
        title="Show due-card counts"
        value={s.showDueCount}
        onChange={v => set({showDueCount: v})}
      />

      <SectionTitle>Backup reminder</SectionTitle>
      <ToggleRow
        title="Remind me to back up"
        subtitle="A gentle prompt to export a copy of your cards."
        value={s.backupReminder}
        onChange={v => set({backupReminder: v})}
      />
      {s.backupReminder ? (
        <View style={{paddingVertical: 8}}>
          <Segmented
            options={[
              {value: 14, label: 'Every two weeks'},
              {value: 30, label: 'Monthly'},
            ]}
            value={s.backupEveryDays}
            onChange={v => set({backupEveryDays: v})}
          />
        </View>
      ) : null}

      <SectionTitle>Library</SectionTitle>
      <Button
        label="Add the example decks"
        onPress={() => {
          const rep = updateLibraryAndGet(l => L.importFiles(l, EXAMPLE_DECKS));
          setDlg({
            title: 'Examples added',
            message: `${L.importSummary(
              rep,
            )}. They're in the Examples folder on Home.`,
          });
        }}
      />
      <Spacer h={10} />
      <Button
        label="Reset all study progress"
        onPress={() => setDlg('resetAll')}
      />
      <Spacer h={10} />
      <Button
        label="Show the welcome again"
        onPress={() => set({seenWelcome: false})}
      />

      <SectionTitle>About</SectionTitle>
      <T
        size={
          16
        }>{`Cards ${VERSION} for Supernote. Flashcards for calm, focused study.`}</T>
      <Spacer h={8} />
      <T size={15} muted>
        Based on Cards by mrgrtapk (github.com/mrgrtapk/Cards), ported to a
        Supernote plugin with the author's permission. Spaced repetition by the
        FSRS algorithm (open-spaced-repetition). Inspired by Mudita Mindful
        Design.
      </T>
      <Spacer h={8} />
      <T size={15} muted>
        No internet access, no accounts, no tracking. Your cards stay in the
        plugin's private storage.
      </T>

      {dlg === 'resetAll' ? (
        <ConfirmDialog
          title="Reset all progress?"
          message="Every card in every deck goes back to new. The cards and stars stay."
          confirmLabel="Reset"
          onDismiss={() => setDlg(null)}
          onConfirm={() => updateLibrary(l => L.resetFolder(l, null))}
        />
      ) : dlg ? (
        <MessageDialog {...dlg} onDismiss={() => setDlg(null)} />
      ) : null}
    </Screen>
  );
}
