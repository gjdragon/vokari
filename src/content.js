// content.js — runs on every page

let popupEl = null;
let lastSelectionTime = 0;
let foreignPopupRect = null;

// Watch for other extensions injecting their own floating popups (e.g. Google
// Translate's own select-to-translate popup) right after a text selection, so
// we can avoid rendering on top of / underneath them.
const foreignPopupObserver = new MutationObserver((mutations) => {
  // Only care about elements that show up within ~1s of a selection
  if (Date.now() - lastSelectionTime > 1000) return;

  for (const mutation of mutations) {
    for (const node of mutation.addedNodes) {
      if (node.nodeType !== 1) continue; // elements only
      if (popupEl && (node === popupEl || node.contains?.(popupEl))) continue;

      const style = window.getComputedStyle(node);
      const isFloating = style.position === "fixed" || style.position === "absolute";
      if (!isFloating) continue;

      const rect = node.getBoundingClientRect();
      if (rect.width > 20 && rect.height > 20) {
        foreignPopupRect = rect;
      }
    }
  }
});
foreignPopupObserver.observe(document.body, { childList: true, subtree: true });

function removePopup() {
  if (popupEl) {
    popupEl.remove();
    popupEl = null;
  }
}

function getSelectionContext(selection) {
  // Grab the surrounding sentence for context, so saved entries aren't just bare words
  try {
    const node = selection.anchorNode;
    const text = node && node.textContent ? node.textContent : "";
    return text.trim().slice(0, 300);
  } catch (e) {
    return "";
  }
}

function rectsOverlapVertically(topA, bottomA, rectB) {
  return topA < rectB.bottom && bottomA > rectB.top;
}

function computePosition(rect, estimatedHeight) {
  const estimatedWidth = 280;
  let top = window.scrollY + rect.bottom + 8;
  let bottom = top + estimatedHeight;

  if (foreignPopupRect) {
    const overlapsHorizontally =
      rect.left < foreignPopupRect.right && rect.left + estimatedWidth > foreignPopupRect.left;

    if (overlapsHorizontally && rectsOverlapVertically(top, bottom, foreignPopupRect)) {
      // Another popup (e.g. Google Translate's) is sitting right where ours would go.
      // Prefer placing ours just below it; if that would run off-screen, place ours
      // above the selection instead.
      const belowForeign = window.scrollY + foreignPopupRect.bottom + 8;
      const fitsBelow = belowForeign + estimatedHeight < window.scrollY + window.innerHeight;

      if (fitsBelow) {
        top = belowForeign;
      } else {
        top = window.scrollY + rect.top - estimatedHeight - 8;
      }
    }
  }

  const left = Math.min(
    window.scrollX + rect.left,
    window.scrollX + document.documentElement.clientWidth - estimatedWidth - 20
  );

  return { top, left: Math.max(left, 8) };
}

function speak(text, lang) {
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel(); // stop anything already playing
  const utterance = new SpeechSynthesisUtterance(text);
  if (lang) utterance.lang = lang;
  window.speechSynthesis.speak(utterance);
}

function showPopup(selectedText, rect, contextSentence) {
  removePopup();

  popupEl = document.createElement("div");
  popupEl.id = "wc-popup";
  popupEl.innerHTML = `
    <div class="wc-word">${escapeHtml(selectedText)}</div>
    <div class="wc-translation wc-loading">Translating…</div>
    <div class="wc-actions">
      <button class="wc-speak-btn" title="Hear pronunciation">🔊</button>
      <button class="wc-save-btn">Save</button>
      <button class="wc-close-btn">Close</button>
    </div>
  `;
  document.body.appendChild(popupEl);

  // Estimate our own height before layout settles, to check for collisions
  const estimatedHeight = popupEl.offsetHeight || 130;
  const { top, left } = computePosition(rect, estimatedHeight);
  popupEl.style.top = `${top}px`;
  popupEl.style.left = `${left}px`;

  popupEl.querySelector(".wc-close-btn").addEventListener("click", removePopup);
  // Speaks with no lang set until the translation response tells us the detected
  // source language below — the browser will still fall back to a default voice.
  popupEl.querySelector(".wc-speak-btn").addEventListener("click", () => {
    speak(selectedText, popupEl.dataset.sourceLang);
  });

  // Ask the background script to fetch the translation
  chrome.runtime.sendMessage(
    { type: "TRANSLATE", text: selectedText },
    (response) => {
      if (!popupEl) return; // popup may have been closed already
      const translationEl = popupEl.querySelector(".wc-translation");
      if (response && response.ok) {
        translationEl.textContent = response.translation;
        translationEl.classList.remove("wc-loading");
        popupEl.dataset.sourceLang = response.sourceLang;

        popupEl.querySelector(".wc-save-btn").addEventListener("click", (e) => {
          chrome.runtime.sendMessage(
            {
              type: "SAVE_WORD",
              entry: {
                word: selectedText,
                translation: response.translation,
                sourceLang: response.sourceLang,
                targetLang: response.targetLang,
                context: contextSentence,
                url: location.href,
                savedAt: Date.now(),
              },
            },
            () => {
              e.target.textContent = "Saved ✓";
              e.target.classList.add("wc-saved");
              setTimeout(removePopup, 700);
            }
          );
        });
      } else {
        translationEl.textContent = "Translation failed";
        translationEl.classList.remove("wc-loading");
      }
    }
  );
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

document.addEventListener("mouseup", (e) => {
  // Ignore clicks inside our own popup
  if (popupEl && popupEl.contains(e.target)) return;

  const selection = window.getSelection();
  const selectedText = selection.toString().trim();

  if (selectedText && selectedText.length > 0 && selectedText.length <= 60) {
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    const contextSentence = getSelectionContext(selection);

    lastSelectionTime = Date.now();
    foreignPopupRect = null;

    // Small delay lets other extensions' popups (e.g. Google Translate's) render
    // first, so we can detect and avoid overlapping them.
    setTimeout(() => {
      showPopup(selectedText, rect, contextSentence);
    }, 220);
  } else {
    removePopup();
  }
});

document.addEventListener("mousedown", (e) => {
  if (popupEl && !popupEl.contains(e.target)) {
    removePopup();
  }
});
