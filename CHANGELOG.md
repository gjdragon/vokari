# Changelog

All notable changes to Vokari will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/gjdragon/vokari/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/gjdragon/vokari/releases/tag/v1.0.0
