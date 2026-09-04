# Changelog

All notable changes to Vokari will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] - 2026-09-04

### Added
- **Play All audio** — a "▶ Play all" control in the popup library list and a "▶ Play All" control on the review page reads through the current word list (or review session queue) aloud, one word after another, optionally including the translation in your target language. Adjustable speed, and it follows along visually (highlighting the word/card being read).
- **Story mode** (new `story.html` page, tucked into the toolbar's **⋯** menu since it's used less often than daily review) — turns a chosen word pool (last N days/weeks/months, any level) into a short, natural-sounding AI-generated story via Gemini. Stories pick whichever words fit naturally — never forced to cram in every word — so generating several short stories from the same pool is the expected flow, not one long word-stuffed one. Words used are highlighted with the saved translation on hover, the whole story can be read aloud, favorited, or deleted, and generations can optionally continue the previous story for the same pool. Every story generated is kept permanently (no cap).
- **Story export/import** — dedicated "⬇ Export stories" / "⇧ Import stories" buttons on the Story mode page save/restore every story ever generated (across every word pool) as its own `vokari_stories.json` file, kept completely separate from the word-list Export/Import (Sync) file. Import merges by story id, so importing the same file twice is safe.
- **Audio export to a downloadable `.wav` file** — a "🎧 Create Audio File" control on the review page turns the current session's words (optionally + translations) into one combined audio file via Gemini's text-to-speech, and a 🎧 icon on each story in Story mode does the same for that story. Once generated, files can be downloaded locally or uploaded straight to Google Drive with "☁ Save to Drive" (for easy playback on a phone via the Drive app), using a narrow `drive.file` OAuth scope that only ever touches files this extension itself created. Requires a one-time Google Cloud Console setup — see the "Audio export & Google Drive sync" section in the README.

### Changed
- Added the `unlimitedStorage` permission so the full story history can be kept without hitting the default storage quota.
- Added the `identity` permission and a `www.googleapis.com` host permission to support Google Drive uploads.

## [1.2.1] - 2026-08-29

### Changed
- **Compacted the popup library list** to just word + translation (plus the 🔊/✎/✕ controls and level badge). The date-saved, context snippet, and explanation/similar-words/notes previews that used to print under each entry are no longer shown there — they're still fully there in the entry (viewable/editable via ✎ edit, and still included in CSV/Sync export), just not cluttering the compact list view.
- The word heading in the standalone ✎ edit window now matches the popup list's word size (it was rendering noticeably larger than everywhere else).

### Fixed
- **Import (Sync) was silently dropping any word saved without a translation.** The importer required a truthy translation on every incoming entry — a leftover from before blank translations were allowed — so a word you saved with no translation (see 1.2.0) would vanish on export/import instead of round-tripping like everything else. It now requires only that the word itself be present.
- **Escape could silently discard an in-progress edit.** In both the standalone ✎ edit window and the review card's ✎ edit overlay, pressing Escape closed the whole editor even while typing inside a field — including mid-IME-composition, which matters here more than most extensions since you're often typing translations in Chinese/Japanese/Korean. Escape now only closes the editor when focus isn't inside a text field.

### Added
- `LICENSE` file (MIT) — the README already linked to one, but it didn't exist in the repo. Fill in your name in the copyright line before you publish anywhere.

## [1.2.0] - 2026-08-29

### Changed
- **Simplified to a 3-level review system** (Monthly → Weekly → Every 3 days). New words still start at the same tier as before, now called level 3. Grading is simpler too: **Remembered** still drops a word one level (towards monthly); **Forgot** now leaves it at its current level instead of pushing it to a harder tier. Existing words previously at level 4 or 5 are migrated down to level 3 automatically. The level filter on the review page is now L1–L3.
- **Context is now editable**, in both the popup's ✎ edit window and the review card's ✎ edit overlay — previously it could only be captured automatically at save time.
- The review page's **"Last N days"** scope now defaults to 3 (was 7). Switching to "Last N weeks"/"Last N months" now also pre-fills a sensible default (2 and 1, respectively) instead of carrying over whatever number was last typed.

