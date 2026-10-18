
import { describe, it, expect, vi } from "vitest";
import {
  detectMeaningQuery,
  detectMeaningQueryHybrid,
  extractTargetWord
} from "./querydetector.js";

describe("detectMeaningQuery", () => {
  it.each([
    ["ephemeral meaning", "ephemeral"],
    ["meaning of serendipity", "serendipity"],
    ["the meaning of ineffable", "ineffable"],
    ["what does the term sesquipedalian refer to", "sesquipedalian"],
    ["explain what perspicacious means", "perspicacious"],
    ["could you tell me what ephemeral means", "ephemeral"],
    ["what does ephemeral stand for", "ephemeral"],
    ["define ubiquitous", "ubiquitous"],
    ["what does abate mean?", "abate"],
    ["what does the word ubiquitous mean", "ubiquitous"],
    ["ephemeral definition", "ephemeral"],
    ["what is the definition of mellifluous", "mellifluous"],
    ["ephemeral meaning in Malayalam", "ephemeral"]
  ])("detects %s", (query, expectedWord) => {
    const result = detectMeaningQuery(query);

    expect(result.isMeaningQuery).toBe(true);
    expect(result.word).toBe(expectedWord);
  });

  it("ignores ordinary searches", () => {
    expect(
      detectMeaningQuery("best laptops for engineering students")
        .isMeaningQuery
    ).toBe(false);
  });

  it.each([
    ["how rich was Johnny in Cobra Kai", false],
    ["interpretation of Ramayana", false],
    ["ephemeral meaning", true],
    ["what does ubiquitous mean", true],
    ["best laptop for students", false]
  ])("regresses %s to %s", async (query, expected) => {
    const classifier = vi.fn(async () => ({
      isMeaningQuery: true,
      meaningScore: 0.247,
      otherScore: 0.093
    }));
    const result = await detectMeaningQueryHybrid(query, { classifier });
    expect(result.isMeaningQuery).toBe(expected);
    if (query !== "interpretation of Ramayana") {
      expect(classifier).not.toHaveBeenCalled();
    }
  });

  it.each([
    ["what does ephemeral mean", "ephemeral"],
    ["can you explain what ubiquitous means", "ubiquitous"],
    ["meaning of serendipity", "serendipity"],
    ["define ubiquitous", "ubiquitous"],
    ["ephemeral meaning in Malayalam", "ephemeral"],
    ["meaning of serendipity in Malayalam", "serendipity"]
  ])("extracts the target from %s", (query, expectedWord) => {
    expect(extractTargetWord(query)).toBe(expectedWord);
  });

  it("does not return an entire ambiguous sentence as a word", () => {
    expect(extractTargetWord("could you tell me the meaning of that phrase please")).toBe(null);
    expect(extractTargetWord("meaning of meaning")).toBe(null);
    expect(extractTargetWord("define define")).toBe(null);
  });

  it("uses the model only for ambiguous queries and requires a score margin", async () => {
    const classifier = async () => ({
      isMeaningQuery: true,
      meaningScore: 0.79,
      otherScore: 0.62
    });
    const result = await detectMeaningQueryHybrid("word usage help", { classifier });
    expect(result.isMeaningQuery).toBe(true);
    expect(result.word).toBe(null);
    expect(result.needsConfirmation).toBe(true);

    const uncertain = await detectMeaningQueryHybrid("word usage help", {
      classifier: async () => ({ isMeaningQuery: true, meaningScore: 0.72, otherScore: 0.68 })
    });
    expect(uncertain.isMeaningQuery).toBe(false);
  });

  it("rejects ordinary ambiguous searches with the model result", async () => {
    const result = await detectMeaningQueryHybrid("best laptops for engineering students", {
      classifier: async () => ({
        isMeaningQuery: false,
        meaningScore: 0.41,
        otherScore: 0.73
      })
    });
    expect(result.isMeaningQuery).toBe(false);
  });

  it("does not load the model for literary interpretation or translation searches", async () => {
    const classifier = vi.fn();
    for (const query of [
      "interpretation of Ramayana",
      "translate this sentence into Hindi"
    ]) {
      const result = await detectMeaningQueryHybrid(query, { classifier });
      expect(result.isMeaningQuery).toBe(false);
      expect(result.method).toBe("rules");
    }
    expect(classifier).not.toHaveBeenCalled();
  });

  it("fails closed when model loading or inference fails", async () => {
    const result = await detectMeaningQueryHybrid("word usage help", {
      classifier: async () => { throw new Error("model files unavailable"); }
    });
    expect(result.isMeaningQuery).toBe(false);
    expect(result.reason).toBe("classifier-unavailable");
  });
});
