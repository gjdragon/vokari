const wordHeadingEl = document.getElementById("wordHeading");
const notFoundEl = document.getElementById("notFound");
const editForm = document.getElementById("editForm");
const translationInput = document.getElementById("translationInput");
const contextInput = document.getElementById("contextInput");
const explanationInput = document.getElementById("explanationInput");
const similarWordsInput = document.getElementById("similarWordsInput");
const notesInput = document.getElementById("notesInput");
const errorEl = document.getElementById("error");
const saveBtn = document.getElementById("saveBtn");
const cancelBtn = document.getElementById("cancelBtn");

const params = new URLSearchParams(location.search);
const targetWord = params.get("word") || "";
const targetTime = Number(params.get("time"));

function keyFor(entry) {
  return `${entry.word}|${entry.savedAt}`;
}

async function findEntry() {
  const { library = [] } = await chrome.storage.local.get("library");
  return library.find((e) => e.word === targetWord && e.savedAt === targetTime);
}

async function load() {
  const entry = await findEntry();
  if (!entry) {
    wordHeadingEl.textContent = targetWord || "Word not found";
    notFoundEl.style.display = "block";
    editForm.style.display = "none";
    return;
  }
  wordHeadingEl.textContent = entry.word;
  translationInput.value = entry.translation || "";
  contextInput.value = entry.context || "";
  explanationInput.value = entry.explanation || "";
  similarWordsInput.value = entry.similarWords || "";
  notesInput.value = entry.notes || "";
  translationInput.focus();
}

cancelBtn.addEventListener("click", () => window.close());

// Esc closes the window like Cancel — but not while focus is inside a text
// field, so it doesn't fight with things like cancelling an IME composition
// (common when typing a Chinese/Japanese/Korean translation) or just clearing
// a selection inside a field.
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  const tag = (e.target.tagName || "").toLowerCase();
  if (tag === "input" || tag === "textarea") return;
  window.close();
});

saveBtn.addEventListener("click", async () => {
  const entry = await findEntry();
  if (!entry) {
    window.close();
    return;
  }

  const newTranslation = translationInput.value.trim();
  const newContext = contextInput.value.trim();
  const newExplanation = explanationInput.value.trim();
  const newSimilarWords = similarWordsInput.value.trim();
  const newNotes = notesInput.value.trim();

  if (!newTranslation) {
    errorEl.textContent = "Meaning can't be empty.";
    errorEl.style.display = "block";
    translationInput.focus();
    return;
  }

  errorEl.style.display = "none";
  saveBtn.disabled = true;

  chrome.runtime.sendMessage(
    {
      type: "EDIT_WORD_ENTRY",
      key: keyFor(entry),
      translation: newTranslation,
      explanation: newExplanation,
      similarWords: newSimilarWords,
      notes: newNotes,
      context: newContext,
    },
    (res) => {
      saveBtn.disabled = false;
      if (!res || !res.ok) {
        errorEl.textContent = (res && res.error) || "Something went wrong saving your edit.";
        errorEl.style.display = "block";
        return;
      }
      window.close();
    }
  );
});

load();
