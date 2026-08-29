// content.js — runs on every page

let popupEl = null;
let lastSelectionTime = 0;
let foreignPopupRect = null;
// True while the popup is in "auto-translate failed, type/paste your own" mode.
// While this is true we deliberately keep the popup open even if the user
// clicks/selects elsewhere on the page — e.g. to go copy a translation from
// another spot on the page (or switch tabs and come back) — so they have
// somewhere to paste it into. It's only cleared when the popup is closed
// (explicitly, via save, or by a brand-new lookup).
let manualEntryActive = false;

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
  manualEntryActive = false;
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
  popupEl.id = "vk-popup";
  popupEl.innerHTML = `
    <div class="vk-word">${escapeHtml(selectedText)}</div>
    <div class="vk-translation vk-loading">Translating…</div>
    <div class="vk-actions">
      <button class="vk-speak-btn" title="Hear pronunciation">🔊</button>
      <button class="vk-save-btn">Save</button>
      <button class="vk-close-btn">Close</button>
    </div>
  `;
  document.body.appendChild(popupEl);

  // Estimate our own height before layout settles, to check for collisions
  const estimatedHeight = popupEl.offsetHeight || 130;
  const { top, left } = computePosition(rect, estimatedHeight);
  popupEl.style.top = `${top}px`;
  popupEl.style.left = `${left}px`;

  popupEl.querySelector(".vk-close-btn").addEventListener("click", removePopup);
  // Speaks with no lang set until the translation response tells us the detected
  // source language below — the browser will still fall back to a default voice.
  popupEl.querySelector(".vk-speak-btn").addEventListener("click", () => {
    speak(selectedText, popupEl.dataset.sourceLang);
  });

  // Ask the background script to fetch the translation
  chrome.runtime.sendMessage(
    { type: "TRANSLATE", text: selectedText },
    (response) => {
      if (!popupEl) return; // popup may have been closed already
      const translationEl = popupEl.querySelector(".vk-translation");
      const saveBtn = popupEl.querySelector(".vk-save-btn");

      if (response && response.ok) {
        translationEl.textContent = response.translation;
        translationEl.classList.remove("vk-loading");
        popupEl.dataset.sourceLang = response.sourceLang;

        saveBtn.addEventListener("click", (e) => {
          saveEntry(e.target, {
            word: selectedText,
            translation: response.translation,
            sourceLang: response.sourceLang,
            targetLang: response.targetLang,
            context: contextSentence,
            savedAt: Date.now(),
          });
        });
      } else {
        // Auto-translate failed — let the user paste/type their own translation
        // (e.g. from google.com/translate) instead of being locked out of saving.
        // The popup stays open (see manualEntryActive below) even if they click
        // or select text elsewhere to go copy one, and Save works even if they
        // leave it blank — they can always fill the translation in later via edit.
        manualEntryActive = true;
        translationEl.classList.remove("vk-loading");
        translationEl.classList.add("vk-editable");
        translationEl.textContent = "";
        translationEl.contentEditable = "true";
        translationEl.dataset.placeholder = "Translation failed — type/paste one, or just Save without it";
        translationEl.focus();

        saveBtn.addEventListener("click", (e) => {
          const manualTranslation = translationEl.textContent.trim();
          saveEntry(e.target, {
            word: selectedText,
            translation: manualTranslation,
            sourceLang: "auto",
            targetLang: response ? response.targetLang : undefined,
            context: contextSentence,
            savedAt: Date.now(),
          });
        });
      }
    }
  );
}

function saveEntry(saveBtnEl, entry) {
  chrome.runtime.sendMessage({ type: "SAVE_WORD", entry }, () => {
    saveBtnEl.textContent = "Saved ✓";
    saveBtnEl.classList.add("vk-saved");
    setTimeout(removePopup, 700);
  });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

document.addEventListener("mouseup", (e) => {
  // Ignore clicks inside our own popup
  if (popupEl && popupEl.contains(e.target)) return;

  // Don't let a stray selection elsewhere on the page (e.g. selecting a
  // translation somewhere else to copy it) blow away an in-progress manual
  // translation entry by triggering a brand-new lookup popup. The user can
  // explicitly close the current popup (Close button) to look up something
  // else instead.
  if (popupEl && manualEntryActive) return;

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
  // While the user is in the middle of typing/pasting a manual translation,
  // don't close the popup just because they clicked or started selecting
  // something elsewhere on the page (e.g. to copy a translation from
  // somewhere else and paste it in). Only an explicit Close/Save dismisses
  // it in that state.
  if (manualEntryActive) return;
  if (popupEl && !popupEl.contains(e.target)) {
    removePopup();
  }
});
