import { mergeVocabularyBackup } from "../src/lib/backup.js";
import { STORAGE_KEY } from "./wordStore.js";

export async function readExtensionWords(storage = chrome.storage.local) {
  const values = await storage.get(STORAGE_KEY);
  if (!Array.isArray(values[STORAGE_KEY])) return [];
  return values[STORAGE_KEY];
}

export async function mergeExtensionBackup(incomingWords, skipped = 0, storage = chrome.storage.local) {
  const existingWords = await readExtensionWords(storage);
  const merged = mergeVocabularyBackup(existingWords, incomingWords, skipped);

  if (merged.imported) {
    await storage.set({ [STORAGE_KEY]: merged.words });
  }

  return merged;
}