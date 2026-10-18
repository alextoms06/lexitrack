import { detectMeaningQueryHybrid } from "../querydetector.js";
import { normalizeDefinitionText } from "./definitionExtractor.js";
import { addVocabularyEntry, normalizeWordKey, STORAGE_KEY } from "./wordStore.js";

export function createGoogleSearchProcessor({
  classifier,
  storage,
  storageKey = STORAGE_KEY
}) {
  let writeQueue = Promise.resolve();
  const inFlight = new Map();

  async function saveMeaningSearch(query, definition) {
    const detection = await detectMeaningQueryHybrid(query, { classifier });
    if (detection.reason === "classifier-unavailable") {
      return { status: "error", code: "classifier-unavailable" };
    }
    if (!detection.isMeaningQuery) return { status: "ignored" };
    if (!detection.word || detection.needsConfirmation) {
      return { status: "target-unavailable" };
    }

    const safeDefinition = normalizeDefinitionText(definition, detection.word, query);
    if (!safeDefinition) return { status: "definition-unavailable", word: detection.word };

    const write = async () => {
      const stored = await storage.get(storageKey);
      const existing = Array.isArray(stored[storageKey]) ? stored[storageKey] : [];
      const result = addVocabularyEntry(existing, {
        word: detection.word,
        query,
        definition: safeDefinition,
        dateAdded: new Date().toISOString(),
        source: "google-search"
      });

      if (result.duplicate && !result.updated) {
        return { status: "duplicate", entry: result.entry };
      }

      await storage.set({ [storageKey]: result.entries });
      return { status: "saved", entry: result.entry, duplicate: result.duplicate };
    };

    const pendingWrite = writeQueue.then(write, write);
    writeQueue = pendingWrite.catch(() => {});
    try {
      return await pendingWrite;
    } catch {
      return { status: "error", code: "storage-failed" };
    }
  }

  return function processGoogleSearch(query, definition) {
    const key = normalizeWordKey(query);
    if (inFlight.has(key)) return inFlight.get(key);

    const operation = saveMeaningSearch(query, definition).finally(() => inFlight.delete(key));
    inFlight.set(key, operation);
    return operation;
  };
}