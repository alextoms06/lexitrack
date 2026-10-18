import { inspectDefinitionFromGoogleDOM } from "./definitionExtractor.js";
import { extractTargetWord } from "../src/lib/queryParsing.js";
import { createSearchDeduper, getGoogleSearch } from "./googleSearch.js";
import { createConfirmationActions } from "./confirmationActions.js";
import { LEXITRACK_APP_URL } from "./appConfig.js";
import { isVocabularyDiagnosticCandidate, logVocabularyDiagnostic } from "./diagnostics.js";

const completedSearches = createSearchDeduper();
const pendingSearches = new Map();
const definitionRetryDelays = [0, 350, 900, 1800];
let lastLocation = "";
let scanTimer = 0;

function makeButton(label, action, primary = false) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.className = primary ? "action primary" : "action";
  button.addEventListener("click", action);
  return button;
}

function createPopup(kind, title, message) {
  document.getElementById("lexitrack-auto-save-popup")?.remove();
  const host = document.createElement("div");
  host.id = "lexitrack-auto-save-popup";
  host.style.cssText = "all:initial;position:fixed;z-index:2147483647;top:18px;right:18px";
  document.documentElement.append(host);
  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = `
    :host { all: initial; font-family: system-ui, sans-serif; color-scheme: dark; }
    .card { box-sizing: border-box; width: min(360px, calc(100vw - 36px)); padding: 17px;
      border: 1px solid #3a2c50; border-radius: 11px; background: #15111f; color: #f3effa;
      box-shadow: 0 16px 50px #000a; font-size: 13px; line-height: 1.5; }
    .head { display: flex; align-items: center; gap: 10px; }
    .check { display: grid; width: 28px; height: 28px; flex: 0 0 auto; place-items: center;
      border-radius: 50%; background: #173823; color: #52ef91; font-size: 19px; font-weight: 800; }
    .failure-mark { display: grid; width: 28px; height: 28px; flex: 0 0 auto; place-items: center;
      border-radius: 50%; background: #3a202a; color: #ff9daa; font-size: 15px; font-weight: 800; }
    h2 { margin: 0; color: #fff; font-size: 15px; font-weight: 750; }
    .word { margin: 12px 0 3px; color: #c99aff; font-size: 16px; font-weight: 750; overflow-wrap: anywhere; }
    .definition, .message { margin: 5px 0 0; color: #b3aabd; font-size: 12px; overflow-wrap: anywhere; }
    .buttons { display: flex; justify-content: flex-end; gap: 8px; margin-top: 15px; }
    button { min-height: 32px; padding: 0 12px; border: 1px solid #453754; border-radius: 6px;
      background: #201a2b; color: #e6deef; font: inherit; font-size: 11px; font-weight: 650; cursor: pointer; }
    button:hover { border-color: #8f58c4; background: #2b2038; }
    button.primary { border-color: #52ef91; background: #52ef91; color: #092012; }
    button.primary:hover { background: #73f5a5; }
    button:focus-visible { outline: 2px solid #52ef91; outline-offset: 2px; }
    @media (max-width: 420px) { :host { right: 10px !important; top: 10px !important; } }
  `;
  const card = document.createElement("section");
  card.className = "card";
  card.setAttribute("role", kind === "success" ? "status" : "alert");
  card.setAttribute("aria-live", kind === "success" ? "polite" : "assertive");
  const head = document.createElement("div");
  head.className = "head";
  const mark = document.createElement("span");
  mark.className = kind === "success" ? "check" : "failure-mark";
  mark.setAttribute("aria-hidden", "true");
  mark.textContent = kind === "success" ? "✓" : "!";
  const heading = document.createElement("h2");
  heading.textContent = title;
  head.append(mark, heading);
  card.append(style, head);

  if (kind === "success") {
    const word = document.createElement("p");
    word.className = "word";
    word.textContent = message.word;
    const definition = document.createElement("p");
    definition.className = "definition";
    definition.textContent = message.definition;
    card.append(word, definition);
  } else {
    const text = document.createElement("p");
    text.className = "message";
    text.textContent = message;
    card.append(text);
  }

  shadow.append(card);
  return { host, card };
}

