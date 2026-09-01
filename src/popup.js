const listEl = document.getElementById("list");
const emptyEl = document.getElementById("empty");
const searchEl = document.getElementById("search");
const targetLangEl = document.getElementById("targetLang");
const geminiApiKeyEl = document.getElementById("geminiApiKey");
const geminiModelEl = document.getElementById("geminiModel");
const autoGenerateEl = document.getElementById("autoGenerateSentence");

const MAX_SENTENCES_PER_WORD = 8; // keep in sync with background.js
const MAX_USER_SENTENCES_PER_WORD = 8; // writing-practice attempts, keep in sync with background.js

let library = [];

async function load() {
  const data = await chrome.storage.local.get([
    "library",
    "targetLang",
    "geminiApiKey",
    "geminiModel",
    "autoGenerateSentence",
  ]);
  library = data.library || [];
  targetLangEl.value = data.targetLang || "zh-CN";
  geminiApiKeyEl.value = data.geminiApiKey || "";
  geminiModelEl.value = data.geminiModel || "";
  autoGenerateEl.checked = !!data.autoGenerateSentence;
  render();
  renderReviewBanner();
}

geminiApiKeyEl.addEventListener("change", () => {
  chrome.storage.local.set({ geminiApiKey: geminiApiKeyEl.value.trim() });
});

geminiModelEl.addEventListener("change", () => {
  chrome.storage.local.set({ geminiModel: geminiModelEl.value.trim() });
});

autoGenerateEl.addEventListener("change", () => {
  chrome.storage.local.set({ autoGenerateSentence: autoGenerateEl.checked });
});

function renderReviewBanner() {
  const dueCount = library.filter((e) => (e.due || 0) <= Date.now()).length;
  const banner = document.getElementById("reviewBanner");
  const dueText = document.getElementById("dueText");
  if (dueCount > 0) {
    dueText.textContent = `${dueCount} word${dueCount === 1 ? "" : "s"} due for review`;
    banner.style.display = "flex";
  } else {
    banner.style.display = "none";
  }
}

document.getElementById("startReview").addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("review.html") });
});

document.getElementById("openStory").addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("story.html") });
});

// --- data menu (export/import/clear dropdown) ---
const menuToggle = document.getElementById("menuToggle");
const dataMenu = document.getElementById("dataMenu");
const geminiPanel = document.getElementById("geminiPanel");
const openGeminiSettings = document.getElementById("openGeminiSettings");
const closeGeminiSettings = document.getElementById("closeGeminiSettings");

menuToggle.addEventListener("click", (e) => {
  e.stopPropagation();
  geminiPanel.classList.remove("open");
  dataMenu.classList.toggle("open");
});
document.addEventListener("click", (e) => {
  if (dataMenu.classList.contains("open") && !dataMenu.contains(e.target) && e.target !== menuToggle) {
    dataMenu.classList.remove("open");
  }
  if (geminiPanel.classList.contains("open") && !geminiPanel.contains(e.target) && e.target !== menuToggle) {
    geminiPanel.classList.remove("open");
  }
});
dataMenu.querySelectorAll(".menu-item").forEach((btn) => {
  btn.addEventListener("click", () => {
    // let the item's own click handler (download, file picker, confirm dialog) run first
    setTimeout(() => dataMenu.classList.remove("open"), 30);
  });
});

// --- Gemini API settings panel (opened from the ⋯ menu) ---
openGeminiSettings.addEventListener("click", (e) => {
  e.stopPropagation();
  dataMenu.classList.remove("open");
  geminiPanel.classList.add("open");
});
closeGeminiSettings.addEventListener("click", () => geminiPanel.classList.remove("open"));

function speak(text, lang) {
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  if (lang) utterance.lang = lang;
  window.speechSynthesis.speak(utterance);
}

// --- Play All: read every word (and optionally its translation) in the current
// list, one after another, chained via onend so playback never overlaps or
// races the speechSynthesis queue. Stops automatically if the popup closes.
const playAllBtn = document.getElementById("playAllBtn");
const playAllBar = document.getElementById("playAllBar");
const playAllIncludeTranslationEl = document.getElementById("playAllIncludeTranslation");
const playAllRateEl = document.getElementById("playAllRate");

let playingAll = false;
let playAllIndex = 0;
let playAllTimer = null;

function stopPlayAll() {
  playingAll = false;
  clearTimeout(playAllTimer);
  window.speechSynthesis.cancel();
  playAllBtn.textContent = "▶ Play all";
  playAllBtn.classList.remove("playing");
  document.querySelectorAll(".entry.playing-now").forEach((el) => el.classList.remove("playing-now"));
}

