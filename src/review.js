const cardEl = document.getElementById("card");
const wordEl = document.getElementById("word");
const translationEl = document.getElementById("translation");
const contextEl = document.getElementById("context");
const explanationEl = document.getElementById("explanation");
const similarWordsEl = document.getElementById("similarWords");
const wordNotesEl = document.getElementById("notes");
const fieldCbEls = document.querySelectorAll(".field-cb");
const typeAnswerToggleEl = document.getElementById("typeAnswerToggle");
const typeAnswerBoxEl = document.getElementById("typeAnswerBox");
const typeAnswerInputEl = document.getElementById("typeAnswerInput");
const typeAnswerSubmitEl = document.getElementById("typeAnswerSubmit");
const typeAnswerGiveUpEl = document.getElementById("typeAnswerGiveUp");
const typeAnswerFeedbackEl = document.getElementById("typeAnswerFeedback");
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
const editBtn = document.getElementById("editBtn");
const editOverlay = document.getElementById("editOverlay");
const editTranslationInput = document.getElementById("editTranslationInput");
const editContextInput = document.getElementById("editContextInput");
const editExplanationInput = document.getElementById("editExplanationInput");
const editSimilarWordsInput = document.getElementById("editSimilarWordsInput");
const editNotesInput = document.getElementById("editNotesInput");
const editOverlayError = document.getElementById("editOverlayError");
const editSaveBtn = document.getElementById("editSaveBtn");
const editCancelBtn = document.getElementById("editCancelBtn");
const sentenceCol = document.getElementById("sentenceCol");
const practiceCol = document.getElementById("practiceCol");
const sentenceColToggle = document.getElementById("sentenceColToggle");
const practiceColToggle = document.getElementById("practiceColToggle");
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

const LEVEL_LABEL = { 1: "Monthly", 2: "Weekly", 3: "Every 3 days" };
const MAX_LEVEL = 3;
// Sensible starting point per scope when the user switches "Last N ___" — only
// applied on switching scope, not while they're actively typing a custom amount.
const SCOPE_DEFAULT_AMOUNT = { days: 3, weeks: 2, months: 1 };

let queue = [];       // fixed list for this session — Prev/Next just move the pointer
let index = 0;
let revealed = false;
let typeAnswerMode = false; // loaded from settings; "show translation, type the word" instead of tap-to-reveal
let graded = new Map(); // key -> { remembered, level, interval } for cards graded this session
let autoGenerateEnabled = false; // loaded from settings before the first card shows
let visibleFields = { context: true, explanation: true, similarWords: true, notes: true }; // which recall-aid fields show on a revealed card
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

// Renders the context/explanation/similar-words/notes recall aids for the current
// card, honoring the user's "Show on card" field toggles.
//
// Context and explanation are English-side hints — like the existing context
// sentence, they're safe to show before the translation is revealed (in normal
// mode) since they don't give away the translation itself. Similar words and
// notes often echo the translation/target word directly, so they stay gated
// behind reveal, same as notes always has been.
//
// In "type the word" mode, ALL of these are hidden until revealed — the point
// there is recalling the English word from the translation alone, and context
// in particular is known to contain the word itself.
function setSupportFields(entry, { revealed: isRevealed, typing }) {
  const showFrontHints = typing ? isRevealed : true; // context/explanation: always-on in normal mode, reveal-gated in typing mode

  contextEl.textContent = showFrontHints && visibleFields.context ? entry.context || "" : "";

  explanationEl.textContent = entry.explanation || "";
  explanationEl.classList.toggle(
    "revealed",
    showFrontHints && visibleFields.explanation && !!entry.explanation
  );

  similarWordsEl.textContent = entry.similarWords || "";
  similarWordsEl.classList.toggle("revealed", isRevealed && visibleFields.similarWords && !!entry.similarWords);

  wordNotesEl.textContent = entry.notes || "";
  wordNotesEl.classList.toggle("revealed", isRevealed && visibleFields.notes && !!entry.notes);
}

