const cardEl = document.getElementById("card");
const wordEl = document.getElementById("word");
const translationEl = document.getElementById("translation");
const contextEl = document.getElementById("context");
const hintEl = document.getElementById("hint");
const controlsEl = document.getElementById("controls");
const navRowEl = document.getElementById("navRow");
const gradeRowEl = document.getElementById("gradeRow");
const alreadyGradedEl = document.getElementById("alreadyGraded");
const prevBtn = document.getElementById("prevBtn");
const nextBtn = document.getElementById("nextBtn");
const progressEl = document.getElementById("progress");
const emptyEl = document.getElementById("empty");
const levelBadgeEl = document.getElementById("levelBadge");
const speakBtn = document.getElementById("speakBtn");
const lastResultEl = document.getElementById("lastResult");
const scopeEl = document.getElementById("scope");
const amountEl = document.getElementById("amount");
const sentenceBtn = document.getElementById("sentenceBtn");
const sentenceBox = document.getElementById("sentenceBox");
const sentenceTextEl = document.getElementById("sentenceText");
const favoriteBtn = document.getElementById("favoriteBtn");
const historyToggle = document.getElementById("historyToggle");
const historyListEl = document.getElementById("historyList");
const sentenceErrorEl = document.getElementById("sentenceError");
const practiceWordEl = document.getElementById("practiceWord");
const practiceInput = document.getElementById("practiceInput");
const practiceBtn = document.getElementById("practiceBtn");
const practiceErrorEl = document.getElementById("practiceError");
const practiceResultEl = document.getElementById("practiceResult");
const practiceOriginalTextEl = document.getElementById("practiceOriginalText");
const practiceCorrectedTextEl = document.getElementById("practiceCorrectedText");
const practiceNotesEl = document.getElementById("practiceNotes");
const practiceFavoriteBtn = document.getElementById("practiceFavoriteBtn");
const practiceHistoryToggle = document.getElementById("practiceHistoryToggle");
const practiceHistoryListEl = document.getElementById("practiceHistoryList");

const LEVEL_LABEL = { 1: "Monthly", 2: "Every 2 weeks", 3: "Weekly", 4: "Every 3 days", 5: "Daily" };

let queue = [];       // fixed list for this session — Prev/Next just move the pointer
let index = 0;
let revealed = false;
let graded = new Map(); // key -> { remembered, level, interval } for cards graded this session
let autoGenerateEnabled = false; // loaded from settings before the first card shows
let sentenceRequestToken = 0;   // guards against a stale async response overwriting a newer card
let lastSentenceList = [];      // sentences currently shown in the history panel
let practiceRequestToken = 0;   // same staleness guard, for the writing-practice panel
let lastUserSentenceList = [];  // writing-practice attempts currently shown in the history panel

function keyFor(entry) {
  return `${entry.word}|${entry.savedAt}`;
}

function speak(text, lang) {
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  if (lang) utterance.lang = lang;
  window.speechSynthesis.speak(utterance);
}

function noResultsMessage() {
  const checked = document.querySelectorAll(".lvl-cb:checked").length;
  if (checked === 0) return "No levels selected — tick at least one level (L1–L5) above and click Go.";
  if (checked < 5) return "No words match the levels and scope you selected. Try widening the filter.";
  return "No words are due for review right now. Come back tomorrow, or keep highlighting new words as you read.";
}

scopeEl.addEventListener("change", () => {
  amountEl.style.display = scopeEl.value === "due" ? "none" : "inline-block";
});

document.getElementById("startBtn").addEventListener("click", loadQueue);

async function loadSettings() {
  const { autoGenerateSentence } = await chrome.storage.local.get("autoGenerateSentence");
  autoGenerateEnabled = !!autoGenerateSentence;
}

async function loadQueue() {
  lastResultEl.textContent = "";
  graded = new Map();
  index = 0;
  const scope = scopeEl.value;
  const amount = Math.max(1, parseInt(amountEl.value, 10) || 1);
  const levels = Array.from(document.querySelectorAll(".lvl-cb:checked")).map((cb) => Number(cb.value));
  const response = await chrome.runtime.sendMessage({ type: "GET_REVIEW_QUEUE", scope, amount, levels });
  queue = response.queue || [];
  showCurrent();
}

