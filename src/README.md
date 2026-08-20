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

## Daily flashcard review (5-level system)

Each word sits at a **level from 1 to 5**, which determines how often it comes up for review:

| Level | Cadence | Meaning |
|---|---|---|
| 1 | Monthly | Well known |
| 2 | Every 2 weeks | Getting solid |
| 3 | Weekly | **Default for new words** |
| 4 | Every 3 days | Still shaky |
| 5 | Daily | Struggling |

Grading is deliberately simple — two buttons, no judgment calls about "how easy":
- **✅ Remembered** → level drops by 1 (moves towards monthly). A word at level 3 that you remember goes to level 2.
- **❌ Forgot** → level rises by 1 (moves towards daily). A word at level 3 that you forget goes to level 4.

Levels are floored at 1 and capped at 5, so a well-known word can't schedule out past monthly, and a hard word can't review more than once a day.

**Choosing what to review** — the review page (opened via the popup's **Review** button, or the daily notification) has controls at the top:
- **Scope**: **Due now** (default, the normal schedule) or **Last N days / weeks / months** — pulls in every word added in that window regardless of due date, useful for cramming a recent batch (e.g. everything from a trip, an article, or this week's reading) on demand.
- **Level filter** (L1–L5 checkboxes, all on by default): untick levels you don't want. E.g. tick only L4 and L5 to drill just the words you're struggling with, or only L1 to spot-check words you think you've mastered. Combines with the scope — "L4–L5 words due now" or "L1 words from the last month" both work.

The card shows the word's current level (e.g. "Level 3/5 · Weekly") so you can see where it stands before you grade it, and after grading you'll see a short confirmation of the level change and next review date.

**Navigating the deck** — you're not locked into one-card-at-a-time grading:
- **◀ Prev / Next ▶** move between cards without revealing the translation, so you can skim the words in a session before deciding where to focus. Left/Right arrow keys do the same.
- **✅ Knew it** grades a word as remembered *without* needing to click the card and reveal the translation first — for words you're confident on, this is a one-click pass straight to the next card.
- Clicking the card still reveals the translation, after which **❌ Forgot** / **✅ Remembered** grade it normally.
- If you navigate back (Prev) to a card you already graded this session, it reopens showing your answer with a "Graded this session" note instead of the grading buttons, so you can't accidentally grade the same card twice.

Words saved before this system existed (or SM-2-era entries) are migrated automatically the first time you open the review page — they're assigned level 3 without losing their existing due date.

A background alarm still checks once a day and fires a Chrome notification if any words are due, so you don't have to remember to check.

## Pronunciation / sound

Every word — in the on-page capture tooltip, the popup library list, and the review card — has a 🔊 button that speaks it aloud using Chrome's built-in Web Speech API (`speechSynthesis`). This is entirely local: no API key, no network permission, no extra cost, and it works offline once a voice is installed. It uses the language detected when you first translated the word (`sourceLang`), so pronunciation should default to the right accent/voice for that language automatically.

Two things worth knowing:
- **Voice quality/coverage varies by OS.** Windows, macOS, and ChromeOS all ship a different set of built-in voices, so some languages sound more natural than others, and a few obscure languages may fall back to a generic voice. There's nothing to configure — Chrome picks the best installed match for the word's language automatically.
- **On the review card**, the 🔊 button works *before* you reveal the translation, so you can practice listening/pronunciation as its own recall step, separate from checking the meaning.

If you ever want higher-fidelity, human-recorded audio, that's a separate future add-on (e.g. the Free Dictionary API's audio clips) rather than an extension of this — it only covers English and would need a new host permission, so it's not part of the default setup.

## Popup collision with other extensions (e.g. Google Translate's own popup)

If you also use the Google Translate browser extension, its own select-to-translate popup and this extension's popup can compete for the same spot below your selection. To handle this, the extension now:

- Waits ~200ms after you select text before showing its own popup, giving other extensions' popups time to render first.
- Detects any newly-appeared floating popup nearby and, if it would overlap, places its own popup just below that popup instead — or above your selection if there isn't room below.

This is a general fix (not hardcoded to Google Translate specifically), so it should also help with other dictionary/translation extensions you might have installed. If you'd rather not deal with two popups at all, you can turn off Google Translate's own select-popup from its extension settings (click its toolbar icon → gear/settings) and rely on this extension's popup alone, since it already provides translation and saving in one place.

## Syncing between multiple PCs (no cloud account needed)

The extension stays fully local — nothing leaves your machine automatically. To keep two or more PCs' word lists in sync, use the two new buttons in the popup footer:

- **Export (Sync)** — downloads a `vocabulary_sync.json` file containing every field, including review progress (level, due date, review count). This is different from the CSV/Anki exports above, which are one-way and don't round-trip.
- **Import (Sync)** — pick a previously exported `.json` file and it **merges** into your current library:
  - Words that don't exist yet are added.
  - Words that exist on both sides keep whichever copy is further along (lower level = more familiar, wins ties by review count) — so importing an older file can never undo reviews you've already done elsewhere.
  - A summary ("X new, Y updated, Z already up to date") shows after each import.

**Recommended workflow — sync via a cloud-drive folder you already have (Dropbox/Google Drive/OneDrive/iCloud):**

1. On PC A: click **Export (Sync)**, save `vocabulary_sync.json` straight into your synced folder (or move it there after saving).
2. The synced folder replicates the file to PC B automatically (that's the cloud drive doing the file sync — the extension itself has no network access to your account).
3. On PC B: click **Import (Sync)** and pick that file. Its words merge in.
4. Repeat in reverse (export from B, import on A) to bring A up to date with anything added on B.

It's a manual two-click sync rather than automatic/real-time, but it keeps the extension fully standalone with no account, no server, and no data leaving your control except through storage you already trust.

## Possible next steps

- Add pronunciation audio playback using the Web Speech API.
- Automate the sync-folder workflow above with a Chrome alarm that periodically writes an export to a fixed path (would need the `downloads` permission's overwrite behavior, or File System Access API where supported).
