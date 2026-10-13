import React, {useState} from 'react';
import pluginConfig from '../../PluginConfig.json';
import {View} from 'react-native';
import {EXAMPLE_DECKS} from '../core/examples.generated';
import * as L from '../core/library';
import {updateLibrary, updateLibraryAndGet} from '../storage/libraryStore';
import {TextSize, updateSettings} from '../storage/settingsStore';
import {Nav} from './nav';
import {
  BarButton,
  Button,
  ConfirmDialog,
  Dialog,
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

/** Where bug reports and ideas go. */
export const CONTACT_EMAIL = 'sebastiancraftco@gmail.com';
export const PROJECT_URL = 'github.com/firestormkirby/flashcards-supernote';

/** Display size: Default, Large, Larger (as on Android), or Custom (−1) with − and +. */
const DISPLAY_SIZES = [
  {value: 100, label: 'Default'},
  {value: 115, label: 'Large'},
  {value: 130, label: 'Larger'},
  {value: -1, label: 'Custom'},
];
const CUSTOM_STEP = 5;
const CUSTOM_MIN = 80;
const CUSTOM_MAX = 160;

export function SettingsScreen({nav: _nav}: {nav: Nav}) {
  const s = useSettings();
  const [dlg, setDlg] = useState<
    'resetAll' | 'contact' | {title: string; message: string} | null
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
      <Spacer h={16} />
      <T size={18}>Card text alignment</T>
      <Spacer h={8} />
      <Segmented
        options={[
          {value: 0, label: 'Centered'},
          {value: 1, label: 'Left'},
        ]}
        value={s.leftAlignCards ? 1 : 0}
        onChange={v => set({leftAlignCards: v === 1})}
      />
      <Spacer h={16} />
      <T size={18}>Display size</T>
      <T size={14} muted>
        Makes everything in Flashcards larger: text, buttons and rows.
      </T>
      <Spacer h={8} />
      <Segmented
        options={DISPLAY_SIZES}
        value={s.displayCustom ? -1 : s.displayScale}
        onChange={v =>
          set(
            v === -1
              ? {displayCustom: true}
              : {displayScale: v, displayCustom: false},
          )
        }
      />
      {s.displayCustom ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            marginTop: 8,
          }}>
          <BarButton
            label="−"
            accessibilityLabel="Smaller"
            onPress={() =>
              set({
                displayScale: Math.max(
                  CUSTOM_MIN,
                  s.displayScale - CUSTOM_STEP,
                ),
              })
            }
          />
          <T size={18} bold style={{minWidth: 80, textAlign: 'center'}}>
            {`${s.displayScale}%`}
          </T>
          <BarButton
            label="+"
            accessibilityLabel="Larger"
            onPress={() =>
              set({
                displayScale: Math.min(
                  CUSTOM_MAX,
                  s.displayScale + CUSTOM_STEP,
                ),
              })
            }
          />
        </View>
      ) : null}

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
      <Spacer h={14} />
      <T size={18}>Double-tap a folder or deck</T>
      <T size={14} muted>
        Opens its cards in full screen, in:
      </T>
      <Spacer h={8} />
      <Segmented
        options={[
          {value: 1, label: 'Practice'},
          {value: 0, label: 'Study'},
        ]}
        value={s.doubleTapPractice ? 1 : 0}
        onChange={v => set({doubleTapPractice: v === 1})}
      />
      <Spacer h={14} />
      <T size={18}>Full-screen buttons</T>
      <T size={14} muted>
        Next to Regular view. They appear once the answer shows.
      </T>
      <ToggleRow
        title="Edit"
        value={s.fullScreenEdit}
        onChange={v => set({fullScreenEdit: v})}
      />
      <Divider />
      <ToggleRow
        title="Star"
        value={s.fullScreenStar}
        onChange={v => set({fullScreenStar: v})}
      />
      <Divider />
      <ToggleRow
        title="List of cards"
        value={s.fullScreenAllCards}
        onChange={v => set({fullScreenAllCards: v})}
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
              {value: 14, label: 'Biweekly'},
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
        }>{`Flashcards ${VERSION} for Supernote. Calm, focused study.`}</T>
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

      <SectionTitle>Contact</SectionTitle>
      <T size={15}>
        Found a bug, or have an idea for Flashcards? We'd like to hear it.
      </T>
      <Spacer h={10} />
      <Button
        label="Report a bug or suggest a feature"
        onPress={() => setDlg('contact')}
      />
      <Spacer h={24} />

      {dlg === 'contact' ? (
        <ContactDialog onDismiss={() => setDlg(null)} />
      ) : dlg === 'resetAll' ? (
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

/**
 * How to report a bug or ask for a feature. Flashcards has no internet
 * access, so this only says where to write and what helps.
 */
export function ContactDialog({onDismiss}: {onDismiss: () => void}) {
  return (
    <Dialog onDismiss={onDismiss}>
      <T size={22} bold>
        Bugs and ideas
      </T>
      <Spacer h={10} />
      <T size={16}>Email</T>
      <T size={20} bold selectable>
        {CONTACT_EMAIL}
      </T>
      <Spacer h={10} />
      <T size={16}>or open an issue at</T>
      <T size={17} bold selectable>
        {`${PROJECT_URL}/issues`}
      </T>
      <Spacer h={16} />
      <T size={16} bold>
        For a bug, it helps to say:
      </T>
      <T size={15}>
        {`• Flashcards ${VERSION}, and your Supernote (Manta, Nomad…) and its software version\n• What you did, step by step\n• What you expected, and what happened instead\n• For a note or document problem: whether it was a note, a PDF or an ebook`}
      </T>
      <Spacer h={12} />
      <T size={15} muted>
        A photo of the screen is often the quickest way to show it.
      </T>
      <Spacer h={16} />
      <Button label="Done" primary onPress={onDismiss} />
    </Dialog>
  );
}
