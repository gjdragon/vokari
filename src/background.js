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

  if (message.type === "REVIEW_CARD") {
    reviewCard(message.key, message.quality).then(() => sendResponse({ ok: true }));
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
    // SRS scheduling fields (SM-2 style). New cards are due immediately.
    entry.repetition = 0;
    entry.interval = 0;
    entry.ease = 2.5;
    entry.due = Date.now();
    library.push(entry);
    await chrome.storage.local.set({ library });
  }
}

// SM-2 spaced repetition update.
// quality: 1 = Again, 4 = Good, 5 = Easy
async function reviewCard(key, quality) {
  const { library = [] } = await chrome.storage.local.get("library");
  const entry = library.find((e) => `${e.word}|${e.savedAt}` === key);
  if (!entry) return;

  if (quality < 3) {
    entry.repetition = 0;
    entry.interval = 1;
  } else {
    if (entry.repetition === 0) entry.interval = 1;
    else if (entry.repetition === 1) entry.interval = 6;
    else entry.interval = Math.round(entry.interval * entry.ease);
    entry.repetition += 1;
    entry.ease = Math.max(1.3, entry.ease + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)));
  }

  entry.due = Date.now() + entry.interval * 24 * 60 * 60 * 1000;
  entry.lastReviewed = Date.now();
  await chrome.storage.local.set({ library });
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
