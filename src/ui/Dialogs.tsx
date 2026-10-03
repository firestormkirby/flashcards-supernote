import React from 'react';
import {View} from 'react-native';
import {Button, Dialog, Spacer, T} from './kit';

function Tip({lead, rest}: {lead: string; rest: string}) {
  return (
    <View style={{marginBottom: 12}}>
      <T size={16} bold>
        {lead}
      </T>
      <T size={15}>{rest}</T>
    </View>
  );
}

export function WelcomeDialog({onDone}: {onDone: () => void}) {
  return (
    <Dialog onDismiss={onDone}>
      <T size={23} bold center>
        Welcome to Cards
      </T>
      <Spacer h={8} />
      <T size={16} muted center>
        Flashcards for calm, focused study, right inside your notebook. A few
        example decks are on Home to try.
      </T>
      <Spacer h={20} />
      <Tip
        lead="Study or Practice?"
        rest="Study shows cards when they're due, so you remember them longer. Practice runs through cards any time without changing that schedule."
      />
      <Tip
        lead="▶ at the top of a folder"
        rest="studies or practices just that folder's cards."
      />
      <Tip
        lead="⋮ next to a folder or deck"
        rest="renames, moves, arranges, exports, or deletes it. Pressing and holding does the same."
      />
      <Tip
        lead="+ New"
        rest="writes a card, deck, or folder right on your device."
      />
      <Tip
        lead="Make card"
        rest="Lasso some handwriting in a note or on a PDF, or select text in a PDF or ebook, then tap Make card. It opens as a new card."
      />
      <Tip
        lead="Picture card"
        rest="Put a picture on a card: tap Picture card in the toolbar to mark part of the page (a diagram in a PDF, say), or lasso a drawing or sticker and tap Picture card in the lasso toolbar."
      />
      <Tip
        lead="Import"
        rest="brings in decks you write on a computer. The Import page shows how."
      />
      <Spacer h={6} />
      <Button label="Get started" primary onPress={onDone} />
    </Dialog>
  );
}

/** The full-screen guide. `practice` null = the general version (from a deck page). */
export function StudyTipsDialog({
  practice,
  onOkay,
}: {
  practice: boolean | null;
  onOkay: () => void;
}) {
  return (
    <Dialog onDismiss={onOkay}>
      <T size={22} bold>
        {practice === true
          ? 'Practicing in full screen'
          : practice === false
          ? 'Studying in full screen'
          : 'Full-screen tips'}
      </T>
      <Spacer h={8} />
      <T size={15}>
        Cards open full screen, with nothing but the card in view.
      </T>
      <Spacer h={14} />
      {[
        ['Middle', 'show the answer'],
        ['Right side', 'next card'],
        ['Left side', 'previous card'],
      ].map(([zone, action]) => (
        <View key={zone} style={{flexDirection: 'row', marginBottom: 6}}>
          <T size={16} bold style={{width: 110}}>
            {zone}
          </T>
          <T size={16}>{action}</T>
        </View>
      ))}
      <Spacer h={6} />
      <T size={15}>
        {practice === true
          ? 'Moving on after seeing the answer counts as “Got it.”'
          : practice === false
          ? 'Moving on after seeing the answer counts as “Good.” For Again or Easy, use the regular view.'
          : 'Moving on after seeing the answer counts as “Good” in Study and “Got it” in Practice. For Again or Easy, use the regular view.'}
      </T>
      <Spacer h={10} />
      <T size={15}>
        “Regular view” in the corner switches to buttons, the star, editing, and
        the card list. ✕ ends the session.
      </T>
      <Spacer h={18} />
      <Button label="Okay" primary onPress={onOkay} />
    </Dialog>
  );
}

export function BackupDialog({
  everyDays,
  onLater,
  onExport,
}: {
  everyDays: number;
  onLater: () => void;
  onExport: () => void;
}) {
  return (
    <Dialog onDismiss={onLater}>
      <T size={22} bold>
        Time for a backup?
      </T>
      <Spacer h={10} />
      <T size={15}>
        {`It's been over ${
          everyDays <= 14 ? 'two weeks' : 'a month'
        } since you saved a copy of your cards. ` +
          'Export them to the EXPORT folder, then copy that folder to a computer or let your cloud sync pick it up.'}
      </T>
      <Spacer h={18} />
      <Button label="Go to Export" primary onPress={onExport} />
      <Spacer h={10} />
      <Button label="Not now" onPress={onLater} />
      <Spacer h={6} />
      <T size={13} muted center>
        You can turn this reminder off in Settings.
      </T>
    </Dialog>
  );
}
