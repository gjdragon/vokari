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

load();