### Fixed
- **Saving without a translation now actually works.** Previously, if auto-translate failed, Save was blocked until you typed something into the translation field — but selecting text elsewhere on the page (e.g. to copy a translation from another spot, or from another tab) closed the popup instantly, with no way to get back into it. The capture popup now stays open through that kind of click/selection while it's waiting on a manual translation, and Save now works even if you leave the field blank — you can always fill the translation in later via ✎ edit.
- **The word-editing window no longer disappears mid-edit.** The toolbar popup's ✎ edit form used to live inside the toolbar popup itself, which — like any Chrome extension toolbar popup — closes automatically the instant it loses focus, silently discarding whatever you'd typed if you switched tabs/apps to copy some text. Editing now opens in its own small standalone window that stays open regardless of focus changes, until you click Save or Cancel.

## [1.1.0] - 2026-08-27

### Added
- Edit meaning/notes directly from the review card (✎ button on the flashcard) without leaving the review session — same underlying edit as the popup's inline editor, including safe carry-over of cached AI sentences/writing-practice history if the meaning changes.
- Show/hide controls for the AI Example (left) and Your Practice (right) side panels on the review page, so the flashcard can be reviewed without the extra columns. State persists across sessions.
- Two new template fields per word: **Explanation** (English-language definition) and **Similar words** (synonyms/related terms), editable from the same ✎ edit form as Notes — in both the popup's library list and the review card. Previews of both appear in the popup list, same as Notes already did.
- **"Show on card" field toggles** on the review page — checkboxes for Context, Explanation, Similar words, and Notes let you choose which recall-aid fields appear on the flashcard. Persists across sessions. Context/Explanation show before reveal (English-side hints); Similar words/Notes stay reveal-gated since they can echo the answer directly. All four are reveal-gated in "Type the word" mode.
- CSV export now includes Explanation and Similar words columns.

### Fixed
- Saving a word is no longer blocked when auto-translate fails. The translation field becomes editable in the capture popup so you can type or paste your own translation (e.g. from google.com/translate) and still save the word, instead of getting stuck on "Translation failed" with a Save button that did nothing.

### Removed
- The source-URL field has been dropped from saved entries, CSV export, and sync merge logic, to keep entries compact. Existing entries with a stored URL are unaffected but the field is no longer read, written, or displayed anywhere.

## [1.0.0] - 2026-08-23

Initial public release.

### Added
- Highlight-to-translate: select a word or short phrase (up to 60 characters) on any webpage to see an instant translation popup, powered by Google's public translate endpoint.
- Save translated words to a personal vocabulary library, stored locally via `chrome.storage.local`, including source/target language, surrounding context snippet, source URL, and timestamp.
- Toolbar popup to browse, search, delete, and export the saved library (CSV and Anki-import formats).
- Spaced-repetition review system with a 5-level cadence (monthly → daily), simple two-button grading (Remembered / Forgot), and automatic migration of pre-existing entries to level 3.
- Review page controls: scope filter (Due now / Last N days-weeks-months) and per-level (L1–L5) filtering, combinable.
- Deck navigation on the review page — Prev/Next, keyboard arrow support, one-click "Knew it" grading, and protection against re-grading a card already graded in the session.
- Daily background alarm with a Chrome notification when words are due for review.
- Text-to-speech pronunciation (🔊) for every word, using Chrome's built-in Web Speech API — works offline, no extra permissions.
- AI example-sentence generation on the review card via the Gemini API (user-supplied API key), weaving in the current word plus two others from the library, with persistent per-word history (up to 8, favorites protected from trimming) and a "Past sentences" browser.
- Optional auto-generate-on-open setting for example sentences.
- AI writing-practice panel: write your own sentence with the target word and have Gemini polish it, with a side-by-side diff view (highlighted additions/removals) and a short explanation of corrections. Includes its own persistent history and favorites.
- Popup-collision handling so the extension's translation popup avoids overlapping other extensions' (e.g. Google Translate's) select-to-translate popups.
- Manual cross-device sync via Export (Sync) / Import (Sync) JSON files, with field-level merge logic that preserves whichever copy is further along and never regresses review progress. Includes example-sentence and writing-practice history/favorites in the sync payload.

[Unreleased]: https://github.com/gjdragon/vokari/compare/v2.0.0...HEAD
[2.0.0]: https://github.com/gjdragon/vokari/compare/v1.2.1...v2.0.0
[1.2.1]: https://github.com/gjdragon/vokari/compare/v1.2.0...v1.2.1
[1.2.0]: https://github.com/gjdragon/vokari/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/gjdragon/vokari/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/gjdragon/vokari/releases/tag/v1.0.0
