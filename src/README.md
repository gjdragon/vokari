# Word Catcher — Translate & Save

Highlight any word/phrase on a webpage → see a translation popup → click Save → it goes into your personal vocabulary library, viewable/searchable/exportable from the toolbar icon.

## How to load it (unpacked, for development/personal use)

1. Unzip this folder somewhere permanent (don't delete it after loading — Chrome reads the extension live from disk).
2. Go to `chrome://extensions` in Chrome.
3. Turn on **Developer mode** (top-right toggle).
4. Click **Load unpacked** and select this folder.
5. Pin the extension icon to your toolbar.

## How to use it

1. Set your target language from the toolbar popup dropdown (defaults to Chinese).
2. On any webpage, select/highlight an English word or short phrase.
3. A small popup appears with the translation.
4. Click **Save** to add it to your library.
5. Click the toolbar icon anytime to browse, search, delete, or export your saved words (CSV or Anki-import format).

## Notes / things to know

- Translation is done via Google's public (unofficial) translate endpoint — free, no API key, but not officially supported and rate-limited. If you hit rate limits or want a production-grade setup, swap the `translateText()` function in `background.js` for the official Cloud Translation API (needs a Google Cloud API key and billing).
- Data is stored locally in `chrome.storage.local` — it stays on your machine and isn't synced across devices. If you want cross-device sync, switch to `chrome.storage.sync` (has a smaller size quota, ~100KB) or add a real backend.
- The word length filter (in `content.js`) skips selections longer than 60 characters, to avoid triggering on full paragraphs. Adjust as needed.
- Each saved entry stores the word, translation, source language, target language, a snippet of surrounding context, the source URL, and a timestamp — useful later if you want to build flashcards with real usage examples.

## Daily flashcard review (spaced repetition)

- Every saved word is scheduled using the same SM-2 algorithm Anki uses: new words are due immediately, and each time you review one, the next due date stretches out further if you got it right (1 day → 6 days → longer each time), or resets if you got it wrong.
- Open the toolbar popup — if any words are due, you'll see a banner with a **Review** button. Clicking it opens a flashcard page in a new tab.
- Click a card to reveal the translation, then grade yourself: **Again** (didn't know it — resets the schedule), **Good** (knew it — normal spacing), or **Easy** (knew it well — spaces out further).
- A background alarm checks once a day and fires a Chrome notification if you have cards due, so you don't have to remember to check.

## Popup collision with other extensions (e.g. Google Translate's own popup)

If you also use the Google Translate browser extension, its own select-to-translate popup and this extension's popup can compete for the same spot below your selection. To handle this, the extension now:

- Waits ~200ms after you select text before showing its own popup, giving other extensions' popups time to render first.
- Detects any newly-appeared floating popup nearby and, if it would overlap, places its own popup just below that popup instead — or above your selection if there isn't room below.

This is a general fix (not hardcoded to Google Translate specifically), so it should also help with other dictionary/translation extensions you might have installed. If you'd rather not deal with two popups at all, you can turn off Google Translate's own select-popup from its extension settings (click its toolbar icon → gear/settings) and rely on this extension's popup alone, since it already provides translation and saving in one place.

## Possible next steps

- Add spaced-repetition scheduling (e.g. simple SM-2 algorithm) directly in the popup.
- Sync library to Google Sheets or Notion via their APIs.
- Add pronunciation audio playback using the Web Speech API.
