const scopeEl = document.getElementById("scope");
const amountEl = document.getElementById("amount");
const continueRow = document.getElementById("continueRow");
const continuePreviousEl = document.getElementById("continuePrevious");
const generateBtn = document.getElementById("generateBtn");
const wordCountLineEl = document.getElementById("wordCountLine");
const storyCard = document.getElementById("storyCard");
const storyTitleEl = document.getElementById("storyTitle");
const storyTextEl = document.getElementById("storyText");
const storyMetaEl = document.getElementById("storyMeta");
const storyErrorEl = document.getElementById("storyError");
const emptyStateEl = document.getElementById("emptyState");
const favoriteBtn = document.getElementById("favoriteBtn");
const playBtn = document.getElementById("playBtn");
const deleteBtn = document.getElementById("deleteBtn");
const historyToggle = document.getElementById("historyToggle");
const historyListEl = document.getElementById("historyList");

let currentWords = [];      // the word entries the current story was built from
let currentStories = [];    // all cached stories for the current scope/amount/levels key
let currentStory = null;    // the story record currently displayed
let playingStory = false;

function currentSelection() {
  const scope = scopeEl.value;
  const amount = Math.max(1, parseInt(amountEl.value, 10) || 1);
  const levels = Array.from(document.querySelectorAll(".lvl-cb:checked")).map((cb) => Number(cb.value));
  return { scope, amount, levels };
}

// --- Rendering ---

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// Turns **word** markers from the AI response into hoverable <mark> spans that
// show that word's saved translation as a tooltip. Falls back to plain text
// (no tooltip) if the word isn't found in the current batch, which can happen
// if the model used a very different inflection than what's saved.
function renderStoryText(text) {
  const escaped = escapeHtml(text);
  return escaped.replace(/\*\*(.+?)\*\*/g, (match, word) => {
    const entry = currentWords.find(
      (w) => w.word.toLowerCase() === word.toLowerCase() || word.toLowerCase().includes(w.word.toLowerCase())
    );
    const tip = entry && entry.translation ? escapeHtml(entry.translation) : "";
    return `<mark data-word="${escapeHtml(word)}">${word}${tip ? `<span class="tip">${tip}</span>` : ""}</mark>`;
  });
}

function showStory(record) {
  stopPlayStory();
  currentStory = record;
  storyCard.classList.add("visible");
  emptyStateEl.style.display = "none";
  storyErrorEl.textContent = "";
  storyTitleEl.textContent = record.title;
  storyTextEl.innerHTML = renderStoryText(record.story);
  const date = new Date(record.generatedAt).toLocaleString();
  storyMetaEl.textContent = `${record.wordsUsed.length} of ${record.wordCount} words used · generated ${date}`;
  favoriteBtn.textContent = record.favorite ? "★" : "☆";
  favoriteBtn.classList.toggle("active", !!record.favorite);
}

function showEmpty() {
  stopPlayStory();
  currentStory = null;
  storyCard.classList.remove("visible");
  emptyStateEl.style.display = "block";
}

function renderHistory() {
  const others = currentStories.filter((s) => !currentStory || s.id !== currentStory.id).slice().reverse();
  if (others.length === 0) {
    historyToggle.style.display = "none";
    historyListEl.classList.remove("visible");
    historyListEl.innerHTML = "";
    return;
  }
  historyToggle.style.display = "inline-block";
  historyToggle.textContent = historyListEl.classList.contains("visible")
    ? `Hide earlier stories (${others.length})`
    : `Earlier stories (${others.length})`;
  historyListEl.innerHTML = "";
  others.forEach((s) => {
    const div = document.createElement("div");
    div.className = "history-item";
    div.innerHTML = `<span class="h-title">${s.favorite ? "★ " : ""}${escapeHtml(s.title)}</span><span class="h-date">${new Date(
      s.generatedAt
    ).toLocaleDateString()}</span>`;
    div.addEventListener("click", () => {
      showStory(s);
      renderHistory();
    });
    historyListEl.appendChild(div);
  });
}

historyToggle.addEventListener("click", () => {
  historyListEl.classList.toggle("visible");
  renderHistory();
});

// --- Loading existing state for the current scope selection ---

async function refreshWordCount() {
  const { scope, amount, levels } = currentSelection();
  const response = await chrome.runtime.sendMessage({ type: "GET_STORY_WORDS", scope, amount, levels });
  currentWords = response.words || [];
  wordCountLineEl.textContent =
    currentWords.length === 0
      ? "No saved words match this batch yet."
      : `${currentWords.length} word${currentWords.length === 1 ? "" : "s"} in this batch`;
  generateBtn.disabled = currentWords.length === 0;
}

