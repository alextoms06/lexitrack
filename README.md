# LexiTrack

LexiTrack is a local-first vocabulary journal built with React, Vite, and Tailwind CSS. Words are stored in this browser with `localStorage`; no account, backend, or API key is needed.

## Run locally

```sh
npm install
npm run dev
```

Use `npm run build` to create a production build.

## Word data and extension integration

The shared word shape and persistence boundary live in `src/lib/wordStore.js`. The app's manual form and import flow both normalize entries through this layer, so a future extension integration can add an ingress adapter there without changing the journal UI. Each word accepts `word` and `definition`, with optional `partOfSpeech`, `example`, and `note` fields. Data stays in the current browser profile until exported.

Use **Import** to append a JSON array (or an object containing a `words` array) or a CSV file with `word` and `definition` columns. **Export** downloads the journal as JSON or CSV.

## Chrome extension

Build the standalone Manifest V3 extension with:

```sh
npm run build:extension
```

Then open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select `dist-extension/`. The extension checks Google Search pages on `google.com` and `google.co.in`, and stores only detected vocabulary lookups in `chrome.storage.local`. Its popup can search and delete saved entries. It does not replace or connect to the React dashboard.

The extension build downloads the pinned MiniLM model revision and packages the q8 ONNX model plus the installed Transformers.js WASM runtime into `dist-extension/`. Internet is needed when building; the built extension uses those local files and does not call a model API or Vite server. The unpacked output is about 50 MB and is ignored by Git.