function playAllStep() {
  if (!playingAll) return;
  if (playAllIndex >= currentFilteredList.length) {
    stopPlayAll();
    return;
  }
  const entry = currentFilteredList[playAllIndex];
  document.querySelectorAll(".entry.playing-now").forEach((el) => el.classList.remove("playing-now"));
  const rowEl = listEl.children[playAllIndex];
  if (rowEl) {
    rowEl.classList.add("playing-now");
    rowEl.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  const rate = parseFloat(playAllRateEl.value) || 1;
  const wordUtterance = new SpeechSynthesisUtterance(entry.word);
  wordUtterance.rate = rate;
  if (entry.sourceLang) wordUtterance.lang = entry.sourceLang;

  wordUtterance.onend = () => {
    if (!playingAll) return;
    if (playAllIncludeTranslationEl.checked && entry.translation) {
      const transUtterance = new SpeechSynthesisUtterance(entry.translation);
      transUtterance.rate = rate;
      transUtterance.lang = targetLangEl.value || "zh-CN";
      transUtterance.onend = () => {
        playAllTimer = setTimeout(advancePlayAll, 400);
      };
      window.speechSynthesis.speak(transUtterance);
    } else {
      playAllTimer = setTimeout(advancePlayAll, 400);
    }
  };

  window.speechSynthesis.speak(wordUtterance);
}

function advancePlayAll() {
  if (!playingAll) return;
  playAllIndex += 1;
  playAllStep();
}

playAllBtn.addEventListener("click", () => {
  if (playingAll) {
    stopPlayAll();
    return;
  }
  if (currentFilteredList.length === 0) return;
  playingAll = true;
  playAllIndex = 0;
  playAllBtn.textContent = "⏸ Stop";
  playAllBtn.classList.add("playing");
  playAllStep();
});

let currentFilteredList = []; // kept in sync with the last render() so Play All always plays what's on screen

function render(filter = "") {
  const filtered = library
    .slice()
    .reverse()
    .filter(
      (e) =>
        e.word.toLowerCase().includes(filter.toLowerCase()) ||
        e.translation.toLowerCase().includes(filter.toLowerCase())
    );
  currentFilteredList = filtered;
  if (playingAll) stopPlayAll(); // the list under playback just changed — don't keep reading a stale order

  listEl.innerHTML = "";
  emptyEl.style.display = filtered.length === 0 ? "block" : "none";

  filtered.forEach((entry) => {
    const div = document.createElement("div");
    const level = entry.level || 3;
    const bucket = level === 1 ? "lvl-low" : level === 2 ? "lvl-mid" : "lvl-high";
    div.className = `entry ${bucket}`;
    const translationHtml = entry.translation
      ? escapeHtml(entry.translation)
      : `<span class="translation-missing">No translation yet — tap ✎ edit to add one</span>`;
    div.innerHTML = `
      <span class="del" data-word="${escapeHtml(entry.word)}" data-time="${entry.savedAt}">✕ remove</span>
      <span class="edit-toggle" data-word="${escapeHtml(entry.word)}" data-time="${entry.savedAt}" title="Edit meaning, context & notes">✎ edit</span>
      <span class="lvl-badge" title="Review level ${level}/3">L${level}</span>
      <span class="speak" title="Hear pronunciation" data-word="${escapeHtml(entry.word)}" data-lang="${entry.sourceLang || ""}">🔊</span>
      <div class="word">${escapeHtml(entry.word)}</div>
      <div class="translation">${translationHtml}</div>
    `;
    listEl.appendChild(div);
  });

  listEl.querySelectorAll(".del").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const word = btn.getAttribute("data-word");
      const time = Number(btn.getAttribute("data-time"));
      const removedEntry = library.find((e) => e.word === word && e.savedAt === time);
      library = library.filter((e) => !(e.word === word && e.savedAt === time));
      const updates = { library };

      // Only drop cached sentences if no other saved entry still shares this
      // word+translation identity (e.g. a duplicate re-save of the same word).
      if (removedEntry && !library.some((e) => entryKey(e) === entryKey(removedEntry))) {
        const { sentenceCache = {}, userSentenceCache = {} } = await chrome.storage.local.get([
          "sentenceCache",
          "userSentenceCache",
        ]);
        delete sentenceCache[entryKey(removedEntry)];
        delete userSentenceCache[entryKey(removedEntry)];
        updates.sentenceCache = sentenceCache;
        updates.userSentenceCache = userSentenceCache;
      }

      await chrome.storage.local.set(updates);
      render(searchEl.value);
      renderReviewBanner();
    });
  });

  listEl.querySelectorAll(".speak").forEach((btn) => {
    btn.addEventListener("click", () => {
      speak(btn.getAttribute("data-word"), btn.getAttribute("data-lang") || undefined);
    });
  });

  // --- edit (meaning, context, explanation, similar words, notes) ---
  // Opens in its own standalone window (see edit.html/edit.js) rather than an
  // inline form here, because this toolbar popup is a real Chrome extension
  // action popup: it auto-closes the instant it loses focus, which used to
  // wipe out any in-progress edit the moment the user switched tabs/windows
  // to go copy some text. A separate window has no such auto-close behavior,
  // so it stays open and visible until Save or Cancel is clicked.
  listEl.querySelectorAll(".edit-toggle").forEach((btn) => {
    btn.addEventListener("click", () => {
      const word = btn.getAttribute("data-word");
      const time = btn.getAttribute("data-time");
      openEditWindow(word, time);
    });
  });
}

