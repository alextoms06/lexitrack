import { describe, expect, it, vi } from "vitest";
import { createQueryClassifier } from "../src/meaningModule.js";
import { addVocabularyEntry } from "./wordStore.js";
import { mergeExtensionBackup, readExtensionWords } from "./backupStorage.js";
import { extractDefinitionFromGoogleDOM, inspectDefinitionFromGoogleDOM } from "./definitionExtractor.js";
import { createGoogleSearchProcessor } from "./searchProcessor.js";
import { createSearchDeduper, getGoogleSearch } from "./googleSearch.js";
import { createConfirmationActions } from "./confirmationActions.js";
import { isVocabularyDiagnosticCandidate } from "./diagnostics.js";

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

describe("Google definition extraction", () => {
  it("reads only Google dictionary definition nodes", () => {
    const documentObject = {
      querySelectorAll: (selector) => selector === '[data-dobid="dfn"]'
        ? [{ textContent: "Lasting for a very short time." }]
        : []
    };
    expect(extractDefinitionFromGoogleDOM(documentObject, "ephemeral", "ephemeral meaning"))
      .toBe("Lasting for a very short time.");
  });

  it("returns empty when dictionary elements are unavailable or contain only the query", () => {
    expect(extractDefinitionFromGoogleDOM({ querySelectorAll: () => [] }, "ephemeral")).toBe("");
    const queryNode = { querySelectorAll: () => [{ textContent: "ephemeral meaning" }] };
    expect(extractDefinitionFromGoogleDOM(queryNode, "ephemeral", "ephemeral meaning")).toBe("");
  });

  it("reports matched selector and bounded preview when dictionary text is rejected", () => {
    const documentObject = {
      querySelectorAll: (selector) => selector === '[data-dobid="dfn"]'
        ? [{ textContent: "ephemeral meaning" }]
        : []
    };
    expect(inspectDefinitionFromGoogleDOM(documentObject, "ephemeral", "ephemeral meaning"))
      .toMatchObject({
        definition: "",
        selector: '[data-dobid="dfn"]',
        candidatePreview: "ephemeral meaning",
        reason: "candidate-rejected"
      });
  });

  it("captures a word-linked definition from an AI Overview fallback", () => {
    const overview = {
      textContent: "AI Overview Ephemeral means lasting for a very short time.",
      innerText: "AI Overview Ephemeral means lasting for a very short time."
    };
    const documentObject = {
      querySelectorAll: (selector) => {
        if (selector === '[data-attrid="AIOverview"]') return [overview];
        return [];
      }
    };
    expect(extractDefinitionFromGoogleDOM(documentObject, "ephemeral", "ephemeral meaning"))
      .toBe("lasting for a very short time.");
  });

  it("captures the reported LoRA AI Overview sentence", () => {
    const overview = {
      textContent: "LoRA most commonly refers to Low-Rank Adaptation in artificial intelligence or Long Range wireless technology in the Internet of Things (IoT).",
      innerText: "LoRA most commonly refers to Low-Rank Adaptation in artificial intelligence or Long Range wireless technology in the Internet of Things (IoT)."
    };
    const documentObject = {
      querySelectorAll: (selector) => selector === '[data-attrid="AIOverview"]' ? [overview] : []
    };
    expect(extractDefinitionFromGoogleDOM(documentObject, "lora", "lora meaning"))
      .toBe("Low-Rank Adaptation in artificial intelligence or Long Range wireless technology in the Internet of Things (IoT).");
  });

  it("finds a definition below an AI Overview heading when data attributes are absent", () => {
    const overview = {
      innerText: "AI Overview Ubiquitous means present or found everywhere.",
      textContent: "AI Overview Ubiquitous means present or found everywhere.",
      parentElement: null
    };
    const heading = { textContent: "AI Overview", parentElement: overview };
    const documentObject = {
      querySelectorAll: (selector) => selector === "h1, h2, h3, h4, [role='heading']"
        ? [heading]
        : []
    };
    expect(extractDefinitionFromGoogleDOM(documentObject, "ubiquitous", "what does ubiquitous mean"))
      .toBe("present or found everywhere.");
  });

  it("rejects unrelated AI Overview text and generic result snippets", () => {
    const nodes = [
      { textContent: "Ephemeral is featured in a film released in 2022." },
      { textContent: "Search ephemeral meaning on LexiTrack." }
    ];
    const documentObject = { querySelectorAll: (selector) => selector === "#main p" ? nodes : [] };
    expect(extractDefinitionFromGoogleDOM(documentObject, "ephemeral", "ephemeral meaning")).toBe("");
  });
});

