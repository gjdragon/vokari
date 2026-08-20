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
const sentenceErrorEl = document.getElementById("sentenceError");

const LEVEL_LABEL = { 1: "Monthly", 2: "Every 2 weeks", 3: "Weekly", 4: "Every 3 days", 5: "Daily" };

let queue = [];       // fixed list for this session — Prev/Next just move the pointer
let index = 0;
let revealed = false;
let graded = new Map(); // key -> { remembered, level, interval } for cards graded this session
let sentences = new Map(); // key -> { sentence, wordsUsed } generated this session (on-demand, not persisted)

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

async function loadQueue() {
  lastResultEl.textContent = "";
  graded = new Map();
  sentences = new Map();
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
    document.getElementById("sentencePanel").style.display = "none";
    progressEl.textContent = "";
    emptyEl.style.display = "block";
    document.querySelector("#empty p").textContent = noResultsMessage();
    return;
  }
  document.getElementById("sentencePanel").style.display = "flex";

  const entry = current();
  const key = keyFor(entry);
  const result = graded.get(key);
  revealed = !!result; // an already-graded card reopens revealed, so you can glance at it

  wordEl.textContent = entry.word;
  translationEl.textContent = entry.translation;
  translationEl.style.display = revealed ? "block" : "none";
  contextEl.textContent = entry.context || "";
  hintEl.style.display = revealed ? "none" : "block";
  cardEl.style.display = "flex";
  controlsEl.style.display = "flex";
  emptyEl.style.display = "none";

  const level = result ? result.level : entry.level || 3;
  levelBadgeEl.textContent = `Level ${level}/5 · ${LEVEL_LABEL[level]}`;

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
}

function renderSentence(entry, result) {
  const words = [entry.word, ...(result.wordsUsed || [])].filter(Boolean);
  let html = escapeHtml(result.sentence);
  // Bold each used word (case-insensitive, whole-word match) for quick scanning.
  words.forEach((w) => {
    const re = new RegExp(`\\b(${escapeRegExp(w)})\\b`, "gi");
    html = html.replace(re, "<mark>$1</mark>");
  });
  sentenceBox.innerHTML = html;
  sentenceBox.style.display = "block";
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function showSentenceForCurrent() {
  sentenceErrorEl.style.display = "none";
  sentenceErrorEl.textContent = "";
  sentenceBox.style.display = "none";
  sentenceBox.innerHTML = "";
  sentenceBtn.disabled = false;

  if (queue.length === 0) return;
  const entry = current();
  const key = keyFor(entry);
  const cached = sentences.get(key);
  if (cached) {
    sentenceBtn.textContent = "✨ Make another sentence";
    renderSentence(entry, cached);
  } else {
    sentenceBtn.textContent = "✨ Make a sentence";
  }
}

sentenceBtn.addEventListener("click", () => {
  if (queue.length === 0) return;
  const entry = current();
  const key = keyFor(entry);

  sentenceBtn.disabled = true;
  sentenceBtn.textContent = "Generating…";
  sentenceErrorEl.style.display = "none";
  sentenceBox.style.display = "none";

  chrome.runtime.sendMessage({ type: "GENERATE_SENTENCE", key }, (res) => {
    sentenceBtn.disabled = false;
    if (!res || !res.ok) {
      sentenceBtn.textContent = sentences.has(key) ? "✨ Make another sentence" : "✨ Make a sentence";
      sentenceErrorEl.textContent = (res && res.error) || "Something went wrong generating the sentence.";
      sentenceErrorEl.style.display = "block";
      return;
    }
    sentences.set(key, { sentence: res.sentence, wordsUsed: res.wordsUsed });
    sentenceBtn.textContent = "✨ Make another sentence";
    renderSentence(entry, { sentence: res.sentence, wordsUsed: res.wordsUsed });
  });
});

cardEl.addEventListener("click", () => {
  if (revealed) return;
  revealed = true;
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

loadQueue();