function openEditWindow(word, time) {
  const url = chrome.runtime.getURL(
    `edit.html?word=${encodeURIComponent(word)}&time=${encodeURIComponent(time)}`
  );
  chrome.windows.create({ url, type: "popup", width: 380, height: 640 });
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

searchEl.addEventListener("input", () => render(searchEl.value));

targetLangEl.addEventListener("change", () => {
  chrome.storage.local.set({ targetLang: targetLangEl.value });
});

document.getElementById("clearAll").addEventListener("click", async () => {
  if (confirm("Delete all saved words? This cannot be undone.")) {
    library = [];
    await chrome.storage.local.set({ library, sentenceCache: {}, userSentenceCache: {} });
    render();
    renderReviewBanner();
  }
});

document.getElementById("exportCsv").addEventListener("click", () => {
  const rows = [["Word", "Translation", "Explanation", "Context", "Similar words", "Notes", "Date"]];
  library.forEach((e) =>
    rows.push([
      e.word,
      e.translation,
      e.explanation || "",
      e.context || "",
      e.similarWords || "",
      e.notes || "",
      new Date(e.savedAt).toISOString(),
    ])
  );
  const csv = rows.map((r) => r.map(csvEscape).join(",")).join("\n");
  downloadFile(csv, "vocabulary.csv", "text/csv");
});

document.getElementById("exportAnki").addEventListener("click", () => {
  // Anki basic import format: front<TAB>back
  const lines = library.map((e) => `${e.word}\t${e.translation}`);
  downloadFile(lines.join("\n"), "vocabulary_anki.txt", "text/plain");
});

function csvEscape(value) {
  const str = String(value).replace(/"/g, '""');
  return `"${str}"`;
}

function downloadFile(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  chrome.downloads.download({ url, filename, saveAs: true });
}

// --- JSON export/import for syncing between PCs ---

// Identity used to match "the same word" across two libraries.
// Word (case-insensitive) + translation, same rule saveWord() already uses for de-duping.
// Translation can be "" (word saved without one yet), so guard against undefined/null too.
function entryKey(e) {
  return `${e.word.toLowerCase()}|${e.translation || ""}`;
}

document.getElementById("exportJson").addEventListener("click", async () => {
  const { sentenceCache = {}, userSentenceCache = {} } = await chrome.storage.local.get([
    "sentenceCache",
    "userSentenceCache",
  ]);
  const payload = {
    exportedAt: new Date().toISOString(),
    source: "Vokari",
    version: 3,
    library,
    sentenceCache,
    userSentenceCache,
  };
  downloadFile(JSON.stringify(payload, null, 2), "vocabulary_sync.json", "application/json");
});

document.getElementById("importJsonBtn").addEventListener("click", () => {
  document.getElementById("importJsonFile").click();
});

document.getElementById("importJsonFile").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  e.target.value = ""; // allow re-selecting the same file later
  if (!file) return;

  let incoming;
  let incomingSentences = {};
  let incomingUserSentences = {};
  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    incoming = Array.isArray(parsed) ? parsed : parsed.library;
    if (!Array.isArray(incoming)) throw new Error("No word list found in file");
    if (!Array.isArray(parsed)) {
      if (parsed.sentenceCache && typeof parsed.sentenceCache === "object") {
        incomingSentences = parsed.sentenceCache;
      }
      if (parsed.userSentenceCache && typeof parsed.userSentenceCache === "object") {
        incomingUserSentences = parsed.userSentenceCache;
      }
    }
  } catch (err) {
    showImportStatus(`Import failed: ${err.message}`, true);
    return;
  }

  const existingByKey = new Map(library.map((e) => [entryKey(e), e]));
  let added = 0;
  let updated = 0;
  let unchanged = 0;

  for (const incomingEntry of incoming) {
    // Word is required; translation is not — a word saved before you got around
    // to filling in a translation (or one you deliberately left blank) must
    // still round-trip through Export/Import (Sync) instead of being silently
    // dropped here.
    if (!incomingEntry || !incomingEntry.word) continue;
    const key = entryKey(incomingEntry);
    const existing = existingByKey.get(key);

    if (!existing) {
      // New word — add as-is.
      existingByKey.set(key, incomingEntry);
      added++;
      continue;
    }

    // Same word on both sides — keep whichever has made more review progress,
    // so importing an older backup can never roll back progress made elsewhere.
    const winner = pickFurtherAlong(existing, incomingEntry);
    if (winner !== existing) {
      existingByKey.set(key, winner);
      updated++;
    } else {
      unchanged++;
    }
  }

  library = Array.from(existingByKey.values());
  const { sentenceCache: currentSentences = {}, userSentenceCache: currentUserSentences = {} } =
    await chrome.storage.local.get(["sentenceCache", "userSentenceCache"]);
  const mergedSentences = mergeSentenceCaches(currentSentences, incomingSentences, MAX_SENTENCES_PER_WORD);
  const mergedUserSentences = mergeSentenceCaches(
    currentUserSentences,
    incomingUserSentences,
    MAX_USER_SENTENCES_PER_WORD
  );

  await chrome.storage.local.set({
    library,
    sentenceCache: mergedSentences,
    userSentenceCache: mergedUserSentences,
  });
  render(searchEl.value);
  renderReviewBanner();

  const mergedExtras = [];
  if (Object.keys(incomingSentences).length) mergedExtras.push("example sentences");
  if (Object.keys(incomingUserSentences).length) mergedExtras.push("writing-practice attempts");
  const sentenceNote = mergedExtras.length
    ? ` ${mergedExtras.join(" and ")} from the file were merged in too (favorites kept on either side).`
    : "";
  showImportStatus(
    `Imported ${incoming.length} word${incoming.length === 1 ? "" : "s"}: ${added} new, ${updated} updated, ${unchanged} already up to date.${sentenceNote}`
  );
});

