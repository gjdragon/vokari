// background.js — service worker (Manifest V3)

const DEFAULT_TARGET_LANG = "zh-CN"; // change to your native language code, e.g. "es", "ja", "fr"

async function translateText(text) {
  const targetLangResult = await chrome.storage.local.get("targetLang");
  const targetLang = targetLangResult.targetLang || DEFAULT_TARGET_LANG;

  // Unofficial free endpoint used by many open-source extensions.
  // No API key needed, but it's rate-limited and not an official/supported API.
  // For production use, swap this for the official Cloud Translation API with your own key.
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(
    text
  )}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error("Translate request failed: " + res.status);
  const data = await res.json();

  // Response shape: [[[translatedText, originalText, ...]], ..., detectedSourceLang]
  const translation = data[0].map((chunk) => chunk[0]).join("");
  const sourceLang = data[2] || "auto";

  return { translation, sourceLang, targetLang };
}

// --- Sentence practice (Gemini API) ---
// Generates one example sentence per review card, on demand, weaving in the
// target word plus 2-3 other saved words when it can be done naturally.
// Requires the user's own Gemini API key, set in the popup's settings panel.
const DEFAULT_GEMINI_MODEL = "gemini-3.6-flash";

// Pick up to `count` other library entries at random to try to include
// alongside the target word. Purely for variety/context — Gemini is told
// it's fine to drop any that don't fit.
function pickRelatedWords(library, targetEntry, count) {
  const candidates = library.filter(
    (e) => e.word.toLowerCase() !== targetEntry.word.toLowerCase() || e.savedAt !== targetEntry.savedAt
  );
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }
  return candidates.slice(0, count);
}

// Sentences are cached persistently (not just per session), keyed by word+translation
// identity rather than savedAt — that stays stable across sync imports where the same
// word might have a different savedAt on two PCs. Each word keeps up to MAX_SENTENCES_
// PER_WORD generations; when trimming, favorited ones are never dropped automatically.
const MAX_SENTENCES_PER_WORD = 8;
// Writing-practice attempts (user sentence + AI-polished version) use the same cache
// shape and trimming rule, kept in a separate storage bucket.
const MAX_USER_SENTENCES_PER_WORD = 8;

function sentenceKeyFor(entry) {
  return `${entry.word.toLowerCase()}|${entry.translation}`;
}

// Generic trimmer for either cache: records need only an `id`, `favorite`, and a
// timestamp field (`generatedAt` for AI examples, `createdAt` for writing-practice
// attempts) — whichever is present is used for oldest-first ordering.
function trimRecordList(list, max) {
  if (list.length <= max) return list;
  const sorted = list.slice().sort((a, b) => (a.generatedAt || a.createdAt || 0) - (b.generatedAt || b.createdAt || 0));
  while (sorted.length > max) {
    const idx = sorted.findIndex((s) => !s.favorite);
    if (idx === -1) break; // everything left is favorited — stop trimming
    sorted.splice(idx, 1);
  }
  return sorted;
}

async function getSentences(sKey) {
  const { sentenceCache = {} } = await chrome.storage.local.get("sentenceCache");
  return sentenceCache[sKey] || [];
}

async function addSentence(sKey, record) {
  const { sentenceCache = {} } = await chrome.storage.local.get("sentenceCache");
  const list = trimRecordList([...(sentenceCache[sKey] || []), record], MAX_SENTENCES_PER_WORD);
  sentenceCache[sKey] = list;
  await chrome.storage.local.set({ sentenceCache });
  return list;
}

async function toggleSentenceFavorite(sKey, id) {
  const { sentenceCache = {} } = await chrome.storage.local.get("sentenceCache");
  const list = sentenceCache[sKey] || [];
  const rec = list.find((s) => s.id === id);
  if (rec) rec.favorite = !rec.favorite;
  sentenceCache[sKey] = list;
  await chrome.storage.local.set({ sentenceCache });
  return list;
}

// --- Writing practice: user writes a sentence, Gemini polishes it, both are kept. ---

async function getUserSentences(sKey) {
  const { userSentenceCache = {} } = await chrome.storage.local.get("userSentenceCache");
  return userSentenceCache[sKey] || [];
}

