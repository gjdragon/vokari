# Changelog

All notable changes to Vokari will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/gjdragon/vokari/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/gjdragon/vokari/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/gjdragon/vokari/releases/tag/v1.0.0
