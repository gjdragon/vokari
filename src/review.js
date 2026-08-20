const cardEl = document.getElementById("card");
const wordEl = document.getElementById("word");
const translationEl = document.getElementById("translation");
const contextEl = document.getElementById("context");
const hintEl = document.getElementById("hint");
const controlsEl = document.getElementById("controls");
const progressEl = document.getElementById("progress");
const emptyEl = document.getElementById("empty");
const levelBadgeEl = document.getElementById("levelBadge");
const lastResultEl = document.getElementById("lastResult");
const scopeEl = document.getElementById("scope");
const amountEl = document.getElementById("amount");

const LEVEL_LABEL = { 1: "Monthly", 2: "Every 2 weeks", 3: "Weekly", 4: "Every 3 days", 5: "Daily" };

let queue = [];
let total = 0;
let current = null;
let revealed = false;

function keyFor(entry) {
  return `${entry.word}|${entry.savedAt}`;
}

scopeEl.addEventListener("change", () => {
  amountEl.style.display = scopeEl.value === "due" ? "none" : "inline-block";
});

document.getElementById("startBtn").addEventListener("click", loadQueue);

async function loadQueue() {
  lastResultEl.textContent = "";
  const scope = scopeEl.value;
  const amount = Math.max(1, parseInt(amountEl.value, 10) || 1);
  const response = await chrome.runtime.sendMessage({ type: "GET_REVIEW_QUEUE", scope, amount });
  queue = response.queue || [];
  total = queue.length;
  showNext();
}

function showNext() {
  if (queue.length === 0) {
    cardEl.style.display = "none";
    controlsEl.style.display = "none";
    progressEl.textContent = "";
    emptyEl.style.display = "block";
    return;
  }

  current = queue[0];
  revealed = false;

  wordEl.textContent = current.word;
  translationEl.textContent = current.translation;
  translationEl.style.display = "none";
  contextEl.textContent = current.context || "";
  hintEl.style.display = "block";
  controlsEl.style.display = "none";
  cardEl.style.display = "flex";
  emptyEl.style.display = "none";

  const level = current.level || 3;
  levelBadgeEl.textContent = `Level ${level}/5 · ${LEVEL_LABEL[level]}`;

  progressEl.textContent = `${total - queue.length + 1} of ${total}`;
}

cardEl.addEventListener("click", () => {
  if (revealed) return;
  revealed = true;
  translationEl.style.display = "block";
  hintEl.style.display = "none";
  controlsEl.style.display = "flex";
});

function grade(remembered) {
  chrome.runtime.sendMessage({ type: "REVIEW_CARD", key: keyFor(current), remembered }, (res) => {
    const word = current.word;
    const arrow = remembered ? "↓" : "↑";
    lastResultEl.textContent = `"${word}" ${arrow} level ${res.level}/5 — next review in ${res.interval} day${
      res.interval === 1 ? "" : "s"
    }`;
    queue.shift();
    showNext();
  });
}

document.getElementById("forgot").addEventListener("click", () => grade(false));
document.getElementById("remembered").addEventListener("click", () => grade(true));

loadQueue();