async function refreshStories() {
  const { scope, amount, levels } = currentSelection();
  const response = await chrome.runtime.sendMessage({ type: "GET_STORIES", scope, amount, levels });
  currentStories = response.stories || [];
  continueRow.classList.toggle("disabled", currentStories.length === 0);
  continuePreviousEl.disabled = currentStories.length === 0;
  if (currentStories.length > 0) {
    showStory(currentStories[currentStories.length - 1]);
  } else {
    showEmpty();
  }
  renderHistory();
}

async function refreshAll() {
  await refreshWordCount();
  await refreshStories();
}

[scopeEl, amountEl, ...document.querySelectorAll(".lvl-cb")].forEach((el) => {
  el.addEventListener("change", refreshAll);
});

// --- Generate ---

generateBtn.addEventListener("click", async () => {
  const { scope, amount, levels } = currentSelection();
  storyErrorEl.textContent = "";
  generateBtn.disabled = true;
  const originalLabel = generateBtn.textContent;
  generateBtn.innerHTML = `<span class="spinner"></span>Writing…`;
  try {
    const response = await chrome.runtime.sendMessage({
      type: "GENERATE_STORY",
      scope,
      amount,
      levels,
      continueFromPrevious: continuePreviousEl.checked,
    });
    if (!response.ok) throw new Error(response.error || "Something went wrong generating the story.");
    currentWords = response.words || currentWords;
    currentStories = response.stories || currentStories;
    showStory(response.record);
    renderHistory();
  } catch (err) {
    storyErrorEl.textContent = err.message;
  } finally {
    generateBtn.disabled = currentWords.length === 0;
    generateBtn.textContent = originalLabel;
  }
});

// --- Favorite / delete ---

favoriteBtn.addEventListener("click", async () => {
  if (!currentStory) return;
  const { scope, amount, levels } = currentSelection();
  const response = await chrome.runtime.sendMessage({
    type: "TOGGLE_STORY_FAVORITE",
    scope,
    amount,
    levels,
    id: currentStory.id,
  });
  currentStories = response.stories || currentStories;
  const updated = currentStories.find((s) => s.id === currentStory.id);
  if (updated) showStory(updated);
  renderHistory();
});

deleteBtn.addEventListener("click", async () => {
  if (!currentStory) return;
  if (!confirm("Delete this story? This can't be undone.")) return;
  const { scope, amount, levels } = currentSelection();
  const response = await chrome.runtime.sendMessage({
    type: "DELETE_STORY",
    scope,
    amount,
    levels,
    id: currentStory.id,
  });
  currentStories = response.stories || [];
  if (currentStories.length > 0) {
    showStory(currentStories[currentStories.length - 1]);
  } else {
    showEmpty();
  }
  renderHistory();
});

// --- Play the whole story aloud, one **highlighted** word at a time is not
// necessary — read it as continuous natural speech, but track roughly which
// word is being spoken via the boundary event so the highlight can follow
// along visually. ---

function stopPlayStory() {
  playingStory = false;
  window.speechSynthesis.cancel();
  playBtn.textContent = "🔊";
  playBtn.classList.remove("playing");
  storyTextEl.querySelectorAll("mark.playing-now").forEach((m) => m.classList.remove("playing-now"));
}

playBtn.addEventListener("click", () => {
  if (playingStory) {
    stopPlayStory();
    return;
  }
  if (!currentStory) return;
  if (!("speechSynthesis" in window)) return;

  const plainText = currentStory.story.replace(/\*\*/g, "");
  const utterance = new SpeechSynthesisUtterance(plainText);
  utterance.rate = 0.95;

  utterance.onboundary = (e) => {
    if (e.name !== "word") return;
    const spoken = plainText.slice(e.charIndex, e.charIndex + (e.charLength || 12)).toLowerCase();
    storyTextEl.querySelectorAll("mark.playing-now").forEach((m) => m.classList.remove("playing-now"));
    storyTextEl.querySelectorAll("mark").forEach((m) => {
      const w = (m.getAttribute("data-word") || "").toLowerCase();
      if (w && spoken.includes(w.slice(0, Math.min(4, w.length)))) m.classList.add("playing-now");
    });
  };

  utterance.onend = stopPlayStory;
  utterance.onerror = stopPlayStory;

  playingStory = true;
  playBtn.textContent = "⏸";
  playBtn.classList.add("playing");
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
});

refreshAll();