describe("automatic Google search processing", () => {
  const definition = "Lasting for a very short time.";

  it("saves an explicit vocabulary lookup only after a definition and storage write", async () => {
    let stored = [];
    const storage = {
      get: async () => ({ "lexitrack.extension.words.v1": stored }),
      set: async (value) => { stored = value["lexitrack.extension.words.v1"]; }
    };
    const processSearch = createGoogleSearchProcessor({ storage });
    const result = await processSearch("ephemeral meaning", definition);
    expect(result.status).toBe("saved");
    expect(stored[0]).toMatchObject({
      word: "ephemeral",
      definition,
      query: "ephemeral meaning",
      source: "google-search"
    });
  });

  it("emits local classification and final-save diagnostics for vocabulary lookups", async () => {
    let stored = [];
    const events = [];
    const storage = {
      get: async () => ({ "lexitrack.extension.words.v1": stored }),
      set: async (value) => { stored = value["lexitrack.extension.words.v1"]; }
    };
    const processSearch = createGoogleSearchProcessor({
      storage,
      diagnostic: (event, details) => events.push({ event, details })
    });
    await processSearch("lora meaning", "Low-Rank Adaptation in artificial intelligence.");
    expect(events.map((entry) => entry.event)).toEqual(["classification", "saved"]);
    expect(events[0].details).toMatchObject({ query: "lora meaning", targetWord: "lora" });
    expect(events[1].details.reason).toBe("storage-write-succeeded");
  });

  it("ignores unrelated searches without invoking the model", async () => {
    const classifier = vi.fn();
    const processSearch = createGoogleSearchProcessor({
      storage: { get: vi.fn(), set: vi.fn() },
      classifier
    });
    expect(await processSearch("how does a transistor work", definition)).toEqual({ status: "ignored" });
    expect(classifier).not.toHaveBeenCalled();
  });

  it.each([
    "who is the richest actor in Cobra Kai",
    "interpretation of the entire Ramayana"
  ])("does not save unrelated search %s", async (query) => {
    const classifier = vi.fn();
    const storage = { get: vi.fn(), set: vi.fn() };
    const processSearch = createGoogleSearchProcessor({ storage, classifier });
    expect(await processSearch(query, "A captured dictionary definition."))
      .toEqual({ status: "ignored" });
    expect(classifier).not.toHaveBeenCalled();
    expect(storage.set).not.toHaveBeenCalled();
  });

  it("does not save or report success if no trustworthy definition exists", async () => {
    const storage = { get: vi.fn(async () => ({ })), set: vi.fn() };
    const processSearch = createGoogleSearchProcessor({ storage });
    expect(await processSearch("what does ubiquitous mean", "")).toMatchObject({
      status: "definition-unavailable",
      word: "ubiquitous"
    });
    expect(storage.set).not.toHaveBeenCalled();
  });

  it("deduplicates case-insensitively and preserves existing metadata", async () => {
    const original = { id: "existing", word: "Ephemeral", definition, note: "keep" };
    const storage = {
      get: async () => ({ "lexitrack.extension.words.v1": [original] }),
      set: vi.fn()
    };
    const processSearch = createGoogleSearchProcessor({ storage });
    expect(await processSearch("ephemeral meaning", definition)).toEqual({ status: "duplicate", entry: original });
    expect(storage.set).not.toHaveBeenCalled();
  });

  it("reports storage failures without claiming a save", async () => {
    const processSearch = createGoogleSearchProcessor({
      storage: {
        get: async () => ({ "lexitrack.extension.words.v1": [] }),
        set: async () => { throw new Error("quota"); }
      }
    });
    expect(await processSearch("ephemeral meaning", definition)).toEqual({
      status: "error",
      code: "storage-failed"
    });
  });

  it("reports storage read failures without claiming a save", async () => {
    const processSearch = createGoogleSearchProcessor({
      storage: { get: async () => { throw new Error("storage unavailable"); }, set: vi.fn() }
    });
    expect(await processSearch("ephemeral meaning", definition)).toEqual({
      status: "error",
      code: "storage-failed"
    });
  });

  it("coalesces repeated concurrent navigation events for the same search", async () => {
    let stored = [];
    let writes = 0;
    const storage = {
      get: async () => ({ "lexitrack.extension.words.v1": stored }),
      set: async (value) => { writes += 1; stored = value["lexitrack.extension.words.v1"]; }
    };
    const processSearch = createGoogleSearchProcessor({ storage });
    const results = await Promise.all([
      processSearch("ephemeral meaning", definition),
      processSearch("ephemeral meaning", definition)
    ]);
    expect(results[0].status).toBe("saved");
    expect(results[1].status).toBe("saved");
    expect(writes).toBe(1);
    expect(stored).toHaveLength(1);
  });
});

