import { copyFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";
import { MODEL_FILES, MODEL_ID, MODEL_REVISION, WASM_FILES } from "./modelConfig.js";

const extensionRoot = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(extensionRoot, "..");
const outputDirectory = resolve(projectRoot, "dist-extension");
const modelOutput = resolve(
  outputDirectory,
  "models",
  MODEL_ID,
  "resolve",
  MODEL_REVISION
);
const runtimeOutput = resolve(outputDirectory, "runtime");
const runtimeSource = resolve(projectRoot, "node_modules/onnxruntime-web/dist");

async function buildExtensionBundles() {
  await build({
    configFile: false,
    root: extensionRoot,
    base: "./",
    publicDir: false,
    build: {
      outDir: outputDirectory,
      emptyOutDir: true,
      target: "es2022",
      rollupOptions: {
        input: {
          background: resolve(extensionRoot, "background.js"),
          popup: resolve(extensionRoot, "popup.html")
        },
        output: {
          entryFileNames: "[name].js",
          chunkFileNames: "chunks/[name]-[hash].js",
          assetFileNames: (asset) => asset.name === "ort-wasm-simd-threaded.asyncify.wasm"
            ? "runtime/ort-wasm-simd-threaded.asyncify.wasm"
            : "assets/[name]-[hash][extname]"
        }
      }
    }
  });

  await build({
    configFile: false,
    root: extensionRoot,
    base: "./",
    publicDir: false,
    build: {
      outDir: outputDirectory,
      emptyOutDir: false,
      target: "es2022",
      rollupOptions: {
        input: resolve(extensionRoot, "content.js"),
        output: {
          format: "iife",
          name: "LexiTrackContent",
          inlineDynamicImports: true,
          entryFileNames: "content.js"
        }
      }
    }
  });
}

async function downloadFile(relativePath, destination) {
  const url = `https://huggingface.co/${MODEL_ID}/resolve/${MODEL_REVISION}/${relativePath}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Could not download ${relativePath}: HTTP ${response.status}`);
  }
  mkdirSync(dirname(destination), { recursive: true });
  const { writeFile } = await import("node:fs/promises");
  await writeFile(destination, Buffer.from(await response.arrayBuffer()));
  console.log(`Packaged ${relativePath}`);
}

async function packageLocalAssets() {
  for (const file of MODEL_FILES) {
    await downloadFile(file, resolve(modelOutput, file));
  }

  mkdirSync(runtimeOutput, { recursive: true });
  for (const file of WASM_FILES.filter((name) => name.endsWith(".mjs"))) {
    copyFileSync(resolve(runtimeSource, file), resolve(runtimeOutput, file));
  }
  const wasmFile = WASM_FILES.find((name) => name.endsWith(".wasm"));
  if (!existsSync(resolve(runtimeOutput, wasmFile))) {
    throw new Error(`ONNX WASM binary was not bundled: ${wasmFile}`);
  }

  copyFileSync(resolve(extensionRoot, "manifest.json"), resolve(outputDirectory, "manifest.json"));
}

try {
  rmSync(outputDirectory, { recursive: true, force: true });
  await buildExtensionBundles();
  await packageLocalAssets();
  console.log(`Unpacked extension created at ${outputDirectory}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}