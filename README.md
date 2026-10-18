# LexiTrack

LexiTrack is a local-first vocabulary journal built with React, Vite, and Tailwind CSS. Words are stored in this browser with `localStorage`; no account, backend, or API key is needed.

## Run locally

```sh
npm install
npm run dev
```

Use `npm run build` to create a production build.

## Local vocabulary and backups

The web app stores vocabulary in `localStorage`; the Chrome extension uses its separate `chrome.storage.local` area. Both use the shared fields and versioned backup schema in `src/lib/backup.js`. Data stays on this device unless you export it. Clearing browser or extension data can erase saved words, so export a backup periodically.

Use **Export backup** to download a local `lexitrack-backup-YYYY-MM-DD.json` file. It contains the app identifier, schema version, export timestamp, and vocabulary entries. Restore validates the file (maximum 5 MB), previews imported, duplicate, and invalid entry counts, then merges only new normalized words after confirmation. Existing entries are never replaced or deleted. CSV import/export remains available from the web app; CSV import also previews and merges.

## Chrome extension

Build the standalone Manifest V3 extension with:

```sh
npm run build:extension
```

Then open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select `dist-extension/`. The extension checks Google Search pages on `google.com` and `google.co.in`, and stores only detected vocabulary lookups in `chrome.storage.local`. Its popup can search, delete, export, and restore its local vocabulary. Web-app and extension storage are separate; use a backup to move data between them.

The extension build downloads the pinned MiniLM model revision and packages the q8 ONNX model plus the installed Transformers.js WASM runtime into `dist-extension/`. Internet is needed when building; the built extension uses those local files and does not call a model API or Vite server. The unpacked output is about 50 MB and is ignored by Git.