function noResultsMessage() {
  const checked = document.querySelectorAll(".lvl-cb:checked").length;
  if (checked === 0) return "No levels selected — tick at least one level (L1–L3) above and click Go.";
  if (checked < MAX_LEVEL) return "No words match the levels and scope you selected. Try widening the filter.";
  return "No words are due for review right now. Come back tomorrow, or keep highlighting new words as you read.";
}

scopeEl.addEventListener("change", () => {
  const scope = scopeEl.value;
  amountEl.style.display = scope === "due" ? "none" : "inline-block";
  if (SCOPE_DEFAULT_AMOUNT[scope] !== undefined) {
    amountEl.value = SCOPE_DEFAULT_AMOUNT[scope];
  }
});

document.getElementById("startBtn").addEventListener("click", loadQueue);

async function loadSettings() {
  const {
    autoGenerateSentence,
    typeAnswerMode: storedTypeAnswerMode,
    hideSentencePanel,
    hidePracticePanel,
    visibleFields: storedVisibleFields,
  } = await chrome.storage.local.get([
    "autoGenerateSentence",
    "typeAnswerMode",
    "hideSentencePanel",
    "hidePracticePanel",
    "visibleFields",
  ]);
  autoGenerateEnabled = !!autoGenerateSentence;
  typeAnswerMode = !!storedTypeAnswerMode;
  typeAnswerToggleEl.checked = typeAnswerMode;
  setPanelCollapsed(sentenceCol, sentenceColToggle, "AI Example", !!hideSentencePanel);
  setPanelCollapsed(practiceCol, practiceColToggle, "Your Practice", !!hidePracticePanel);

  visibleFields = { ...visibleFields, ...(storedVisibleFields || {}) };
  fieldCbEls.forEach((cb) => {
    cb.checked = visibleFields[cb.value] !== false;
  });
}

fieldCbEls.forEach((cb) => {
  cb.addEventListener("change", () => {
    visibleFields[cb.value] = cb.checked;
    chrome.storage.local.set({ visibleFields });
    if (queue.length > 0) showCurrent();
  });
});

// --- Show/hide the side panels (AI Example / Your Practice) ---
function setPanelCollapsed(colEl, toggleBtn, label, collapsed) {
  colEl.classList.toggle("collapsed", collapsed);
  toggleBtn.textContent = collapsed ? "»" : "✕";
  toggleBtn.title = collapsed ? `Show ${label} panel` : `Hide ${label} panel`;
}

sentenceColToggle.addEventListener("click", () => {
  const collapsed = !sentenceCol.classList.contains("collapsed");
  setPanelCollapsed(sentenceCol, sentenceColToggle, "AI Example", collapsed);
  chrome.storage.local.set({ hideSentencePanel: collapsed });
});

practiceColToggle.addEventListener("click", () => {
  const collapsed = !practiceCol.classList.contains("collapsed");
  setPanelCollapsed(practiceCol, practiceColToggle, "Your Practice", collapsed);
  chrome.storage.local.set({ hidePracticePanel: collapsed });
});