async function addUserSentence(sKey, record) {
  const { userSentenceCache = {} } = await chrome.storage.local.get("userSentenceCache");
  const list = trimRecordList([...(userSentenceCache[sKey] || []), record], MAX_USER_SENTENCES_PER_WORD);
  userSentenceCache[sKey] = list;
  await chrome.storage.local.set({ userSentenceCache });
  return list;
}

async function toggleUserSentenceFavorite(sKey, id) {
  const { userSentenceCache = {} } = await chrome.storage.local.get("userSentenceCache");
  const list = userSentenceCache[sKey] || [];
  const rec = list.find((s) => s.id === id);
  if (rec) rec.favorite = !rec.favorite;
  userSentenceCache[sKey] = list;
  await chrome.storage.local.set({ userSentenceCache });
  return list;
}

async function deleteUserSentence(sKey, id) {
  const { userSentenceCache = {} } = await chrome.storage.local.get("userSentenceCache");
  const list = (userSentenceCache[sKey] || []).filter((s) => s.id !== id);
  userSentenceCache[sKey] = list;
  await chrome.storage.local.set({ userSentenceCache });
  return list;
}

async function polishSentence(targetEntry, userText) {
  const { geminiApiKey, geminiModel } = await chrome.storage.local.get(["geminiApiKey", "geminiModel"]);
  if (!geminiApiKey) {
    throw new Error("No Gemini API key set. Add one in the extension popup under Sentence practice settings.");
  }
  const model = (geminiModel || DEFAULT_GEMINI_MODEL).trim();

  const prompt = `You are a friendly, encouraging language-learning writing tutor.

A learner tried to write a sentence using the word "${targetEntry.word}":
"${userText}"

Tasks:
1. Write a corrected, natural-sounding version that fixes any grammar, spelling, or word-choice issues while preserving the learner's original meaning and intent as closely as possible. Keep the word "${targetEntry.word}" (or a natural grammatical form of it) in the sentence.
2. List, in 1-3 short bullet points, the main things you changed and why — simple enough for a learner to understand (e.g. "changed 'goed' to 'went' — irregular past tense"). If nothing needed to change, return an empty list and say so isn't required, just leave it empty.

Respond with ONLY valid JSON, no markdown code fences, no commentary, in exactly this shape:
{"corrected": "...", "notes": ["...", "..."]}`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model
  )}:generateContent?key=${encodeURIComponent(geminiApiKey)}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.4 },
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Gemini request failed (${res.status}): ${errText.slice(0, 200)}`);
  }

  const data = await res.json();
  const rawText = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";
  const cleaned = rawText.replace(/```json|```/g, "").trim();

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    parsed = { corrected: cleaned, notes: [] };
  }
  if (!parsed.corrected) throw new Error("Gemini response didn't include a corrected sentence.");

  return { corrected: parsed.corrected, notes: Array.isArray(parsed.notes) ? parsed.notes : [] };
}

async function generateSentence(targetEntry, relatedWords) {
  const { geminiApiKey, geminiModel } = await chrome.storage.local.get(["geminiApiKey", "geminiModel"]);
  if (!geminiApiKey) {
    throw new Error("No Gemini API key set. Add one in the extension popup under Sentence practice settings.");
  }
  const model = (geminiModel || DEFAULT_GEMINI_MODEL).trim();
  const otherWords = relatedWords.map((w) => w.word);

  const prompt = `Write ONE natural, meaningful English sentence for a language learner studying vocabulary.

Required word (must appear, in any grammatical form): "${targetEntry.word}"
Other saved words to include if it stays natural: ${otherWords.length ? otherWords.join(", ") : "(none)"}

Rules:
- The sentence must clearly demonstrate the meaning of "${targetEntry.word}".
- Use as many of the other listed words as fit naturally; skip any that would force an awkward sentence.
- You may freely use other common English words not in the list, to make it grammatical and meaningful.
- One sentence only. Keep it simple and clear enough for a learner, not overly long or complex.
- Respond with ONLY valid JSON, no markdown code fences, no commentary, in exactly this shape:
{"sentence": "...", "wordsUsed": ["word1", "word2"]}`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model
  )}:generateContent?key=${encodeURIComponent(geminiApiKey)}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.7 },
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Gemini request failed (${res.status}): ${errText.slice(0, 200)}`);
  }

  const data = await res.json();
  const rawText =
    data?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";
  const cleaned = rawText.replace(/```json|```/g, "").trim();

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    // Model didn't return clean JSON — fall back to using the raw text as the sentence.
    parsed = { sentence: cleaned, wordsUsed: [] };
  }
  if (!parsed.sentence) throw new Error("Gemini response didn't include a sentence.");

  return { sentence: parsed.sentence, wordsUsed: Array.isArray(parsed.wordsUsed) ? parsed.wordsUsed : [] };
}

