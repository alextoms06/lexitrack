# LexiTrack Chrome extension

Run `npm run build:extension` from the repository root, then load `dist-extension/` from `chrome://extensions` with Developer mode enabled. The output directory is a complete unpacked Manifest V3 extension; it is independent of the Vite development server.

## Detection behavior

Explicit definition patterns are handled without loading the model. Searches without meaning-related cues also skip model inference. Remaining ambiguous queries are classified locally with the shared MiniLM example-embedding classifier. The scores are not probabilities: a model decision must exceed both a minimum meaning similarity of `0.28` and the other-class score by `0.12`. These conservative thresholds are not calibrated confidence values. Queries without a safely extracted target (one to three lexical tokens) are skipped and never stored as full sentences.

Entries are saved to `chrome.storage.local` with the word, original query, captured dictionary definition, timestamp, and `google-search` source. The extension does not save an entry unless it captures a Google dictionary definition; missing definitions get a retryable failure notice instead. Duplicate words are matched case-insensitively after Unicode normalization and whitespace cleanup. The popup offers local **Export backup** and **Restore backup** actions using the shared versioned JSON schema. Restore checks the file size/schema, previews counts, and merges only new words after confirmation; it never replaces existing entries. Clearing extension data can erase the vocabulary, so export a backup regularly. The definition extractor only reads Google dictionary `[data-dobid="dfn"]` nodes; Google can change its markup, so definitions may be unavailable. No definition is generated or fabricated.

## Deployed app URL

There is no deployed web-app URL in the repository. Set `LEXITRACK_APP_URL` in `extension/appConfig.js` to the real HTTPS deployment address, then run `npm run build:extension`. Until configured, **Go to app** will not open an invented destination and will tell the user the configuration is missing.

## Local model files

The build pins a MiniLM repository revision, downloads its config/tokenizer files and q8 ONNX weights, and packages them alongside the ONNX Runtime WASM factory and binary from the installed Transformers.js dependency. The resulting extension does not fetch JavaScript, model weights, or WASM from a CDN at runtime. A build therefore needs network access to Hugging Face; loading the completed extension does not.

To reproduce the held-out accuracy and local first/warm inference measurements, first run `npm run build:extension`, then run `npm run eval:query-intent`. The labeled evaluation set is `evaluation/query-intent-heldout.json`; it is separate from the model's example prompts.

The extension asks only for Chrome's `storage` permission. Static content-script matches provide access to Google Search pages on `google.com` and `google.co.in`.