function showSavedPopup(entry) {
  const { host, card } = createPopup("success", "Word saved!", {
    word: entry.word,
    definition: entry.definition
  });
  const buttons = document.createElement("div");
  buttons.className = "buttons";
  const actions = createConfirmationActions({
    appUrl: LEXITRACK_APP_URL,
    openTab: (url) => {
      const tab = window.open(url, "_blank");
      if (!tab) throw new Error("The browser blocked the new tab. Allow popups to open LexiTrack.");
      tab.opener = null;
    },
    dismiss: () => host.remove(),
    onConfigurationRequired: () => {
      showFailure("Set LEXITRACK_APP_URL in extension/appConfig.js and rebuild to enable this button.");
    },
    onError: (message) => {
      card.querySelector(".definition").textContent = message;
    }
  });
  buttons.append(
    makeButton("OK", actions.onOk),
    makeButton("Go to app", () => { void actions.onGoToApp(); }, true)
  );
  card.append(buttons);
}

function showFailure(message, retry) {
  const { host, card } = createPopup("failure", "Nothing was saved", message);
  const buttons = document.createElement("div");
  buttons.className = "buttons";
  buttons.append(makeButton("Dismiss", () => host.remove()));
  if (retry) buttons.append(makeButton("Retry", retry, true));
  card.append(buttons);
}

function delay(milliseconds) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

async function processSearch(search) {
  if (completedSearches.has(search.key)) return;
  if (pendingSearches.has(search.key)) return pendingSearches.get(search.key);

  const operation = (async () => {
    const word = extractTargetWord(search.query);
    const shouldLog = isVocabularyDiagnosticCandidate(search.query, word);
    if (shouldLog) {
      logVocabularyDiagnostic("google-query", { query: search.query, targetWord: word || null });
    }
    let lastResponse = { status: "ignored" };

    for (const retryDelay of definitionRetryDelays) {
      if (retryDelay) await delay(retryDelay);
      const extraction = word
        ? inspectDefinitionFromGoogleDOM(document, word, search.query)
        : { definition: "", selector: null, candidatePreview: "", reason: "target-unavailable" };
      const definition = extraction.definition;
      if (shouldLog) {
        logVocabularyDiagnostic("definition-extraction", {
          query: search.query,
          targetWord: word || null,
          matchedSelector: extraction.selector,
          candidatePreview: extraction.candidatePreview,
          reason: extraction.reason
        });
      }
      try {
        lastResponse = await chrome.runtime.sendMessage({
          type: "LEXITRACK_GOOGLE_QUERY",
          query: search.query,
          definition
        });
      } catch {
        lastResponse = { status: "error", code: "message-failed" };
      }

      if (lastResponse?.status === "saved") {
        completedSearches.claim(search.key);
        showSavedPopup(lastResponse.entry);
        return;
      }
      if (lastResponse?.status === "duplicate") {
        completedSearches.claim(search.key);
        return;
      }
      if (lastResponse?.status === "ignored") return;
      if (lastResponse?.status === "target-unavailable") {
        showFailure("LexiTrack could not identify a vocabulary term in this search. Nothing was saved.");
        return;
      }
      if (lastResponse?.status === "error") {
        showFailure("LexiTrack could not save this lookup. Your vocabulary was not changed.", () => {
          document.getElementById("lexitrack-auto-save-popup")?.remove();
          void processSearch(search);
        });
        return;
      }
    }

    if (lastResponse?.status === "definition-unavailable") {
      showFailure(`Google did not provide a dictionary definition for “${lastResponse.word}”. Nothing was saved.`, () => {
        document.getElementById("lexitrack-auto-save-popup")?.remove();
        void processSearch(search);
      });
    }
  })().finally(() => pendingSearches.delete(search.key));

  pendingSearches.set(search.key, operation);
  return operation;
}

function checkLocation() {
  const href = location.href;
  if (href === lastLocation) return;
  lastLocation = href;
  const search = getGoogleSearch(location);
  if (search) void processSearch(search);
}

function scheduleLocationCheck() {
  window.clearTimeout(scanTimer);
  scanTimer = window.setTimeout(checkLocation, 80);
}

window.addEventListener("popstate", scheduleLocationCheck);
window.addEventListener("hashchange", scheduleLocationCheck);
window.addEventListener("pageshow", scheduleLocationCheck);
document.addEventListener("submit", scheduleLocationCheck, true);
new MutationObserver(scheduleLocationCheck).observe(document.documentElement, {
  childList: true,
  subtree: true
});

checkLocation();