// --- 3-level Leitner-style scheduling ---
// Level 1 = best known (reviewed monthly) ... Level 3 = default/needs-work (reviewed
// every 3 days). New words start at level 3. Grading only ever moves a word DOWN
// (towards monthly) on a correct recall — a miss just leaves it at its current
// level so it comes back around on the same cadence rather than getting harder.
const DEFAULT_LEVEL = 3;
const LEVEL_INTERVAL_DAYS = { 1: 30, 2: 7, 3: 3 };
const MAX_LEVEL = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

function keyFor(entry) {
  return `${entry.word}|${entry.savedAt}`;
}

// Backfill fields for entries saved before the level system existed
// (or by an older version of the app during a sync import), and migrate any
// entry left over from the old 5-level system (levels 4/5 no longer exist —
// they collapse into the new level 3, the most-frequent tier). Non-destructive
// otherwise: it never changes an existing in-range level/due.
function ensureLevelFields(entry) {
  if (entry.level === undefined) entry.level = DEFAULT_LEVEL;
  if (entry.level > MAX_LEVEL) entry.level = MAX_LEVEL; // old 4/5 levels collapse into 3
  if (entry.level < 1) entry.level = 1;
  if (entry.interval === undefined) entry.interval = LEVEL_INTERVAL_DAYS[entry.level];
  if (entry.due === undefined) entry.due = entry.savedAt || Date.now();
  if (entry.reviewCount === undefined) entry.reviewCount = 0;
  return entry;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "TRANSLATE") {
    translateText(message.text)
      .then(({ translation, sourceLang, targetLang }) => {
        sendResponse({ ok: true, translation, sourceLang, targetLang });
      })
      .catch(async (err) => {
        console.error(err);
        // Even on failure, tell the caller which target language this was for,
        // so a manually-typed fallback translation still gets tagged correctly.
        const { targetLang } = await chrome.storage.local.get("targetLang");
        sendResponse({ ok: false, error: err.message, targetLang: targetLang || DEFAULT_TARGET_LANG });
      });
    return true; // keep the message channel open for async sendResponse
  }

  if (message.type === "SAVE_WORD") {
    saveWord(message.entry).then(() => sendResponse({ ok: true }));
    return true;
  }

  if (message.type === "GET_REVIEW_QUEUE") {
    getReviewQueue(message.scope, message.amount, message.levels).then((queue) => sendResponse({ ok: true, queue }));
    return true;
  }

  if (message.type === "REVIEW_CARD") {
    reviewCard(message.key, message.remembered).then((result) => sendResponse({ ok: true, ...result }));
    return true;
  }

  if (message.type === "EDIT_WORD_ENTRY") {
    editWordEntry(
      message.key,
      message.translation,
      message.explanation,
      message.similarWords,
      message.notes,
      message.context
    )
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (message.type === "GENERATE_SENTENCE") {
    (async () => {
      try {
        const { library = [] } = await chrome.storage.local.get("library");
        const targetEntry = library.find((e) => keyFor(e) === message.key);
        if (!targetEntry) {
          sendResponse({ ok: false, error: "Word not found in library." });
          return;
        }
        const related = pickRelatedWords(library, targetEntry, 2);
        const { sentence, wordsUsed } = await generateSentence(targetEntry, related);
        const record = {
          id: crypto.randomUUID(),
          sentence,
          wordsUsed,
          generatedAt: Date.now(),
          favorite: false,
        };
        const sentences = await addSentence(sentenceKeyFor(targetEntry), record);
        sendResponse({ ok: true, record, sentences });
      } catch (err) {
        console.error(err);
        sendResponse({ ok: false, error: err.message });
      }
    })();
    return true;
  }

  if (message.type === "GET_SENTENCES") {
    (async () => {
      const { library = [] } = await chrome.storage.local.get("library");
      const targetEntry = library.find((e) => keyFor(e) === message.key);
      if (!targetEntry) {
        sendResponse({ ok: true, sentences: [] });
        return;
      }
      const sentences = await getSentences(sentenceKeyFor(targetEntry));
      sendResponse({ ok: true, sentences });
    })();
    return true;
  }

  if (message.type === "TOGGLE_SENTENCE_FAVORITE") {
    (async () => {
      const { library = [] } = await chrome.storage.local.get("library");
      const targetEntry = library.find((e) => keyFor(e) === message.key);
      if (!targetEntry) {
        sendResponse({ ok: false, error: "Word not found in library." });
        return;
      }
      const sentences = await toggleSentenceFavorite(sentenceKeyFor(targetEntry), message.id);
      sendResponse({ ok: true, sentences });
    })();
    return true;
  }

  if (message.type === "POLISH_SENTENCE") {
    (async () => {
      try {
        const text = (message.text || "").trim();
        if (!text) {
          sendResponse({ ok: false, error: "Write a sentence first." });
          return;
        }
        const { library = [] } = await chrome.storage.local.get("library");
        const targetEntry = library.find((e) => keyFor(e) === message.key);
        if (!targetEntry) {
          sendResponse({ ok: false, error: "Word not found in library." });
          return;
        }
        const { corrected, notes } = await polishSentence(targetEntry, text);
        const record = {
          id: crypto.randomUUID(),
          original: text,
          corrected,
          notes,
          createdAt: Date.now(),
          favorite: false,
        };
        const sentences = await addUserSentence(sentenceKeyFor(targetEntry), record);
        sendResponse({ ok: true, record, sentences });
      } catch (err) {
        console.error(err);
        sendResponse({ ok: false, error: err.message });
      }
    })();
    return true;
  }

  if (message.type === "GET_USER_SENTENCES") {
    (async () => {
      const { library = [] } = await chrome.storage.local.get("library");
      const targetEntry = library.find((e) => keyFor(e) === message.key);
      if (!targetEntry) {
        sendResponse({ ok: true, sentences: [] });
        return;
      }
      const sentences = await getUserSentences(sentenceKeyFor(targetEntry));
      sendResponse({ ok: true, sentences });
    })();
    return true;
  }

  if (message.type === "TOGGLE_USER_SENTENCE_FAVORITE") {
    (async () => {
      const { library = [] } = await chrome.storage.local.get("library");
      const targetEntry = library.find((e) => keyFor(e) === message.key);
      if (!targetEntry) {
        sendResponse({ ok: false, error: "Word not found in library." });
        return;
      }
      const sentences = await toggleUserSentenceFavorite(sentenceKeyFor(targetEntry), message.id);
      sendResponse({ ok: true, sentences });
    })();
    return true;
  }

  if (message.type === "DELETE_USER_SENTENCE") {
    (async () => {
      const { library = [] } = await chrome.storage.local.get("library");
      const targetEntry = library.find((e) => keyFor(e) === message.key);
      if (!targetEntry) {
        sendResponse({ ok: false, error: "Word not found in library." });
        return;
      }
      const sentences = await deleteUserSentence(sentenceKeyFor(targetEntry), message.id);
      sendResponse({ ok: true, sentences });
    })();
    return true;
  }
});