function current() {
  return queue[index];
}

function showCurrent() {
  if (queue.length === 0) {
    cardEl.style.display = "none";
    controlsEl.style.display = "none";
    document.getElementById("sentenceCol").style.display = "none";
    document.getElementById("practiceCol").style.display = "none";
    progressEl.textContent = "";
    emptyEl.style.display = "block";
    document.querySelector("#empty p").textContent = noResultsMessage();
    return;
  }
  document.getElementById("sentenceCol").style.display = "flex";
  document.getElementById("practiceCol").style.display = "flex";

  const entry = current();
  const key = keyFor(entry);
  const result = graded.get(key);
  revealed = !!result; // an already-graded card reopens revealed, so you can glance at it

  wordEl.textContent = entry.word;
  translationEl.textContent = entry.translation;
  translationEl.classList.toggle("revealed", revealed);
  translationEl.style.display = revealed ? "block" : "none";
  contextEl.textContent = entry.context || "";
  hintEl.style.display = revealed ? "none" : "block";
  cardEl.style.display = "flex";
  controlsEl.style.display = "flex";
  emptyEl.style.display = "none";

  const level = result ? result.level : entry.level || 3;
  levelBadgeEl.textContent = `Level ${level}/5 · ${LEVEL_LABEL[level]}`;
  levelBadgeEl.className = level <= 2 ? "lvl-low" : level === 3 ? "lvl-mid" : "lvl-high";

  if (result) {
    navRowEl.style.display = "flex";
    document.getElementById("knewIt").style.display = "none";
    gradeRowEl.style.display = "none";
    alreadyGradedEl.style.display = "block";
    const arrow = result.remembered ? "↓" : "↑";
    alreadyGradedEl.textContent = `Graded this session: ${
      result.remembered ? "Remembered" : "Forgot"
    } ${arrow} level ${result.level}/5`;
  } else {
    navRowEl.style.display = "flex";
    document.getElementById("knewIt").style.display = "inline-block";
    gradeRowEl.style.display = revealed ? "flex" : "none";
    alreadyGradedEl.style.display = "none";
  }

  prevBtn.disabled = index === 0;
  nextBtn.disabled = index === queue.length - 1;

  progressEl.textContent = `${index + 1} of ${queue.length}`;

  showSentenceForCurrent();
  showPracticeForCurrent();
}

// Renders one sentence record into the card (used for both the latest generation
// and for clicking an older entry from the history list).
function displaySentenceRecord(record) {
  const entry = current();
  const words = [entry.word, ...(record.wordsUsed || [])].filter(Boolean);
  let html = escapeHtml(record.sentence);
  // Bold each used word (case-insensitive, whole-word match) for quick scanning.
  words.forEach((w) => {
    const re = new RegExp(`\\b(${escapeRegExp(w)})\\b`, "gi");
    html = html.replace(re, "<mark>$1</mark>");
  });
  sentenceTextEl.innerHTML = html;
  sentenceBox.dataset.sentenceId = record.id || "";
  favoriteBtn.textContent = record.favorite ? "★" : "☆";
  favoriteBtn.classList.toggle("favorited", !!record.favorite);
  sentenceBox.style.display = "block";
}

