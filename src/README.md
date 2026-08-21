# Vokari — Translate & Save

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

## Sentence practice (Gemini API)

On the review card, a **✨ Make a sentence** button generates one example sentence built around the word you're studying, using Gemini. It's meant as a memorization aid: seeing a word used in context sticks better than the bare word/translation pair.

- **Setup**: open the toolbar popup → **✨ Sentence practice settings (Gemini API)** → paste in your own Gemini API key (get one at [aistudio.google.com/apikey](https://aistudio.google.com/apikey)). Optionally set a specific model name (defaults to `gemini-3.6-flash`). The key is stored locally via `chrome.storage.local` and only ever sent to Google's Gemini endpoint when a sentence is generated — never anywhere else.
- **If you get a 404 "model no longer available" error**: Google retires/renames Flash model IDs periodically. Type the current model name (check [ai.google.dev/gemini-api/docs/models](https://ai.google.dev/gemini-api/docs/models) or the error message itself, which usually names the replacement) into the Model field in settings — no code changes needed.
- **How it picks words**: each sentence targets the current card's word and tries to weave in 2 more randomly-picked words from your saved library, so review doubles as light spaced repetition across words, not just one at a time. Gemini is told it's fine to use ordinary common words to keep the sentence natural, and to drop any of the 2 extra words if including them would force something awkward.
- **Persistent history, not just this session**: every sentence you generate for a word is saved (up to 8 per word — the oldest non-favorited one is dropped first once you're over the cap) via `chrome.storage.local`, so they're still there the next time you open the review page, even after closing the tab or restarting Chrome. Click **✨ Make another sentence** to add a fresh one to that word's history rather than replacing it.
- **Favorites**: click the ☆ star in the top-right of the sentence box to mark the one currently shown as a favorite (★). Favorited sentences are never auto-trimmed from the history, and when merging libraries via Import (Sync), a favorite on either side wins.
- **Revisit past sentences**: once a word has more than one generation saved, a **Past sentences (N)** link appears under the sentence box — click it to expand a short list of everything generated for that word so far (favorites marked with ★); clicking any entry shows it in the card again.
- **Auto-generate toggle**: in the same settings panel, **"Auto-generate a sentence when opening each review card"** controls whether a sentence is generated automatically the first time you land on a card with no saved sentence yet (costs one API call and a couple seconds of wait per new card), or only when you click the button yourself (off by default — keeps review fast, and you only pay the wait for words you actually want a sentence for). Either way, once a sentence exists for a word it's shown instantly from the saved history — no regeneration needed.
- The words actually used in the sentence are highlighted so they're easy to spot at a glance.
- If no API key is set, or a request fails (bad key, rate limit, network issue), the button shows an inline error instead of breaking the review flow.
- **Syncing across PCs**: the sentence history (including favorites) is included automatically in the **Export (Sync)** / **Import (Sync)** files in the popup footer, alongside your word library — no separate export needed. Import merges by sentence, so re-importing an older file never loses sentences or favorites added elsewhere.

## Writing practice (Gemini API)

Below the example-sentence panel, a second panel lets you write your **own** sentence with the word, then has Gemini polish it — correcting grammar, spelling, and word choice while keeping your original meaning. Both versions are kept side by side so you can see exactly what changed, which is where a lot of the actual grammar learning happens.

- **How to use it**: type a sentence using the current card's word into the text box and click **✨ Polish with AI**. Your original and the polished version appear stacked, with word-level differences highlighted — ~~struck-through red~~ for what was removed/changed from your version, and **green** for what Gemini added or changed it to. A short bulleted explanation (e.g. "changed 'goed' to 'went' — irregular past tense") appears underneath when Gemini made a correction worth explaining.
- **Uses the same Gemini setup** as the example-sentence feature — same API key and model field in the popup's settings panel, no separate configuration needed.
- **Always on demand**: unlike example sentences, writing-practice never auto-generates (there's nothing to auto-generate until you've written something) — it only calls the API when you click **✨ Polish with AI**.
- **Persistent history + favorites**: every attempt is saved (up to 8 per word, oldest non-favorited one dropped first) via `chrome.storage.local`, so past attempts are still there next time you review that word. Click the ☆ star next to "Polished by AI" to favorite the version currently shown; favorited attempts are never auto-trimmed. A **Past attempts (N)** link expands a list of everything you've written for that word — click any entry to bring it back into the comparison view, or click the ✕ next to an entry to delete it permanently.
- **Independent from example sentences**: this is a completely separate feature/history from the ✨ example-sentence generator above — writing your own sentences doesn't affect or get affected by the AI-generated examples, and vice versa.
- **Syncing across PCs**: writing-practice history (including favorites) is included automatically in **Export (Sync)** / **Import (Sync)**, right alongside your word library and example-sentence history.

## Popup collision with other extensions (e.g. Google Translate's own popup)

If you also use the Google Translate browser extension, its own select-to-translate popup and this extension's popup can compete for the same spot below your selection. To handle this, the extension now:

- Waits ~200ms after you select text before showing its own popup, giving other extensions' popups time to render first.
- Detects any newly-appeared floating popup nearby and, if it would overlap, places its own popup just below that popup instead — or above your selection if there isn't room below.

This is a general fix (not hardcoded to Google Translate specifically), so it should also help with other dictionary/translation extensions you might have installed. If you'd rather not deal with two popups at all, you can turn off Google Translate's own select-popup from its extension settings (click its toolbar icon → gear/settings) and rely on this extension's popup alone, since it already provides translation and saving in one place.

## Syncing between multiple PCs (no cloud account needed)

The extension stays fully local — nothing leaves your machine automatically. To keep two or more PCs' word lists in sync, use the two new buttons in the popup footer:

- **Export (Sync)** — downloads a `vocabulary_sync.json` file containing every field, including review progress (level, due date, review count), saved example sentences/favorites, and writing-practice attempts/favorites. This is different from the CSV/Anki exports above, which are one-way and don't round-trip.
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

- Automate the sync-folder workflow above with a Chrome alarm that periodically writes an export to a fixed path (would need the `downloads` permission's overwrite behavior, or File System Access API where supported).
- Let Gemini vary example-sentence difficulty based on the word's current review level (simpler sentences for level 4-5 struggling words, more complex ones for level 1-2 well-known words).
- Add a lightweight "grammar patterns" view that aggregates the notes across all your writing-practice attempts, to surface recurring mistakes (e.g. "you often mix up past tense of irregular verbs") rather than reviewing them one attempt at a time.