describe("Google SPA navigation deduplication", () => {
  it("supports both Google domains and suppresses repeated query events", () => {
    const first = getGoogleSearch({ hostname: "www.google.com", pathname: "/search", search: "?q=ephemeral+meaning" });
    const same = getGoogleSearch({ hostname: "google.co.in", pathname: "/search", search: "?q=Ephemeral%20meaning" });
    const deduper = createSearchDeduper();
    expect(first.key).toBe(same.key);
    expect(deduper.claim(first.key)).toBe(true);
    expect(deduper.claim(same.key)).toBe(false);
    expect(getGoogleSearch({ hostname: "google.com", pathname: "/", search: "?q=ephemeral+meaning" })).toBe(null);
  });

  it("extracts quoted vocabulary and plain definition-of searches", async () => {
    const { extractTargetWord } = await import("../src/lib/queryParsing.js");
    expect(extractTargetWord("meaning of ‘serendipity’")).toBe("serendipity");
    expect(extractTargetWord("definition of pragmatic")).toBe("pragmatic");
  });
});

describe("temporary diagnostics privacy scope", () => {
  it("logs only vocabulary-cued searches or a parsed target", () => {
    expect(isVocabularyDiagnosticCandidate("ephemeral meaning")).toBe(true);
    expect(isVocabularyDiagnosticCandidate("how does a transistor work")).toBe(false);
    expect(isVocabularyDiagnosticCandidate("ordinary query", "ephemeral")).toBe(true);
  });
});

describe("confirmation popup actions", () => {
  it("dismisses on OK", () => {
    const dismiss = vi.fn();
    const actions = createConfirmationActions({ dismiss });
    actions.onOk();
    expect(dismiss).toHaveBeenCalledOnce();
  });

  it("opens the configured HTTPS app then dismisses", async () => {
    const openTab = vi.fn(async () => {});
    const dismiss = vi.fn();
    const actions = createConfirmationActions({
      appUrl: "https://lexitrack.example/",
      openTab,
      dismiss
    });
    await expect(actions.onGoToApp()).resolves.toBe(true);
    expect(openTab).toHaveBeenCalledWith("https://lexitrack.example/");
    expect(dismiss).toHaveBeenCalledOnce();
  });

  it("does not invent or open an unconfigured app URL", async () => {
    const openTab = vi.fn();
    const onConfigurationRequired = vi.fn();
    const actions = createConfirmationActions({ openTab, dismiss: vi.fn(), onConfigurationRequired });
    await expect(actions.onGoToApp()).resolves.toBe(false);
    expect(openTab).not.toHaveBeenCalled();
    expect(onConfigurationRequired).toHaveBeenCalledOnce();
  });
});