async function saveWord(entry) {
  const { library = [] } = await chrome.storage.local.get("library");

  // Avoid exact duplicate word+translation pairs
  const exists = library.some(
    (item) => item.word.toLowerCase() === entry.word.toLowerCase() && item.translation === entry.translation
  );
  if (!exists) {
    entry.level = DEFAULT_LEVEL;
    entry.interval = LEVEL_INTERVAL_DAYS[DEFAULT_LEVEL];
    entry.due = Date.now(); // new words are due immediately
    entry.reviewCount = 0;
    library.push(entry);
    await chrome.storage.local.set({ library });
  }
}

// Build the review queue for a given scope:
//  - scope "due": everything currently due (the normal daily/weekly/monthly schedule)
//  - scope "days"/"weeks"/"months": everything added within the last `amount` of that
//    unit, regardless of due date — for browsing/cramming a recent batch on demand.
// levels: optional array of level numbers (1-3) to restrict the queue to, e.g. [3]
// to drill just the words you're struggling with. Omitted/empty means no filter.
async function getReviewQueue(scope, amount, levels) {
  const { library = [] } = await chrome.storage.local.get("library");
  library.forEach(ensureLevelFields);
  await chrome.storage.local.set({ library }); // persist any migration once

  const now = Date.now();
  let queue;
  if (scope === "days" || scope === "weeks" || scope === "months") {
    const unitMs = scope === "days" ? DAY_MS : scope === "weeks" ? DAY_MS * 7 : DAY_MS * 30;
    const cutoff = now - amount * unitMs;
    queue = library.filter((e) => (e.savedAt || 0) >= cutoff);
  } else {
    queue = library.filter((e) => (e.due || 0) <= now);
  }

  if (Array.isArray(levels) && levels.length > 0) {
    queue = queue.filter((e) => levels.includes(e.level));
  }

  // Most overdue / oldest first.
  queue.sort((a, b) => (a.due || 0) - (b.due || 0));
  return queue;
}

