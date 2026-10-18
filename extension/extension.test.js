import { describe, expect, it } from "vitest";
import { createQueryClassifier } from "../src/meaningModule.js";
import { addVocabularyEntry } from "./wordStore.js";
import { mergeExtensionBackup, readExtensionWords } from "./backupStorage.js";

describe("extension vocabulary storage", () => {
  it("deduplicates words regardless of case and whitespace", () => {
    const first = addVocabularyEntry([], {
      id: "one",
      word: "  Well-being ",
      query: "well-being meaning",
      dateAdded: "2026-10-18T00:00:00.000Z"
    });
    const duplicate = addVocabularyEntry(first.entries, {
      id: "two",
      word: "well-being",
      query: "what does WELL-BEING mean"
    });

    expect(duplicate.duplicate).toBe(true);
    expect(duplicate.entries).toHaveLength(1);
    expect(duplicate.entry.id).toBe("one");
  });

  it("retries after model asset loading fails", async () => {
    let attempts = 0;
    const classify = createQueryClassifier({
      pipelineFactory: async () => {
        attempts += 1;
        throw new Error("model files unavailable");
      }
    });

    await expect(classify("uncertain query")).rejects.toThrow("model files unavailable");
    await expect(classify("uncertain query")).rejects.toThrow("model files unavailable");
    expect(attempts).toBe(2);
  });

  it("rejects low-similarity and near-tie scores instead of forcing meaning", async () => {
    const vectors = {
      meaning: [1, 0],
      other: [0, 1],
      uncertain: [0.4, 0.35],
      unrelated: [0.15, 0.1]
    };
    const classify = createQueryClassifier({
      pipelineFactory: async () => async (text) => ({ tolist: () => [vectors[text]] }),
      meaningExamples: ["meaning"],
      otherExamples: ["other"]
    });

    const nearTie = await classify("uncertain");
    expect(nearTie.isMeaningQuery).toBe(false);
    expect(nearTie.meaningScore).toBe(0.4);
    expect(nearTie.otherScore).toBe(0.35);

    const lowSimilarity = await classify("unrelated");
    expect(lowSimilarity.isMeaningQuery).toBe(false);
  });

  it("merges extension backups through chrome.storage.local without replacing existing data", async () => {
    let stored = [{ id: "old", word: "Ephemeral", definition: "Keep me" }];
    const storage = {
      get: async () => ({ "lexitrack.extension.words.v1": stored }),
      set: async (value) => { stored = value["lexitrack.extension.words.v1"]; }
    };
    const result = await mergeExtensionBackup([
      { word: "ephemeral", definition: "Replace me" },
      { word: "serendipity", query: "serendipity meaning", definition: "A fortunate discovery" }
    ], 1, storage);

    expect(result).toMatchObject({ imported: 1, skipped: 1, duplicates: 1 });
    expect(await readExtensionWords(storage)).toHaveLength(2);
    expect(stored[1]).toMatchObject({ id: "old", word: "Ephemeral", definition: "Keep me" });
  });
});