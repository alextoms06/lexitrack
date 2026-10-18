import { STORAGE_KEY } from "./wordStore.js";
import { mergeExtensionBackup } from "./backupStorage.js";
import { MAX_BACKUP_BYTES, mergeVocabularyBackup, parseVocabularyBackup, serializeVocabularyBackup } from "../src/lib/backup.js";

const wordList = document.querySelector("#word-list");
const wordSearch = document.querySelector("#word-search");
const status = document.querySelector("#status");
const wordCount = document.querySelector("#word-count");
const backupFile = document.querySelector("#backup-file");
const restoreDialog = document.querySelector("#restore-preview");
const exportBackupButton = document.querySelector("#export-backup");
const restoreBackupButton = document.querySelector("#restore-backup");
const confirmRestoreButton = document.querySelector("#confirm-restore");
let words = [];
let pendingBackup = null;

function setStatus(message, isError = false) {
  status.textContent = message;
  status.classList.toggle("is-error", isError);
}

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
  setStatus(words.length ? "" : "Words you save from Google appear here.");

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
  setStatus("Loading your vocabulary…");
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    words = Array.isArray(result[STORAGE_KEY]) ? result[STORAGE_KEY] : [];
    renderWords();
  } catch {
    setStatus("Could not load saved words. Check the extension's storage permission.", true);
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

exportBackupButton.addEventListener("click", () => {
  try {
    const date = new Date().toISOString().slice(0, 10);
    const contents = serializeVocabularyBackup(words);
    const url = URL.createObjectURL(new Blob([contents], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `lexitrack-backup-${date}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setStatus(`Exported local backup with ${words.length} ${words.length === 1 ? "word" : "words"}.`);
  } catch {
    setStatus("Could not export your backup. Please try again.", true);
  }
});

restoreBackupButton.addEventListener("click", () => backupFile.click());
backupFile.addEventListener("change", async () => {
  const file = backupFile.files?.[0];
  backupFile.value = "";
  if (!file) return;

  restoreBackupButton.disabled = true;
  setStatus("Validating backup locally…");
  try {
    if (file.size > MAX_BACKUP_BYTES) {
      throw new Error(`Backup exceeds the ${Math.floor(MAX_BACKUP_BYTES / (1024 * 1024))} MB size limit.`);
    }
    const parsed = parseVocabularyBackup(await file.text());
    const preview = mergeVocabularyBackup(words, parsed.words, parsed.skipped);
    pendingBackup = { words: parsed.words, skipped: parsed.skipped };
    document.querySelector("#restore-file-name").textContent = file.name;
    document.querySelector("#restore-import-count").textContent = String(preview.imported);
    document.querySelector("#restore-duplicate-count").textContent = String(preview.duplicates);
    document.querySelector("#restore-skipped-count").textContent = String(preview.skipped);
    confirmRestoreButton.textContent = `Merge ${preview.imported} ${preview.imported === 1 ? "word" : "words"}`;
    restoreDialog.showModal();
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Could not read this backup.", true);
  } finally {
    restoreBackupButton.disabled = false;
  }
});

document.querySelector("#cancel-restore").addEventListener("click", () => {
  pendingBackup = null;
  restoreDialog.close();
});

confirmRestoreButton.addEventListener("click", async () => {
  if (!pendingBackup) return;
  confirmRestoreButton.disabled = true;
  const previousLabel = confirmRestoreButton.textContent;
  confirmRestoreButton.textContent = "Merging…";
  try {
    const result = await mergeExtensionBackup(pendingBackup.words, pendingBackup.skipped);
    words = result.words;
    renderWords();
    setStatus(`Imported ${result.imported}; skipped ${result.skipped}; duplicates ${result.duplicates}.`);
    pendingBackup = null;
    restoreDialog.close();
  } catch {
    setStatus("Could not save the restored vocabulary. Existing entries were not replaced.", true);
  } finally {
    confirmRestoreButton.disabled = false;
    confirmRestoreButton.textContent = previousLabel;
  }
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local" && changes[STORAGE_KEY]) {
    words = Array.isArray(changes[STORAGE_KEY].newValue) ? changes[STORAGE_KEY].newValue : [];
    renderWords();
  }
});

void loadWords();