typeAnswerToggleEl.addEventListener("change", () => {
  typeAnswerMode = typeAnswerToggleEl.checked;
  chrome.storage.local.set({ typeAnswerMode });
  if (queue.length > 0) showCurrent();
});

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
  editOverlay.classList.remove("open");
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

  // "Type the word" mode: the translation is shown as the prompt and the English
  // word stays hidden until the person types it (or gives up) — only applies to
  // cards not yet graded this session; a graded card always reopens fully revealed.
  const typing = typeAnswerMode && !result;

  wordEl.textContent = entry.word;
  wordEl.classList.remove("correct", "incorrect");
  translationEl.textContent = entry.translation || "(no translation saved — click ✎ to add one)";
  typeAnswerInputEl.value = "";
  typeAnswerFeedbackEl.textContent = "";
  typeAnswerFeedbackEl.className = "";

  if (typing) {
    wordEl.style.visibility = "hidden";
    translationEl.classList.remove("revealed");
    translationEl.style.display = "block"; // the translation IS the prompt in this mode
    setSupportFields(entry, { revealed, typing: true });
    typeAnswerBoxEl.style.display = "flex";
    hintEl.style.display = "none";
  } else {
    wordEl.style.visibility = "visible";
    translationEl.classList.toggle("revealed", revealed);
    translationEl.style.display = revealed ? "block" : "none";
    setSupportFields(entry, { revealed, typing: false });
    typeAnswerBoxEl.style.display = "none";
    hintEl.style.display = revealed ? "none" : "block";
  }

  cardEl.style.display = "flex";
  controlsEl.style.display = "flex";
  emptyEl.style.display = "none";

  const level = result ? result.level : entry.level || 3;
  levelBadgeEl.textContent = `Level ${level}/${MAX_LEVEL} · ${LEVEL_LABEL[level]}`;
  levelBadgeEl.className = level === 1 ? "lvl-low" : level === 2 ? "lvl-mid" : "lvl-high";

  if (result) {
    navRowEl.style.display = "flex";
    document.getElementById("knewIt").style.display = "none";
    gradeRowEl.style.display = "none";
    alreadyGradedEl.style.display = "block";
    const arrow = result.remembered ? "↓" : "→";
    alreadyGradedEl.textContent = `Graded this session: ${
      result.remembered ? "Remembered" : "Forgot"
    } ${arrow} level ${result.level}/${MAX_LEVEL}`;
  } else {
    navRowEl.style.display = "flex";
    document.getElementById("knewIt").style.display = revealed ? "none" : "inline-block";
    gradeRowEl.style.display = revealed ? "flex" : "none";
    alreadyGradedEl.style.display = "none";
  }

  prevBtn.disabled = index === 0;
  nextBtn.disabled = index === queue.length - 1;

  progressEl.textContent = `${index + 1} of ${queue.length}`;

  if (typing) typeAnswerInputEl.focus();

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
  const entry = current();
  if (typeAnswerMode) {
    // In type-the-word mode, clicking the card is the "give up" path — same
    // outcome as the explicit "Show answer instead" link.
    revealAfterTyping(entry, false, typeAnswerInputEl.value.trim(), true);
    return;
  }
  revealed = true;
  translationEl.classList.add("revealed");
  translationEl.style.display = "block";
  hintEl.style.display = "none";
  document.getElementById("knewIt").style.display = "none";
  gradeRowEl.style.display = "flex";
  setSupportFields(entry, { revealed: true, typing: false });
});

speakBtn.addEventListener("click", (e) => {
  e.stopPropagation(); // don't let this also trigger the card's reveal-on-click
  const entry = current();
  speak(entry.word, entry.sourceLang || undefined);
});

// --- Edit meaning / notes directly from the review card ---
editBtn.addEventListener("click", (e) => {
  e.stopPropagation(); // don't trigger the card's reveal-on-click
  if (queue.length === 0) return;
  const entry = current();
  editTranslationInput.value = entry.translation;
  editContextInput.value = entry.context || "";
  editExplanationInput.value = entry.explanation || "";
  editSimilarWordsInput.value = entry.similarWords || "";
  editNotesInput.value = entry.notes || "";
  editOverlayError.style.display = "none";
  editOverlay.classList.add("open");
  editTranslationInput.focus();
});

editOverlay.addEventListener("click", (e) => e.stopPropagation()); // don't let clicks inside reveal the card

editCancelBtn.addEventListener("click", () => {
  editOverlay.classList.remove("open");
});

