import { extractDefinitionFromGoogleDOM } from "./definitionExtractor.js";
import { extractTargetWord } from "../src/lib/queryParsing.js";

function isSupportedGoogleSearch() {
  const host = location.hostname.toLowerCase();
  return (
    (host === "google.com" || host === "www.google.com" ||
      host === "google.co.in" || host === "www.google.co.in") &&
    location.pathname === "/search"
  );
}

function showNotice(text, kind = "success") {
  let host = document.getElementById("lexitrack-extension-notice");
  if (!host) {
    host = document.createElement("div");
    host.id = "lexitrack-extension-notice";
    host.style.cssText = "all:initial;position:fixed;z-index:2147483647;top:16px;right:16px";
    document.documentElement.append(host);
    host.attachShadow({ mode: "open" });
  }

  const shadow = host.shadowRoot;
  shadow.innerHTML = `
    <style>
      :host { all: initial; font-family: system-ui, sans-serif; }
      .notice { max-width: 340px; padding: 12px 16px; border: 1px solid #d8e5dc;
        border-radius: 10px; background: #fff; color: #1d3427; box-shadow: 0 8px 30px #14281e24;
        font-size: 13px; line-height: 1.45; }
      .notice.error { color: #762f2f; border-color: #edcccc; }
      strong { font-weight: 700; }
    </style>
    <div class="notice ${kind}">${text}</div>`;
  clearTimeout(host.noticeTimer);
  host.noticeTimer = setTimeout(() => host.remove(), 6500);
}

async function detectAndSaveSearch() {
  if (!isSupportedGoogleSearch()) return;
  const query = new URLSearchParams(location.search).get("q")?.trim();
  if (!query) return;
  const targetWord = extractTargetWord(query);

  try {
    const response = await chrome.runtime.sendMessage({
      type: "LEXITRACK_GOOGLE_QUERY",
      query,
      definition: targetWord ? extractDefinitionFromGoogleDOM(document, targetWord) : ""
    });

    if (response?.status === "saved") {
      const duplicateMessage = response.duplicate ? "Already in your list" : "Saved to LexiTrack";
      showNotice(`<strong>${duplicateMessage}:</strong> ${escapeHTML(response.entry.word)}`);
    } else if (response?.status === "confirmation-required") {
      showNotice("A meaning lookup was detected, but its target word was unclear. Nothing was saved.");
    } else if (response?.status === "error") {
      showNotice(escapeHTML(response.message || "The local model could not classify this search."), "error");
    }
  } catch {
    showNotice("LexiTrack could not check this search. Nothing was saved.", "error");
  }
}

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

void detectAndSaveSearch();