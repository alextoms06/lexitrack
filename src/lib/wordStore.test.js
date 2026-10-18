import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createWord, readWordsResult, saveWords } from "./wordStore.js";

describe("local vocabulary storage", () => {
  let values;

  beforeEach(() => {
    values = new Map();
    vi.stubGlobal("localStorage", {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, String(value))
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it("persists category and liked state across a read", () => {
    const word = { ...createWord({ word: "ephemeral", definition: "Short-lived", category: "academic" }), liked: true };
    saveWords([word]);
    const result = readWordsResult();
    expect(result.error).toBe("");
    expect(result.words[0]).toMatchObject({ word: "ephemeral", category: "academic", liked: true });
  });

  it("reports malformed stored JSON instead of silently presenting it as an empty library", () => {
    values.set("lexitrack.words.v1", "{bad json");
    expect(readWordsResult()).toMatchObject({ words: [], error: expect.stringContaining("could not be read") });
  });

  it("reports unsupported storage data shapes", () => {
    values.set("lexitrack.words.v1", JSON.stringify({ words: [] }));
    expect(readWordsResult()).toMatchObject({ words: [], error: expect.stringContaining("invalid format") });
  });
});