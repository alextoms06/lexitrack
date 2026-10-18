import { env } from "@huggingface/transformers";
import { createQueryClassifier } from "../src/meaningModule.js";
import { createGoogleSearchProcessor } from "./searchProcessor.js";
import { MODEL_ID, MODEL_REVISION } from "./modelConfig.js";
import { logVocabularyDiagnostic } from "./diagnostics.js";

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

const processGoogleSearch = createGoogleSearchProcessor({
  classifier: classifyWithLocalModel,
  storage: chrome.storage.local,
  diagnostic: logVocabularyDiagnostic
});

function isSupportedGoogleSearchSender(sender) {
  try {
    const url = new URL(sender.tab?.url || "");
    return ["google.com", "www.google.com", "google.co.in", "www.google.co.in"].includes(url.hostname) &&
      url.pathname === "/search";
  } catch {
    return false;
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "LEXITRACK_GOOGLE_QUERY") return false;
  if (!isSupportedGoogleSearchSender(_sender)) {
    sendResponse({ status: "error", code: "unsupported-sender" });
    return false;
  }

  processGoogleSearch(String(message.query || ""), String(message.definition || ""))
    .then(sendResponse)
    .catch(() => sendResponse({ status: "error", code: "processing-failed" }));
  return true;
});