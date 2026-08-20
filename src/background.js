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
    getReviewQueue(message.scope, message.amount).then((queue) => sendResponse({ ok: true, queue }));
    return true;
  }

  if (message.type === "REVIEW_CARD") {
    reviewCard(message.key, message.remembered).then((result) => sendResponse({ ok: true, ...result }));
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
async function getReviewQueue(scope, amount) {
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
