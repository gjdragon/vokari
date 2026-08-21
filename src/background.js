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

function sentenceKeyFor(entry) {
  return `${entry.word.toLowerCase()}|${entry.translation}`;
}

function trimSentenceList(list) {
  if (list.length <= MAX_SENTENCES_PER_WORD) return list;
  const sorted = list.slice().sort((a, b) => (a.generatedAt || 0) - (b.generatedAt || 0));
  while (sorted.length > MAX_SENTENCES_PER_WORD) {
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
  const list = trimSentenceList([...(sentenceCache[sKey] || []), record]);
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

// --- 5-level Leitner-style scheduling ---
// Level 1 = best known (reviewed monthly)  ...  Level 5 = struggling (reviewed daily).
// New words start at level 3 (weekly) and move exactly one level per review:
// remembered -> level - 1 (down towards monthly), forgot -> level + 1 (up towards daily).
const DEFAULT_LEVEL = 3;
const LEVEL_INTERVAL_DAYS = { 1: 30, 2: 14, 3: 7, 4: 3, 5: 1 };
const DAY_MS = 24 * 60 * 60 * 1000;

function keyFor(entry) {
  return `${entry.word}|${entry.savedAt}`;
}

// Backfill fields for entries saved before the level system existed
// (or by an older version of the app during a sync import). Non-destructive:
// it only fills in what's missing, it never changes an existing level/due.
function ensureLevelFields(entry) {
  if (entry.level === undefined) entry.level = DEFAULT_LEVEL;
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
      .catch((err) => {
        console.error(err);
        sendResponse({ ok: false, error: err.message });
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
// levels: optional array of level numbers (1-5) to restrict the queue to, e.g. [4, 5]
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

// remembered: true -> move one level down (towards monthly); false -> one level up (towards daily)
async function reviewCard(key, remembered) {
  const { library = [] } = await chrome.storage.local.get("library");
  const entry = library.find((e) => keyFor(e) === key);
  if (!entry) return {};
  ensureLevelFields(entry);

  entry.level = remembered ? Math.max(1, entry.level - 1) : Math.min(5, entry.level + 1);
  entry.interval = LEVEL_INTERVAL_DAYS[entry.level];
  entry.due = Date.now() + entry.interval * DAY_MS;
  entry.lastReviewed = Date.now();
  entry.reviewCount = (entry.reviewCount || 0) + 1;

  await chrome.storage.local.set({ library });
  return { level: entry.level, interval: entry.interval };
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
      title: "Vocabulary review time",
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
