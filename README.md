# Cards for Supernote

**Calm, offline flashcards with spaced repetition, right inside your Supernote notebook.**

A Supernote NOTE plugin (Manta, Nomad) ported from [**Cards** by mrgrtapk](https://github.com/mrgrtapk/Cards), an e-ink flashcard app for Android. Ported with the original author's permission. The study logic, the file formats and the quiet, high-contrast design all come from that app; this repository rebuilds it on the Supernote plugin SDK so you can study without leaving your notes.

---

## What it does

- **Folders and decks**, nested as deep as you like, sorted A–Z or in your own order.
- **Study and Practice.**
  - **Study** shows cards when they're due and spaces out your reviews with the **FSRS** algorithm, so you remember them longer.
  - **Practice** goes through any cards at any time without changing your schedule.
- **Full-screen studying.** Only the card is on screen. Tap the middle to see the answer, the right side for the next card, the left side for the previous one.
- **Choose which cards:** all, or any mix of due, new and starred.
- **Stars, search, shuffle, dark mode, and three text sizes.**
- **Make card from handwriting.** In any note, lasso what you wrote and tap **Make card** in the lasso toolbar. Cards reads the writing and opens it as a new card. Write `front :: back` to fill in both sides at once.
- **Write cards on the device**, or write them on a computer and import them.
- **Example decks included:** Getting Started, World Capitals, Spanish Basics, and Trivia Night.

## Private and offline

- **No internet permission.** `PluginConfig.json` asks only for file read and write, and those are used only when you import or export.
- **No accounts, ads, analytics or trackers.**
- **Your cards stay in the plugin's private storage.** They leave the plugin only when you choose Export or Save a backup.

---

## Install

1. Build the plugin (see below), or download `cards.snplg` from a release.
2. Copy `cards.snplg` into the `MyStyle` folder on your Supernote.
3. On the device: **Settings › Apps › Plugins › Add plugin**, and pick `cards.snplg`.
4. Open any note and tap **Cards** in the toolbar.

## Importing your cards

1. Write your cards in any plain-text app, or save a spreadsheet as `.csv`.
2. Copy the files (or a folder of them) to the Supernote, for example into `Document` or `INBOX`, by USB, the Supernote Partner app, or cloud sync.
3. In Cards, open **Import › Choose files or a folder**, browse to them, and import.

Each file becomes a deck and folders become folders. Importing a file again after editing it updates the deck and keeps your progress for cards you didn't change.

### How to write cards

The formats are identical to the Android app's, so files work in both.

**One line per card**, with `::` between front and back:

```
Photosynthesis :: Turning light into food
Mitosis :: Cell division
```

**Longer cards**: start the front with `Q:` and the back with `A:`, with a blank line between cards:

```
Q: What are the three
branches of government?
A: Legislative, executive,
and judicial.
```

**From a spreadsheet**: save it as `.csv`. Column A is the front, column B the back:

```
Front,Back
gato,cat
perro,dog
```

Lines starting with `#` are ignored, so you can use them as headings.

## Export and backup

- **Export all cards** writes every deck as a text file into a new folder in `EXPORT`, laid out exactly like the Android app's export zip.
- **Save a backup** writes one `.json` file to `EXPORT` holding everything, including study progress and stars. **Restore a backup** reads it back. The format is the Android app's `library.json` format, so a library can move between the two.

Neither ever overwrites or deletes anything: each export goes into a new, dated folder or file.

---

## Building

Requirements are the Supernote plugin toolchain: Node 18+, JDK 19+, the Android SDK (platform 35, build-tools 35.0.0), and **React Native 0.79.2**, which is locked to the PluginHost runtime. Don't upgrade it.

```bash
npm install
./buildPlugin.sh          # or .\buildPlugin.ps1 on Windows
# → build/outputs/cards.snplg
```

`buildPlugin.sh`, `buildPlugin.ps1` and `android/` are Ratta's plugin template build, unchanged apart from the project name.

### Checks

```bash
npm test            # unit tests + UI flow tests
npm run typecheck
npm run lint
```

- `src/core/core.test.ts` is a port of the Android app's own `CoreLogicTest.kt`, with the same fixtures. It is what shows the TypeScript port behaves like the original: parser, import merge, FSRS scheduling, search, arranging and the saved-file format.
- `src/ui/app.test.tsx` renders the real panel and drives it like a user: first launch, full-screen and regular study (including undo), writing a card, the lasso flow, and importing and exporting a folder.

After editing an example deck in `assets/examples/`, run `node scripts/bundle-examples.js`. A test fails if the two drift apart.

## Project layout

```
index.js                 entry: registers the toolbar and lasso buttons
App.tsx                  root component (with a crash screen that can still be closed)
src/core/                pure logic, ported from the Android app
  fsrs.ts                FSRS-4.5 scheduler
  deckParser.ts          the text/CSV deck formats
  library.ts             folders, decks, cards, import merge, queues, search, export
  codec.ts               saved-library format (same as the Android app)
src/storage/             library file (plugin private dir) and settings
src/sdk/                 Supernote glue: buttons, shared-folder files, lasso → OCR
src/ui/                  screens
```

## Differences from the Android app

- **Export is a folder of text files instead of a .zip**, since a Supernote has no zip tool. The paths inside are the same. Importing a .zip isn't supported; unzip it on a computer first.
- **Make card** (lasso → handwriting recognition → new card) is new, and exists only here.
- **Full backup and restore** (with progress) is new. A plugin's private data may not survive being reinstalled, so this is the safety net.
- There is no Wi-Fi sync and no bottom-bar customisation.

## Status

Built and tested off-device: all logic and UI flow tests pass, and the screens were checked in a browser at Supernote proportions. **It has not been run on a Supernote yet.** These are the things to confirm on a device first:

1. The panel opens from the toolbar button, and **Close ✕** returns to the note.
2. **Make card**: the lasso button appears, and recognition returns text.
3. Import can read from `Document`/`INBOX` once file permission is granted, and Export writes to `EXPORT`.
4. Whether the library survives updating the plugin. If it doesn't, the backup feature covers it, but the README should then say so plainly.

## Credits

- [**Cards**](https://github.com/mrgrtapk/Cards) by mrgrtapk: the original app, its design, logic, example decks and icon.
- [Mudita Mindful Design](https://github.com/mudita/MMD), which inspired the original's e-ink design. Neither app is affiliated with or endorsed by Mudita.
- The [FSRS](https://github.com/open-spaced-repetition) spaced-repetition algorithm.
- Built with the help of Claude Code.