function renderHistory(list) {
  lastSentenceList = list;
  if (list.length <= 1) {
    historyToggle.style.display = "none";
    historyListEl.style.display = "none";
    historyListEl.innerHTML = "";
    return;
  }
  historyToggle.style.display = "inline";
  historyToggle.textContent = `Past sentences (${list.length})`;
  historyListEl.innerHTML = "";
  list
    .slice()
    .reverse()
    .forEach((rec) => {
      const div = document.createElement("div");
      div.className = "history-item";
      div.innerHTML = `${rec.favorite ? '<span class="star">★</span> ' : ""}${escapeHtml(rec.sentence)}`;
      div.addEventListener("click", () => displaySentenceRecord(rec));
      historyListEl.appendChild(div);
    });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Loads whatever sentences are already saved for the current word. If none exist
// yet and auto-generate is on, kicks off a generation automatically.
function showSentenceForCurrent() {
  sentenceRequestToken += 1;
  const token = sentenceRequestToken;

  sentenceErrorEl.style.display = "none";
  sentenceErrorEl.textContent = "";
  sentenceBox.style.display = "none";
  historyToggle.style.display = "none";
  historyListEl.style.display = "none";
  historyListEl.innerHTML = "";
  sentenceBtn.disabled = false;
  sentenceBtn.classList.remove("loading");
  sentenceBtn.textContent = "✨ Make a sentence";

  if (queue.length === 0) return;
  const entry = current();
  const key = keyFor(entry);

  chrome.runtime.sendMessage({ type: "GET_SENTENCES", key }, (res) => {
    if (token !== sentenceRequestToken) return; // moved to a different card meanwhile
    const list = (res && res.ok && res.sentences) || [];
    if (list.length > 0) {
      sentenceBtn.textContent = "✨ Make another sentence";
      displaySentenceRecord(list[list.length - 1]);
      renderHistory(list);
    } else if (autoGenerateEnabled) {
      requestSentence(key, token);
    }
  });
}

function requestSentence(key, token) {
  sentenceBtn.disabled = true;
  sentenceBtn.classList.add("loading");
  sentenceBtn.textContent = "Generating…";
  sentenceErrorEl.style.display = "none";

  chrome.runtime.sendMessage({ type: "GENERATE_SENTENCE", key }, (res) => {
    if (token !== sentenceRequestToken) return; // moved to a different card meanwhile
    sentenceBtn.disabled = false;
    sentenceBtn.classList.remove("loading");
    if (!res || !res.ok) {
      sentenceBtn.textContent = "✨ Make a sentence";
      sentenceErrorEl.textContent = (res && res.error) || "Something went wrong generating the sentence.";
      sentenceErrorEl.style.display = "block";
      return;
    }
    sentenceBtn.textContent = "✨ Make another sentence";
    displaySentenceRecord(res.record);
    renderHistory(res.sentences);
  });
}

sentenceBtn.addEventListener("click", () => {
  if (queue.length === 0) return;
  const key = keyFor(current());
  requestSentence(key, sentenceRequestToken);
});

favoriteBtn.addEventListener("click", () => {
  const id = sentenceBox.dataset.sentenceId;
  if (!id || queue.length === 0) return;
  const key = keyFor(current());
  chrome.runtime.sendMessage({ type: "TOGGLE_SENTENCE_FAVORITE", key, id }, (res) => {
    if (!res || !res.ok) return;
    const rec = res.sentences.find((s) => s.id === id);
    if (rec) displaySentenceRecord(rec);
    renderHistory(res.sentences);
  });
});

historyToggle.addEventListener("click", () => {
  const willShow = historyListEl.style.display !== "block";
  historyListEl.style.display = willShow ? "flex" : "none";
  historyToggle.textContent = willShow
    ? `Hide past sentences (${lastSentenceList.length})`
    : `Past sentences (${lastSentenceList.length})`;
});

// --- Writing practice: user writes a sentence, Gemini polishes it, both are kept. ---

// Simple word-level diff (LCS-based) so differences between the learner's original
// and the AI-polished version can be highlighted for grammar/word-choice learning.
function diffWords(a, b) {
  const aw = a.split(/(\s+)/).filter((t) => t.length > 0);
  const bw = b.split(/(\s+)/).filter((t) => t.length > 0);
  const m = aw.length;
  const n = bw.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i][j] = aw[i] === bw[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  let i = 0;
  let j = 0;
  const aParts = [];
  const bParts = [];
  while (i < m && j < n) {
    if (aw[i] === bw[j]) {
      aParts.push({ text: aw[i], type: "same" });
      bParts.push({ text: bw[j], type: "same" });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      aParts.push({ text: aw[i], type: "removed" });
      i++;
    } else {
      bParts.push({ text: bw[j], type: "added" });
      j++;
    }
  }
  while (i < m) {
    aParts.push({ text: aw[i], type: "removed" });
    i++;
  }
  while (j < n) {
    bParts.push({ text: bw[j], type: "added" });
    j++;
  }
  return { aParts, bParts };
}

function renderDiffHtml(parts) {
  return parts
    .map((p) => {
      const text = escapeHtml(p.text);
      if (p.type === "removed") return `<span class="diff-removed">${text}</span>`;
      if (p.type === "added") return `<span class="diff-added">${text}</span>`;
      return text;
    })
    .join(" ");
}

function displayUserSentenceRecord(record) {
  const { aParts, bParts } = diffWords(record.original, record.corrected);
  practiceOriginalTextEl.innerHTML = renderDiffHtml(aParts);
  practiceCorrectedTextEl.innerHTML = renderDiffHtml(bParts);
  practiceNotesEl.innerHTML = "";
  const notes = record.notes || [];
  notes.forEach((n) => {
    const li = document.createElement("li");
    li.textContent = n;
    practiceNotesEl.appendChild(li);
  });
  practiceNotesEl.style.display = notes.length ? "block" : "none";
  practiceResultEl.dataset.sentenceId = record.id || "";
  practiceFavoriteBtn.textContent = record.favorite ? "★" : "☆";
  practiceFavoriteBtn.classList.toggle("favorited", !!record.favorite);
  practiceResultEl.style.display = "flex";
}

function renderUserHistory(list) {
  lastUserSentenceList = list;
  if (list.length === 0) {
    practiceHistoryToggle.style.display = "none";
    practiceHistoryListEl.style.display = "none";
    practiceHistoryListEl.innerHTML = "";
    return;
  }
  practiceHistoryToggle.style.display = "inline";
  practiceHistoryToggle.textContent = `Past attempts (${list.length})`;
  practiceHistoryListEl.innerHTML = "";
  list
    .slice()
    .reverse()
    .forEach((rec) => {
      const div = document.createElement("div");
      div.className = "history-item";
      const label = document.createElement("span");
      label.innerHTML = `${rec.favorite ? '<span class="star">★</span> ' : ""}${escapeHtml(rec.original)}`;
      const del = document.createElement("span");
      del.className = "history-del";
      del.textContent = "✕";
      del.title = "Delete this attempt";
      del.addEventListener("click", (e) => {
        e.stopPropagation();
        deleteUserAttempt(rec.id);
      });
      div.appendChild(label);
      div.appendChild(del);
      div.addEventListener("click", () => displayUserSentenceRecord(rec));
      practiceHistoryListEl.appendChild(div);
    });
}

// Loads whatever writing-practice attempts are already saved for the current word.
// Unlike the AI-example panel, this never auto-generates — polishing only happens
// when the learner clicks the button after writing something.
function showPracticeForCurrent() {
  practiceRequestToken += 1;
  const token = practiceRequestToken;

  practiceInput.value = "";
  practiceErrorEl.style.display = "none";
  practiceErrorEl.textContent = "";
  practiceResultEl.style.display = "none";
  practiceHistoryToggle.style.display = "none";
  practiceHistoryListEl.style.display = "none";
  practiceHistoryListEl.innerHTML = "";
  practiceBtn.disabled = false;
  practiceBtn.classList.remove("loading");
  practiceBtn.textContent = "✨ Polish with AI";

  if (queue.length === 0) return;
  const entry = current();
  practiceWordEl.textContent = entry.word;
  const key = keyFor(entry);

  chrome.runtime.sendMessage({ type: "GET_USER_SENTENCES", key }, (res) => {
    if (token !== practiceRequestToken) return; // moved to a different card meanwhile
    const list = (res && res.ok && res.sentences) || [];
    if (list.length > 0) {
      displayUserSentenceRecord(list[list.length - 1]);
      renderUserHistory(list);
    }
  });
}

practiceBtn.addEventListener("click", () => {
  if (queue.length === 0) return;
  const text = practiceInput.value.trim();
  if (!text) {
    practiceErrorEl.textContent = "Write a sentence first.";
    practiceErrorEl.style.display = "block";
    return;
  }
  const key = keyFor(current());
  const token = practiceRequestToken;

  practiceBtn.disabled = true;
  practiceBtn.classList.add("loading");
  practiceBtn.textContent = "Polishing…";
  practiceErrorEl.style.display = "none";

  chrome.runtime.sendMessage({ type: "POLISH_SENTENCE", key, text }, (res) => {
    if (token !== practiceRequestToken) return; // moved to a different card meanwhile
    practiceBtn.disabled = false;
    practiceBtn.classList.remove("loading");
    practiceBtn.textContent = "✨ Polish with AI";
    if (!res || !res.ok) {
      practiceErrorEl.textContent = (res && res.error) || "Something went wrong polishing the sentence.";
      practiceErrorEl.style.display = "block";
      return;
    }
    practiceInput.value = "";
    displayUserSentenceRecord(res.record);
    renderUserHistory(res.sentences);
  });
});

practiceFavoriteBtn.addEventListener("click", () => {
  const id = practiceResultEl.dataset.sentenceId;
  if (!id || queue.length === 0) return;
  const key = keyFor(current());
  chrome.runtime.sendMessage({ type: "TOGGLE_USER_SENTENCE_FAVORITE", key, id }, (res) => {
    if (!res || !res.ok) return;
    const rec = res.sentences.find((s) => s.id === id);
    if (rec) displayUserSentenceRecord(rec);
    renderUserHistory(res.sentences);
  });
});

function deleteUserAttempt(id) {
  if (queue.length === 0) return;
  const key = keyFor(current());
  chrome.runtime.sendMessage({ type: "DELETE_USER_SENTENCE", key, id }, (res) => {
    if (!res || !res.ok) return;
    renderUserHistory(res.sentences);
    if (practiceResultEl.dataset.sentenceId === id) {
      if (res.sentences.length > 0) {
        displayUserSentenceRecord(res.sentences[res.sentences.length - 1]);
      } else {
        practiceResultEl.style.display = "none";
      }
    }
  });
}

practiceHistoryToggle.addEventListener("click", () => {
  const willShow = practiceHistoryListEl.style.display !== "block";
  practiceHistoryListEl.style.display = willShow ? "flex" : "none";
  practiceHistoryToggle.textContent = willShow
    ? `Hide past attempts (${lastUserSentenceList.length})`
    : `Past attempts (${lastUserSentenceList.length})`;
});

cardEl.addEventListener("click", () => {
  if (revealed) return;
  revealed = true;
  translationEl.classList.add("revealed");
  translationEl.style.display = "block";
  hintEl.style.display = "none";
  gradeRowEl.style.display = "flex";
});

speakBtn.addEventListener("click", (e) => {
  e.stopPropagation(); // don't let this also trigger the card's reveal-on-click
  const entry = current();
  speak(entry.word, entry.sourceLang || undefined);
});

function grade(remembered) {
  const entry = current();
  const key = keyFor(entry);
  chrome.runtime.sendMessage({ type: "REVIEW_CARD", key, remembered }, (res) => {
    graded.set(key, { remembered, level: res.level, interval: res.interval });
    const arrow = remembered ? "↓" : "↑";
    lastResultEl.textContent = `"${entry.word}" ${arrow} level ${res.level}/5 — next review in ${res.interval} day${
      res.interval === 1 ? "" : "s"
    }`;
    goNext();
  });
}

function goNext() {
  if (index < queue.length - 1) {
    index += 1;
    showCurrent();
  } else {
    // Reached the end of the session.
    progressEl.textContent = `${queue.length} of ${queue.length} — session complete`;
  }
}

function goPrev() {
  if (index > 0) {
    index -= 1;
    showCurrent();
  }
}

prevBtn.addEventListener("click", goPrev);
nextBtn.addEventListener("click", goNext);
document.getElementById("knewIt").addEventListener("click", () => grade(true));
document.getElementById("forgot").addEventListener("click", () => grade(false));
document.getElementById("remembered").addEventListener("click", () => grade(true));

document.addEventListener("keydown", (e) => {
  if (e.key === "ArrowLeft") goPrev();
  else if (e.key === "ArrowRight") goNext();
});

loadSettings().then(loadQueue);
