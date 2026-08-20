const cardEl = document.getElementById("card");
const wordEl = document.getElementById("word");
const translationEl = document.getElementById("translation");
const contextEl = document.getElementById("context");
const hintEl = document.getElementById("hint");
const controlsEl = document.getElementById("controls");
const progressEl = document.getElementById("progress");
const emptyEl = document.getElementById("empty");

let queue = [];
let total = 0;
let current = null;
let revealed = false;

function keyFor(entry) {
  return `${entry.word}|${entry.savedAt}`;
}

async function loadQueue() {
  const { library = [] } = await chrome.storage.local.get("library");
  const now = Date.now();
  queue = library.filter((e) => (e.due || 0) <= now);
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

  progressEl.textContent = `${total - queue.length + 1} of ${total} due`;
}

cardEl.addEventListener("click", () => {
  if (revealed) return;
  revealed = true;
  translationEl.style.display = "block";
  hintEl.style.display = "none";
  controlsEl.style.display = "flex";
});

function grade(quality) {
  chrome.runtime.sendMessage(
    { type: "REVIEW_CARD", key: keyFor(current), quality },
    () => {
      queue.shift();
      showNext();
    }
  );
}

document.getElementById("again").addEventListener("click", () => grade(1));
document.getElementById("good").addEventListener("click", () => grade(4));
document.getElementById("easy").addEventListener("click", () => grade(5));

loadQueue();
