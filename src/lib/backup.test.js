import { describe, expect, it } from "vitest";
import {
  createVocabularyBackup,
  mergeVocabularyBackup,
  parseVocabularyBackup,
  serializeVocabularyBackup,
  MAX_BACKUP_BYTES
} from "./backup.js";

const completeEntry = {
  id: "web-word-1",
  word: "ephemeral",
  definition: "Lasting for a very short time.",
  query: "ephemeral meaning",
  dateAdded: "2026-10-18T00:00:00.000Z",
  note: "from a book",
  category: "academic",
  categories: ["academic", "favorite"],
  source: "google-search",
  partOfSpeech: "adjective",
  example: "An ephemeral bloom.",
  liked: true,
  mastered: false,
  reviewCount: 2
};

describe("LexiTrack versioned JSON backups", () => {
  it("round-trips all web and extension vocabulary fields", () => {
    const serialized = serializeVocabularyBackup([completeEntry], "2026-10-18T12:00:00.000Z");
    const parsed = parseVocabularyBackup(serialized);
    expect(JSON.parse(serialized)).toMatchObject({
      appId: "lexitrack",
      version: 1,
      exportedAt: "2026-10-18T12:00:00.000Z"
    });
    expect(parsed.words[0]).toMatchObject(completeEntry);
    expect(parsed.skipped).toBe(0);
  });

  it("accepts a valid empty backup", () => {
    const backup = createVocabularyBackup([], "2026-10-18T12:00:00.000Z");
    expect(parseVocabularyBackup(JSON.stringify(backup))).toMatchObject({ words: [], skipped: 0 });
  });

  it("rejects malformed JSON and unsupported versions", () => {
    expect(() => parseVocabularyBackup("{bad json")).toThrow("not valid JSON");
    const backup = createVocabularyBackup([]);
    backup.version = 2;
    expect(() => parseVocabularyBackup(JSON.stringify(backup))).toThrow("not supported");
  });

  it("rejects files over the configured size limit", () => {
    expect(() => parseVocabularyBackup("x".repeat(MAX_BACKUP_BYTES + 1))).toThrow("size limit");
  });

  it("merges new words without overwriting or deleting existing entries", () => {
    const existing = [{ ...completeEntry, word: "Ephemeral", note: "Keep this note" }];
    const incoming = [
      { ...completeEntry, word: " ephemeral ", note: "Do not replace me" },
      { ...completeEntry, id: "new-word", word: "serendipity", definition: "A fortunate discovery." },
      { word: "serendipity", definition: "Duplicate within the backup" }
    ];
    const merged = mergeVocabularyBackup(existing, incoming);

    expect(merged.imported).toBe(1);
    expect(merged.duplicates).toBe(2);
    expect(merged.skipped).toBe(0);
    expect(merged.words).toHaveLength(2);
    expect(merged.words[1]).toMatchObject({ word: "Ephemeral", note: "Keep this note" });
  });

  it("counts invalid entries as skipped without interpreting their content", () => {
    const backup = createVocabularyBackup([completeEntry]);
    backup.words.push({ definition: "No word field" }, "not an entry");
    expect(parseVocabularyBackup(JSON.stringify(backup))).toMatchObject({
      words: [expect.objectContaining({ word: "ephemeral" })],
      skipped: 2
    });
  });
});