// Merges two word -> record-history maps (used for both AI-example sentences and
// writing-practice attempts). Records are matched by their id, so the same entry
// imported twice never duplicates; if the two sides disagree on favorite status
// for the same record, favorited wins.
function mergeSentenceCaches(a, b, max) {
  const merged = { ...a };
  for (const [key, incomingList] of Object.entries(b)) {
    if (!Array.isArray(incomingList)) continue;
    const existingList = merged[key] || [];
    const byId = new Map(existingList.map((s) => [s.id, s]));
    incomingList.forEach((s) => {
      if (!s || !s.id) return;
      const existing = byId.get(s.id);
      if (!existing) {
        byId.set(s.id, s);
      } else if (s.favorite && !existing.favorite) {
        byId.set(s.id, { ...existing, favorite: true });
      }
    });
    merged[key] = trimRecordList(Array.from(byId.values()), max);
  }
  return merged;
}

// Generic trimmer, mirrors background.js's trimRecordList. Works for both AI-example
// records (timestamped with generatedAt) and writing-practice records (createdAt).
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

// Given two entries for the same word, return whichever represents more review progress.
// Lower level = more familiar/further along (level 1 = monthly, level 3 = every 3 days/needs work).
function pickFurtherAlong(a, b) {
  const levelA = a.level || 3;
  const levelB = b.level || 3;
  if (levelA !== levelB) return levelA < levelB ? a : b;

  const countA = a.reviewCount || 0;
  const countB = b.reviewCount || 0;
  if (countA !== countB) return countA > countB ? a : b;

  const revA = a.lastReviewed || 0;
  const revB = b.lastReviewed || 0;
  if (revA !== revB) return revA > revB ? a : b;

  // Tie: keep the one with the earlier savedAt (preserve original save date),
  // but merge in any context/explanation/similar words/notes the other one has
  // if this one is missing it.
  const keeper = (a.savedAt || 0) <= (b.savedAt || 0) ? a : b;
  const other = keeper === a ? b : a;
  if (!keeper.context && other.context) keeper.context = other.context;
  if (!keeper.explanation && other.explanation) keeper.explanation = other.explanation;
  if (!keeper.similarWords && other.similarWords) keeper.similarWords = other.similarWords;
  if (!keeper.notes && other.notes) keeper.notes = other.notes;
  return keeper;
}

function showImportStatus(message, isError = false) {
  const el = document.getElementById("importStatus");
  el.textContent = message;
  el.style.color = isError ? "#ff6b5e" : "#5eead4";
  el.style.display = "block";
}

load();
