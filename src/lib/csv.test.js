import { describe, expect, it } from "vitest";
import { fromCSV, toCSV } from "./csv.js";
import { normalizeWord } from "./wordStore.js";

describe("vocabulary CSV backups", () => {
  it("round-trips quoted text, category, and review state", () => {
    const word = {
      word: "well-being",
      partOfSpeech: "noun",
      definition: 'A state of health, happiness, and "flourishing".',
      example: "Her well-being improved, slowly.",
      note: "remember, especially",
      dateAdded: "2026-10-18T00:00:00.000Z",
      category: "academic",
      liked: true,
      mastered: false,
      reviewCount: 3
    };

    const [decoded] = fromCSV(toCSV([word])).map(normalizeWord);
    expect(decoded).toMatchObject({
      word: word.word,
      definition: word.definition,
      note: word.note,
      category: "academic",
      liked: true,
      mastered: false,
      reviewCount: 3
    });
  });
});