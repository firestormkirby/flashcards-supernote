/**
 * Cards — plugin entry point.
 *
 *  1. Register the React component (its name must equal PluginConfig.json's pluginKey).
 *  2. Init the SDK straight after.
 *  3. Register the buttons:
 *     - "Cards" on the toolbar (notes and documents): opens the panel.
 *     - "Picture card" on the toolbar: a picture of part of the current page.
 *     - "Make card" on the lasso toolbar: handwriting → text card.
 *     - "Picture card" on the lasso toolbar: whatever is lassoed → picture card.
 *     - "Make card" on the document reader's text-selection toolbar:
 *       selected PDF/EPUB text → card.
 *  4. Start loading the library and settings so the panel opens warm.
 *
 * @format
 */

import {AppRegistry, Image} from 'react-native';
import {PluginManager} from 'sn-plugin-lib';
import App from './App';
import {name as appName} from './app.json';
import {captureDocSelection} from './src/sdk/docSelection';
import {captureLassoCard} from './src/sdk/lassoCard';
import {capturePage, captureLassoPicture} from './src/sdk/pictureCapture';
import {
  BTN_DOC_TEXT_CARD,
  BTN_LASSO_CARD,
  BTN_LASSO_PICTURE,
  BTN_OPEN,
  BTN_PAGE_PICTURE,
  installRouter,
  openPanel,
  setPanelIntent,
} from './src/sdk/router';
import {loadLibrary} from './src/storage/libraryStore';
import {loadSettings} from './src/storage/settingsStore';

AppRegistry.registerComponent(appName, () => App);

// Must be the first SDK call after registerComponent.
PluginManager.init();

function iconUri() {
  try {
    const src = Image.resolveAssetSource(require('./assets/icon.png'));
    return (src && src.uri) || '';
  } catch (e) {
    console.warn('[cards] icon resolution failed', e);
    return '';
  }
}
const ICON = iconUri();

// In notes and in the document reader (PDF, EPUB), so you can study while reading.
PluginManager.registerButton(1, ['NOTE', 'DOC'], {
  id: BTN_OPEN,
  name: JSON.stringify({en: 'Cards'}),
  icon: ICON,
  showType: 0,
});

// A picture of part of the page: captures the page you're on (a PDF or ebook
// page as it is rendered, or a note page's ink without its ruled template),
// then the panel opens on it so you can mark the region you want. No text
// selection needed — this is for diagrams, figures, and anything else.
PluginManager.registerButton(1, ['NOTE', 'DOC'], {
  id: BTN_PAGE_PICTURE,
  name: JSON.stringify({en: 'Picture card'}),
  icon: ICON,
  showType: 0,
});

// Lasso toolbar. `editDataTypes` is REQUIRED on type-2 buttons: NOTE builds a
// HashSet from it with no null check, and a missing value force-closes the
// whole NOTE app when the lasso menu opens. Values are a 0–5 index, not
// ElementType constants: 0=stroke 1=title 2=picture 3=text 4=link 5=geometry.
// Only strokes and text boxes can be recognised, so only those offer it.
// In DOC this covers handwriting written on top of a PDF; the PDF's own
// printed text isn't lassoable, which is what the next button is for.
PluginManager.registerButton(2, ['NOTE', 'DOC'], {
  id: BTN_LASSO_CARD,
  name: JSON.stringify({en: 'Make card'}),
  icon: ICON,
  showType: 0,
  editDataTypes: [0, 3],
});

// Lasso → picture: exactly what's lassoed (a drawing, a sticker, an inserted
// picture, handwriting) becomes the card's picture, with nothing to crop.
// Every lassoable type except links, which have nothing to show.
PluginManager.registerButton(2, ['NOTE', 'DOC'], {
  id: BTN_LASSO_PICTURE,
  name: JSON.stringify({en: 'Picture card'}),
  icon: ICON,
  showType: 0,
  editDataTypes: [0, 1, 2, 3, 5],
});

// Text-selection toolbar, document reader only: select printed text in a
// PDF or EPUB and turn it into a card.
PluginManager.registerButton(3, ['DOC'], {
  id: BTN_DOC_TEXT_CARD,
  name: JSON.stringify({en: 'Make card'}),
  icon: ICON,
  showType: 0,
});

installRouter(event => {
  if (event && event.id === BTN_PAGE_PICTURE) {
    capturePage().then(result => {
      if (result.image) {
        setPanelIntent({kind: 'cropPicture', image: result.image});
      } else {
        setPanelIntent({
          kind: 'newCardDraft',
          front: '',
          back: '',
          note: result.note,
        });
      }
      openPanel();
    });
    return;
  }
  if (event && event.id === BTN_LASSO_PICTURE) {
    captureLassoPicture().then(result => {
      setPanelIntent({
        kind: 'newCardDraft',
        front: '',
        back: '',
        frontImage: result.image,
        note: result.image
          ? 'The picture is on the front. Write the answer on the back, or tap Swap sides.'
          : result.note,
      });
      openPanel();
    });
    return;
  }
  if (event && event.id === BTN_DOC_TEXT_CARD) {
    captureDocSelection().then(result => {
      setPanelIntent({kind: 'newCardDraft', ...result});
      openPanel();
    });
    return;
  }
  if (event && event.id === BTN_LASSO_CARD) {
    // Read and recognise the selection now, while it still exists and before
    // the panel opens (see src/sdk/lassoCard.ts), then open the editor.
    captureLassoCard().then(result => {
      setPanelIntent({kind: 'newCardDraft', ...result});
      openPanel();
    });
    return;
  }
  // The main button just opens the panel wherever the user left it.
  openPanel();
});

loadSettings();
loadLibrary();
