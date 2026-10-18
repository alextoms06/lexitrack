import { STORAGE_KEY } from "./wordStore.js";

const wordList = document.querySelector("#word-list");
const wordSearch = document.querySelector("#word-search");
const status = document.querySelector("#status");
const wordCount = document.querySelector("#word-count");
let words = [];

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function formatDate(date) {
  const value = new Date(date);
  return Number.isNaN(value.getTime())
    ? ""
    : value.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function renderWords() {
  const search = wordSearch.value.trim().toLocaleLowerCase();
  const filteredWords = words.filter((entry) =>
    `${entry.word} ${entry.query} ${entry.definition}`.toLocaleLowerCase().includes(search)
  );

  wordCount.textContent = `${words.length} ${words.length === 1 ? "word" : "words"}`;
  status.textContent = words.length ? "" : "Words you save from Google appear here.";

  if (!filteredWords.length) {
    wordList.innerHTML = `<p class="empty-state">${words.length ? "No matching words." : "Search a word's meaning on Google to start your list."}</p>`;
    return;
  }

  wordList.innerHTML = filteredWords.map((entry) => `
    <article class="word-card">
      <div class="word-main">
        <h2 class="word-title">${escapeHTML(entry.word)}</h2>
        ${entry.definition ? `<p class="definition">${escapeHTML(entry.definition)}</p>` : ""}
        <p class="original-query">${escapeHTML(entry.query)}${entry.dateAdded ? ` · ${escapeHTML(formatDate(entry.dateAdded))}` : ""}</p>
      </div>
      <button class="delete-button" type="button" data-delete="${escapeHTML(entry.id)}" aria-label="Delete ${escapeHTML(entry.word)}" title="Delete word">
        <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 7h16M10 11v6m4-6v6M6 7l1 14h10l1-14M9 7V4h6v3"></path></svg>
      </button>
    </article>`).join("");
}

async function loadWords() {
  status.textContent = "Loading your vocabulary…";
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    words = Array.isArray(result[STORAGE_KEY]) ? result[STORAGE_KEY] : [];
    renderWords();
  } catch {
    status.textContent = "Could not load saved words. Check the extension's storage permission.";
    wordList.innerHTML = "";
  }
}

wordSearch.addEventListener("input", renderWords);
wordList.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-delete]");
  if (!button) return;
  button.disabled = true;
  try {
    words = words.filter((entry) => entry.id !== button.dataset.delete);
    await chrome.storage.local.set({ [STORAGE_KEY]: words });
    renderWords();
  } catch {
    status.textContent = "Could not delete that word. Please try again.";
    button.disabled = false;
  }
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local" && changes[STORAGE_KEY]) {
    words = Array.isArray(changes[STORAGE_KEY].newValue) ? changes[STORAGE_KEY].newValue : [];
    renderWords();
  }
});

void loadWords();