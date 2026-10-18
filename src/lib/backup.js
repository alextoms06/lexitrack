export const BACKUP_APP_ID = "lexitrack";
export const BACKUP_FORMAT = "lexitrack-vocabulary-backup";
export const BACKUP_VERSION = 1;
export const MAX_BACKUP_BYTES = 5 * 1024 * 1024;
export const MAX_BACKUP_ENTRIES = 50000;

const STRING_FIELDS = [
  "id",
  "word",
  "definition",
  "query",
  "dateAdded",
  "note",
  "category",
  "source",
  "partOfSpeech",
  "example"
];
const BOOLEAN_FIELDS = ["liked", "mastered"];

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function normalizeBackupEntry(value) {
  if (!isRecord(value) || typeof value.word !== "string") return null;
  const word = value.word.trim().replace(/\s+/g, " ");
  if (!word || word.length > 500) return null;

  const entry = { word };
  for (const field of STRING_FIELDS) {
    if (field === "word" || value[field] === undefined) continue;
    if (typeof value[field] !== "string") return null;
    entry[field] = field === "id" ? value[field] : value[field].trim();
  }
  for (const field of BOOLEAN_FIELDS) {
    if (value[field] === undefined) continue;
    if (typeof value[field] !== "boolean") return null;
    entry[field] = value[field];
  }
  if (value.reviewCount !== undefined) {
    if (!Number.isInteger(value.reviewCount) || value.reviewCount < 0) return null;
    entry.reviewCount = value.reviewCount;
  }
  if (value.categories !== undefined) {
    if (!Array.isArray(value.categories) || !value.categories.every((item) => typeof item === "string")) {
      return null;
    }
    entry.categories = value.categories.map((item) => item.trim()).filter(Boolean);
  }
  if (!entry.dateAdded) entry.dateAdded = new Date().toISOString();
  if (!entry.definition) entry.definition = "";
  return entry;
}

export function createVocabularyBackup(words, exportedAt = new Date().toISOString()) {
  if (!Array.isArray(words)) throw new Error("Vocabulary data must be a list of entries.");
  if (words.length > MAX_BACKUP_ENTRIES) throw new Error("This library contains too many entries to export.");

  const normalized = words.map(normalizeBackupEntry);
  if (normalized.some((entry) => !entry)) {
    throw new Error("This library contains an invalid entry and cannot be exported safely.");
  }

  return {
    format: BACKUP_FORMAT,
    appId: BACKUP_APP_ID,
    version: BACKUP_VERSION,
    exportedAt,
    words: normalized
  };
}

export function serializeVocabularyBackup(words, exportedAt) {
  return JSON.stringify(createVocabularyBackup(words, exportedAt), null, 2);
}

export function parseVocabularyBackup(text, { maxBytes = MAX_BACKUP_BYTES } = {}) {
  if (typeof text !== "string") throw new Error("Backup contents must be text.");
  if (new TextEncoder().encode(text).byteLength > maxBytes) {
    throw new Error(`Backup exceeds the ${Math.floor(maxBytes / (1024 * 1024))} MB size limit.`);
  }

  let backup;
  try {
    backup = JSON.parse(text);
  } catch {
    throw new Error("This file is not valid JSON.");
  }

  if (!isRecord(backup) || backup.appId !== BACKUP_APP_ID || backup.format !== BACKUP_FORMAT) {
    throw new Error("This is not a LexiTrack vocabulary backup.");
  }
  if (backup.version !== BACKUP_VERSION) {
    throw new Error(`Backup version ${String(backup.version)} is not supported.`);
  }
  if (typeof backup.exportedAt !== "string" || !Number.isFinite(Date.parse(backup.exportedAt))) {
    throw new Error("The backup timestamp is missing or invalid.");
  }
  if (!Array.isArray(backup.words)) throw new Error("The backup must contain a words list.");
  if (backup.words.length > MAX_BACKUP_ENTRIES) {
    throw new Error(`Backups may contain no more than ${MAX_BACKUP_ENTRIES} entries.`);
  }

  const words = [];
  let skipped = 0;
  for (const rawEntry of backup.words) {
    const entry = normalizeBackupEntry(rawEntry);
    if (entry) words.push(entry);
    else skipped += 1;
  }

  return { words, skipped, exportedAt: backup.exportedAt };
}

export function mergeVocabularyBackup(existingWords, incomingWords, skipped = 0) {
  const existing = Array.isArray(existingWords) ? [...existingWords] : [];
  const knownWords = new Set(
    existing.map((entry) => normalizeWordKey(entry.word)).filter(Boolean)
  );
  const knownIds = new Set(existing.map((entry) => entry.id).filter(Boolean));
  const additions = [];
  let duplicates = 0;
  let invalid = skipped;

  for (const rawEntry of incomingWords) {
    const entry = normalizeBackupEntry(rawEntry);
    if (!entry) {
      invalid += 1;
      continue;
    }
    const key = normalizeWordKey(entry.word);
    if (knownWords.has(key)) {
      duplicates += 1;
      continue;
    }
    knownWords.add(key);
    if (!entry.id || knownIds.has(entry.id)) entry.id = crypto.randomUUID();
    knownIds.add(entry.id);
    additions.push(entry);
  }

  return {
    words: [...additions, ...existing],
    additions,
    imported: additions.length,
    skipped: invalid,
    duplicates
  };
}

export function normalizeWordKey(word) {
  return String(word || "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase();
}