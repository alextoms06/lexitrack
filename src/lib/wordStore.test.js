import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createWord, readWordsResult, saveWords, upsertWord } from "./wordStore.js";

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

  it("preserves extension provenance and optional backup fields in localStorage", () => {
    saveWords([{
      ...createWord({ word: "serendipity", definition: "" }),
      definition: "",
      query: "meaning of serendipity",
      source: "google-search",
      categories: ["interesting", "favorite"]
    }]);

    expect(readWordsResult().words[0]).toMatchObject({
      word: "serendipity",
      definition: "",
      query: "meaning of serendipity",
      source: "google-search",
      categories: ["interesting", "favorite"]
    });
  });

  it("adds a new word when the add-dialog marker is an empty object", () => {
    const existing = [createWord({ word: "ephemeral", definition: "Short-lived" })];
    const result = upsertWord(existing, { word: "serendipity", definition: "A fortunate discovery" }, {});

    expect(result.error).toBeUndefined();
    expect(result.isEditing).toBe(false);
    expect(result.words).toHaveLength(2);
    expect(result.words[0]).toMatchObject({ word: "serendipity", definition: "A fortunate discovery" });
    expect(result.words[1]).toBe(existing[0]);
  });

  it("updates an existing word only when the edit target has an id", () => {
    const existing = [createWord({ word: "ephemeral", definition: "Short-lived" })];
    const result = upsertWord(existing, { ...existing[0], definition: "Brief" }, existing[0]);

    expect(result.isEditing).toBe(true);
    expect(result.words).toHaveLength(1);
    expect(result.words[0].definition).toBe("Brief");
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