import { detectMeaningQueryHybrid } from "../querydetector.js";
import { normalizeDefinitionText } from "./definitionExtractor.js";
import { addVocabularyEntry, normalizeWordKey, STORAGE_KEY } from "./wordStore.js";
import { logVocabularyDiagnostic } from "./diagnostics.js";

export function createGoogleSearchProcessor({
  classifier,
  storage,
  storageKey = STORAGE_KEY,
  diagnostic = logVocabularyDiagnostic
}) {
  let writeQueue = Promise.resolve();
  const inFlight = new Map();

  async function saveMeaningSearch(query, definition) {
    const detection = await detectMeaningQueryHybrid(query, { classifier });
    if (detection.isMeaningQuery || detection.method === "model" || detection.needsConfirmation) {
      diagnostic("classification", {
        query,
        targetWord: detection.word || null,
        method: detection.method,
        result: {
          isMeaningQuery: detection.isMeaningQuery,
          needsConfirmation: Boolean(detection.needsConfirmation),
          meaningScore: detection.meaningScore,
          otherScore: detection.otherScore,
          reason: detection.reason || null
        }
      });
    }
    if (detection.reason === "classifier-unavailable") {
      diagnostic("rejected", { query, targetWord: detection.word || null, reason: "classifier-unavailable" });
      return { status: "error", code: "classifier-unavailable" };
    }
    if (!detection.isMeaningQuery) return { status: "ignored" };
    if (!detection.word || detection.needsConfirmation) {
      diagnostic("rejected", { query, targetWord: detection.word || null, reason: "target-unavailable" });
      return { status: "target-unavailable" };
    }

    const safeDefinition = normalizeDefinitionText(definition, detection.word, query);
    if (!safeDefinition) {
      diagnostic("rejected", { query, targetWord: detection.word, reason: "definition-unavailable" });
      return { status: "definition-unavailable", word: detection.word };
    }

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
        diagnostic("rejected", { query, targetWord: detection.word, reason: "already-saved" });
        return { status: "duplicate", entry: result.entry };
      }

      await storage.set({ [storageKey]: result.entries });
      diagnostic("saved", {
        query,
        targetWord: result.entry.word,
        definitionPreview: safeDefinition.slice(0, 180),
        reason: "storage-write-succeeded"
      });
      return { status: "saved", entry: result.entry, duplicate: result.duplicate };
    };

    const pendingWrite = writeQueue.then(write, write);
    writeQueue = pendingWrite.catch(() => {});
    try {
      return await pendingWrite;
    } catch {
      diagnostic("rejected", { query, targetWord: detection.word, reason: "storage-failed" });
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