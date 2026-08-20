const listEl = document.getElementById("list");
const emptyEl = document.getElementById("empty");
const searchEl = document.getElementById("search");
const targetLangEl = document.getElementById("targetLang");

let library = [];

async function load() {
  const data = await chrome.storage.local.get(["library", "targetLang"]);
  library = data.library || [];
  targetLangEl.value = data.targetLang || "zh-CN";
  render();
  renderReviewBanner();
}

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

function render(filter = "") {
  const filtered = library
    .slice()
    .reverse()
    .filter(
      (e) =>
        e.word.toLowerCase().includes(filter.toLowerCase()) ||
        e.translation.toLowerCase().includes(filter.toLowerCase())
    );

  listEl.innerHTML = "";
  emptyEl.style.display = filtered.length === 0 ? "block" : "none";

  filtered.forEach((entry) => {
    const div = document.createElement("div");
    div.className = "entry";
    const date = new Date(entry.savedAt).toLocaleDateString();
    div.innerHTML = `
      <span class="del" data-word="${entry.word}" data-time="${entry.savedAt}">✕ remove</span>
      <div class="word">${entry.word}</div>
      <div class="translation">${entry.translation}</div>
      <div class="meta">${date}${entry.context ? " · " + truncate(entry.context, 60) : ""}</div>
    `;
    listEl.appendChild(div);
  });

  listEl.querySelectorAll(".del").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const word = btn.getAttribute("data-word");
      const time = Number(btn.getAttribute("data-time"));
      library = library.filter((e) => !(e.word === word && e.savedAt === time));
      await chrome.storage.local.set({ library });
      render(searchEl.value);
      renderReviewBanner();
    });
  });
}

function truncate(str, n) {
  return str.length > n ? str.slice(0, n) + "…" : str;
}

searchEl.addEventListener("input", () => render(searchEl.value));

targetLangEl.addEventListener("change", () => {
  chrome.storage.local.set({ targetLang: targetLangEl.value });
});

document.getElementById("clearAll").addEventListener("click", async () => {
  if (confirm("Delete all saved words? This cannot be undone.")) {
    library = [];
    await chrome.storage.local.set({ library });
    render();
    renderReviewBanner();
  }
});

document.getElementById("exportCsv").addEventListener("click", () => {
  const rows = [["Word", "Translation", "Context", "URL", "Date"]];
  library.forEach((e) =>
    rows.push([e.word, e.translation, e.context || "", e.url || "", new Date(e.savedAt).toISOString()])
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
function entryKey(e) {
  return `${e.word.toLowerCase()}|${e.translation}`;
}

document.getElementById("exportJson").addEventListener("click", () => {
  const payload = {
    exportedAt: new Date().toISOString(),
    source: "Word Catcher",
    version: 1,
    library,
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
  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    incoming = Array.isArray(parsed) ? parsed : parsed.library;
    if (!Array.isArray(incoming)) throw new Error("No word list found in file");
  } catch (err) {
    showImportStatus(`Import failed: ${err.message}`, true);
    return;
  }

  const existingByKey = new Map(library.map((e) => [entryKey(e), e]));
  let added = 0;
  let updated = 0;
  let unchanged = 0;

  for (const incomingEntry of incoming) {
    if (!incomingEntry || !incomingEntry.word || !incomingEntry.translation) continue;
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
  await chrome.storage.local.set({ library });
  render(searchEl.value);
  renderReviewBanner();
  showImportStatus(
    `Imported ${incoming.length} word${incoming.length === 1 ? "" : "s"}: ${added} new, ${updated} updated, ${unchanged} already up to date.`
  );
});

// Given two entries for the same word, return whichever represents more SRS progress.
function pickFurtherAlong(a, b) {
  const repA = a.repetition || 0;
  const repB = b.repetition || 0;
  if (repA !== repB) return repA > repB ? a : b;

  const revA = a.lastReviewed || 0;
  const revB = b.lastReviewed || 0;
  if (revA !== revB) return revA > revB ? a : b;

  // Tie: keep the one with the earlier savedAt (preserve original save date),
  // but merge in any context/url the other one has if this one is missing it.
  const keeper = (a.savedAt || 0) <= (b.savedAt || 0) ? a : b;
  const other = keeper === a ? b : a;
  if (!keeper.context && other.context) keeper.context = other.context;
  if (!keeper.url && other.url) keeper.url = other.url;
  return keeper;
}

function showImportStatus(message, isError = false) {
  const el = document.getElementById("importStatus");
  el.textContent = message;
  el.style.color = isError ? "#e74c3c" : "#a9d6ff";
  el.style.display = "block";
}

load();