editSaveBtn.addEventListener("click", () => {
  if (queue.length === 0) return;
  const entry = current();
  const newTranslation = editTranslationInput.value.trim();
  const newContext = editContextInput.value.trim();
  const newExplanation = editExplanationInput.value.trim();
  const newSimilarWords = editSimilarWordsInput.value.trim();
  const newNotes = editNotesInput.value.trim();

  if (!newTranslation) {
    editOverlayError.textContent = "Meaning can't be empty.";
    editOverlayError.style.display = "block";
    editTranslationInput.focus();
    return;
  }

  const key = keyFor(entry);
  editSaveBtn.disabled = true;
  chrome.runtime.sendMessage(
    {
      type: "EDIT_WORD_ENTRY",
      key,
      translation: newTranslation,
      explanation: newExplanation,
      similarWords: newSimilarWords,
      notes: newNotes,
      context: newContext,
    },
    (res) => {
      editSaveBtn.disabled = false;
      if (!res || !res.ok) {
        editOverlayError.textContent = (res && res.error) || "Something went wrong saving your edit.";
        editOverlayError.style.display = "block";
        return;
      }
      // Update the in-memory queue entry so the rest of the session (and this
      // card's re-render) reflects the edit without needing to reload the queue.
      entry.translation = newTranslation;
      entry.context = newContext;
      entry.explanation = newExplanation;
      entry.similarWords = newSimilarWords;
      entry.notes = newNotes;
      editOverlay.classList.remove("open");
      showCurrent();
    }
  );
});

// --- "Type the word" mode: check the typed answer against the real word ---

function normalizeWord(str) {
  return str.trim().toLowerCase();
}

function revealAfterTyping(entry, isCorrect, typed, gaveUp) {
  revealed = true;
  wordEl.style.visibility = "visible";
  wordEl.classList.toggle("correct", isCorrect);
  wordEl.classList.toggle("incorrect", !isCorrect);
  translationEl.classList.add("revealed");
  setSupportFields(entry, { revealed: true, typing: true });
  typeAnswerBoxEl.style.display = "none";
  hintEl.style.display = "none";

  typeAnswerFeedbackEl.className = isCorrect ? "correct" : "incorrect";
  if (isCorrect) {
    typeAnswerFeedbackEl.textContent = "✅ Correct!";
  } else if (gaveUp && !typed) {
    typeAnswerFeedbackEl.textContent = `The word is "${entry.word}"`;
  } else {
    typeAnswerFeedbackEl.textContent = `❌ You typed "${typed}" — the word is "${entry.word}"`;
  }

  document.getElementById("knewIt").style.display = "none";
  gradeRowEl.style.display = "flex";
}

function checkTypedAnswer() {
  if (revealed) return;
  const entry = current();
  const typed = typeAnswerInputEl.value.trim();
  if (!typed) {
    typeAnswerInputEl.focus();
    return;
  }
  const isCorrect = normalizeWord(typed) === normalizeWord(entry.word);
  revealAfterTyping(entry, isCorrect, typed, false);
}

typeAnswerSubmitEl.addEventListener("click", (e) => {
  e.stopPropagation();
  checkTypedAnswer();
});
typeAnswerGiveUpEl.addEventListener("click", (e) => {
  e.stopPropagation();
  if (revealed) return;
  revealAfterTyping(current(), false, typeAnswerInputEl.value.trim(), true);
});
typeAnswerInputEl.addEventListener("click", (e) => e.stopPropagation());
typeAnswerInputEl.addEventListener("keydown", (e) => {
  e.stopPropagation(); // don't let Enter/arrows bubble to the document-level shortcuts
  if (e.key === "Enter") checkTypedAnswer();
});

function grade(remembered) {
  const entry = current();
  const key = keyFor(entry);
  chrome.runtime.sendMessage({ type: "REVIEW_CARD", key, remembered }, (res) => {
    graded.set(key, { remembered, level: res.level, interval: res.interval });
    const arrow = remembered ? "↓" : "→";
    lastResultEl.textContent = `"${entry.word}" ${arrow} level ${res.level}/${MAX_LEVEL} — next review in ${res.interval} day${
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
  if (e.key === "Escape" && editOverlay.classList.contains("open")) {
    editOverlay.classList.remove("open");
    return;
  }
  const tag = (e.target.tagName || "").toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return;
  if (editOverlay.classList.contains("open")) return; // don't navigate cards while editing
  if (e.key === "ArrowLeft") goPrev();
  else if (e.key === "ArrowRight") goNext();
});

loadSettings().then(loadQueue);
