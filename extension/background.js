import { env } from "@huggingface/transformers";
import { createQueryClassifier } from "../src/meaningModule.js";
import { detectMeaningQueryHybrid } from "../querydetector.js";
import { addVocabularyEntry, STORAGE_KEY } from "./wordStore.js";
import { MODEL_ID, MODEL_REVISION } from "./modelConfig.js";

env.allowLocalModels = false;
env.allowRemoteModels = true;
env.remoteHost = chrome.runtime.getURL("models/");
env.remotePathTemplate = "{model}/resolve/{revision}/";
env.backends.onnx.wasm.wasmPaths = {
  mjs: chrome.runtime.getURL("runtime/ort-wasm-simd-threaded.asyncify.mjs"),
  wasm: chrome.runtime.getURL("runtime/ort-wasm-simd-threaded.asyncify.wasm")
};
env.backends.onnx.wasm.numThreads = 1;

const classifyWithLocalModel = createQueryClassifier({
  modelId: MODEL_ID,
  pipelineOptions: { dtype: "q8", revision: MODEL_REVISION }
});

let writeQueue = Promise.resolve();

function serializeStorageWrite(operation) {
  const result = writeQueue.then(operation, operation);
  writeQueue = result.catch(() => {});
  return result;
}

async function readStoredWords() {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  return Array.isArray(result[STORAGE_KEY]) ? result[STORAGE_KEY] : [];
}

async function processSearch(query, definition) {
  const detection = await detectMeaningQueryHybrid(query, {
    classifier: classifyWithLocalModel
  });

  if (!detection.isMeaningQuery) {
    return detection.reason === "classifier-unavailable"
      ? { status: "error", message: "The local meaning model could not be loaded. Nothing was saved." }
      : { status: "ignored" };
  }

  if (!detection.word || detection.needsConfirmation) {
    return { status: "confirmation-required" };
  }

  return serializeStorageWrite(async () => {
    const entries = await readStoredWords();
    const result = addVocabularyEntry(entries, {
      word: detection.word,
      query,
      definition,
      dateAdded: new Date().toISOString(),
      source: "google-search"
    });
    await chrome.storage.local.set({ [STORAGE_KEY]: result.entries });
    return {
      status: "saved",
      entry: result.entry,
      duplicate: result.duplicate,
      updated: result.updated,
      count: result.entries.length
    };
  });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "LEXITRACK_GOOGLE_QUERY") return false;

  processSearch(String(message.query || ""), String(message.definition || ""))
    .then(sendResponse)
    .catch((error) => {
      sendResponse({
        status: "error",
        message: error instanceof Error ? error.message : String(error)
      });
    });
  return true;
});