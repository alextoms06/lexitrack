import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import { env } from "@huggingface/transformers";
import { createQueryClassifier } from "../src/meaningModule.js";
import { detectMeaningQueryHybrid } from "../querydetector.js";
import { MODEL_ID, MODEL_REVISION } from "../extension/modelConfig.js";

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const extensionDirectory = resolve(projectRoot, "dist-extension");
const modelDirectory = resolve(
  extensionDirectory,
  "models",
  MODEL_ID,
  "resolve",
  MODEL_REVISION
);
const evaluationSet = JSON.parse(
  await readFile(resolve(projectRoot, "evaluation/query-intent-heldout.json"), "utf8")
);

await stat(resolve(modelDirectory, "onnx/model_quantized.onnx"));

const contentTypes = {
  ".json": "application/json",
  ".onnx": "application/octet-stream",
  ".wasm": "application/wasm"
};

const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    const filePath = resolve(extensionDirectory, `.${pathname}`);
    if (!filePath.startsWith(`${extensionDirectory}${sep}`)) throw new Error("Invalid path");
    const data = await readFile(filePath);
    response.writeHead(200, {
      "content-length": data.length,
      "content-type": contentTypes[extname(filePath)] || "application/octet-stream"
    });
    response.end(data);
  } catch {
    response.writeHead(404);
    response.end();
  }
});

const confusion = { truePositive: 0, trueNegative: 0, falsePositive: 0, falseNegative: 0 };
const modelLatencies = [];
const misclassified = [];
let firstModelCallMs = null;

server.listen(0, "127.0.0.1", async () => {
  env.allowLocalModels = false;
  env.allowRemoteModels = true;
  env.remoteHost = `http://127.0.0.1:${server.address().port}/models/`;
  env.remotePathTemplate = "{model}/resolve/{revision}/";

  const classify = createQueryClassifier({
    modelId: MODEL_ID,
    pipelineOptions: { dtype: "q8", revision: MODEL_REVISION }
  });

  const timedClassifier = async (query) => {
    const startedAt = performance.now();
    const result = await classify(query);
    const elapsed = performance.now() - startedAt;
    modelLatencies.push(elapsed);
    if (firstModelCallMs === null) firstModelCallMs = elapsed;
    return result;
  };

  try {
    for (const sample of evaluationSet) {
      const result = await detectMeaningQueryHybrid(sample.query, {
        classifier: timedClassifier
      });
      const predictedVocabulary = result.isMeaningQuery;
      const actualVocabulary = sample.intent === "vocabulary";

      if (predictedVocabulary && actualVocabulary) confusion.truePositive += 1;
      else if (!predictedVocabulary && !actualVocabulary) confusion.trueNegative += 1;
      else if (predictedVocabulary) confusion.falsePositive += 1;
      else confusion.falseNegative += 1;

      if (predictedVocabulary !== actualVocabulary) {
        misclassified.push({
          query: sample.query,
          expected: sample.intent,
          actual: predictedVocabulary ? "vocabulary" : "other",
          method: result.method,
          meaningScore: result.meaningScore,
          otherScore: result.otherScore
        });
      }
    }

    const sortedWarmLatencies = modelLatencies.slice(1).sort((a, b) => a - b);
    const accuracy =
      (confusion.truePositive + confusion.trueNegative) / evaluationSet.length;
    const medianWarmMs = sortedWarmLatencies.length
      ? sortedWarmLatencies[Math.floor(sortedWarmLatencies.length / 2)]
      : null;
    const p95WarmMs = sortedWarmLatencies.length
      ? sortedWarmLatencies[Math.min(
          sortedWarmLatencies.length - 1,
          Math.ceil(sortedWarmLatencies.length * 0.95) - 1
        )]
      : null;

    console.log(JSON.stringify({
      samples: evaluationSet.length,
      accuracy,
      accuracyPercent: `${(accuracy * 100).toFixed(1)}%`,
      ...confusion,
      misclassified,
      modelCalls: modelLatencies.length,
      firstModelCallMs: firstModelCallMs === null ? null : +firstModelCallMs.toFixed(2),
      warmMedianMs: medianWarmMs === null ? null : +medianWarmMs.toFixed(2),
      warmP95Ms: p95WarmMs === null ? null : +p95WarmMs.toFixed(2)
    }, null, 2));
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    server.close();
  }
});