export const STORAGE_KEY = "lexitrack.extension.words.v1";

export function normalizeWordKey(word) {
  return String(word || "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

export function addVocabularyEntry(entries, input) {
  const word = String(input?.word || "").trim().replace(/\s+/g, " ");
  const wordKey = normalizeWordKey(word);
  if (!wordKey) throw new Error("A vocabulary entry needs a word.");

  const currentEntries = Array.isArray(entries) ? entries : [];
  const existingIndex = currentEntries.findIndex(
    (entry) => normalizeWordKey(entry.word) === wordKey
  );

  if (existingIndex !== -1) {
    const existing = currentEntries[existingIndex];
    const definition = String(input.definition || "").trim();
    if (!existing.definition && definition) {
      const updated = { ...existing, definition };
      const nextEntries = [...currentEntries];
      nextEntries[existingIndex] = updated;
      return { entries: nextEntries, entry: updated, duplicate: true, updated: true };
    }
    return { entries: currentEntries, entry: existing, duplicate: true, updated: false };
  }

  const entry = {
    id: input.id || crypto.randomUUID(),
    word,
    query: String(input.query || "").trim(),
    definition: String(input.definition || "").trim(),
    dateAdded: input.dateAdded || new Date().toISOString(),
    source: String(input.source || "google-search")
  };

  return {
    entries: [entry, ...currentEntries],
    entry,
    duplicate: false,
    updated: false
  };
}