// remembered: true -> move one level down (towards monthly); false -> stay at the same level
async function reviewCard(key, remembered) {
  const { library = [] } = await chrome.storage.local.get("library");
  const entry = library.find((e) => keyFor(e) === key);
  if (!entry) return {};
  ensureLevelFields(entry);

  entry.level = remembered ? Math.max(1, entry.level - 1) : entry.level;
  entry.interval = LEVEL_INTERVAL_DAYS[entry.level];
  entry.due = Date.now() + entry.interval * DAY_MS;
  entry.lastReviewed = Date.now();
  entry.reviewCount = (entry.reviewCount || 0) + 1;

  await chrome.storage.local.set({ library });
  return { level: entry.level, interval: entry.interval };
}

// Edit a saved word's meaning/notes from anywhere (popup or the review card).
// Mirrors the popup's inline-edit logic: entry identity (keyFor, used by the
// review queue and REVIEW_CARD) is word+savedAt so it never changes here, but
// the sentence-cache key (sentenceKeyFor, word+translation) does when the
// meaning changes — so any cached AI sentences / writing-practice history are
// carried over to the new key rather than orphaned.
async function editWordEntry(key, translation, explanation, similarWords, notes, context) {
  const { library = [] } = await chrome.storage.local.get("library");
  const entry = library.find((e) => keyFor(e) === key);
  if (!entry) throw new Error("Word not found in library.");

  const oldSentenceKey = sentenceKeyFor(entry);
  entry.translation = translation;
  entry.explanation = explanation;
  entry.similarWords = similarWords;
  entry.notes = notes;
  if (context !== undefined) entry.context = context;
  const newSentenceKey = sentenceKeyFor(entry);
  const updates = { library };

  if (oldSentenceKey !== newSentenceKey) {
    const stillUsed = library.some((e) => e !== entry && sentenceKeyFor(e) === oldSentenceKey);
    if (!stillUsed) {
      const { sentenceCache = {}, userSentenceCache = {} } = await chrome.storage.local.get([
        "sentenceCache",
        "userSentenceCache",
      ]);
      if (sentenceCache[oldSentenceKey]) {
        sentenceCache[newSentenceKey] = (sentenceCache[newSentenceKey] || []).concat(sentenceCache[oldSentenceKey]);
        delete sentenceCache[oldSentenceKey];
      }
      if (userSentenceCache[oldSentenceKey]) {
        userSentenceCache[newSentenceKey] = (userSentenceCache[newSentenceKey] || []).concat(
          userSentenceCache[oldSentenceKey]
        );
        delete userSentenceCache[oldSentenceKey];
      }
      updates.sentenceCache = sentenceCache;
      updates.userSentenceCache = userSentenceCache;
    }
  }

  await chrome.storage.local.set(updates);
  return {
    translation: entry.translation,
    explanation: entry.explanation,
    similarWords: entry.similarWords,
    notes: entry.notes,
    context: entry.context,
  };
}

// --- Daily reminder ---
chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create("dailyReviewCheck", { periodInMinutes: 1440 });
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== "dailyReviewCheck") return;
  const { library = [] } = await chrome.storage.local.get("library");
  const dueCount = library.filter((e) => (e.due || 0) <= Date.now()).length;
  if (dueCount > 0) {
    chrome.notifications.create("dailyReviewReminder", {
      type: "basic",
      iconUrl: "icon128.png",
      title: "Vokari — review time",
      message: `You have ${dueCount} word${dueCount === 1 ? "" : "s"} due for review today.`,
      priority: 1,
    });
  }
});

chrome.notifications.onClicked.addListener((notifId) => {
  if (notifId === "dailyReviewReminder") {
    chrome.tabs.create({ url: chrome.runtime.getURL("review.html") });
  }
});
