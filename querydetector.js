
import { extractTargetWord } from "./src/lib/queryParsing.js";
import { MIN_CLASSIFIER_MARGIN, MIN_MEANING_SIMILARITY } from "./src/lib/meaningThresholds.js";

export { extractTargetWord } from "./src/lib/queryParsing.js";
export { MIN_CLASSIFIER_MARGIN, MIN_MEANING_SIMILARITY };

const EXPLICIT_QUERY = /^(?:(?:the\s+)?meaning\s+of\s+.+|.+\s+(?:meaning|definition)(?:\s+in\s+[\p{L}\p{M}\s-]+)?|define\s+.+|(?:the\s+)?definition\s+of\s+.+|what\s+does\s+.+?\s+mean(?:\s+in\s+[\p{L}\p{M}\s-]+)?|what\s+does\s+(?:the\s+)?(?:word|term)\s+.+\s+refer\s+to|what\s+does\s+.+\s+stand\s+for|what\s+is\s+(?:the\s+)?(?:meaning|definition)\s+of\s+.+|what\s+is\s+meant\s+by\s+.+|(?:can\s+you\s+)?explain\s+what\s+.+\s+means|(?:could\s+you\s+)?tell\s+me\s+what\s+.+\s+means|explain\s+(?:the\s+)?(?:word|term|expression)\s+.+)$/iu;
const CLASSIFIER_CUE = /\b(?:meaning|definition|define|word|term|vocabulary)\b/i;

function normalizeQuery(query) {
  return String(query || "").trim().replace(/\s+/g, " ").replace(/[.!?]+$/, "");
}

export function detectMeaningQuery(query) {
  const normalized = normalizeQuery(query);
  if (!EXPLICIT_QUERY.test(normalized)) {
    return { isMeaningQuery: false, word: null, method: "rules" };
  }

  const word = extractTargetWord(normalized);
  return {
    isMeaningQuery: true,
    word,
    method: "rules",
    needsConfirmation: !word
  };
}

export async function detectMeaningQueryHybrid(query, {
  classifier,
  minimumMargin = MIN_CLASSIFIER_MARGIN,
  minimumMeaningSimilarity = MIN_MEANING_SIMILARITY
} = {}) {
  const ruleResult = detectMeaningQuery(query);
  if (ruleResult.isMeaningQuery) return ruleResult;
  if (!CLASSIFIER_CUE.test(normalizeQuery(query))) {
    return { isMeaningQuery: false, word: null, method: "rules" };
  }

  try {
    if (!classifier) throw new Error("No query classifier was provided.");
    const runClassifier = classifier;
    const scores = await runClassifier(query);
    const margin = scores.meaningScore - scores.otherScore;
    if (
      !scores.isMeaningQuery ||
      !Number.isFinite(scores.meaningScore) ||
      scores.meaningScore < minimumMeaningSimilarity ||
      !Number.isFinite(margin) ||
      margin < minimumMargin
    ) {
      return { ...scores, isMeaningQuery: false, word: null, method: "model" };
    }

    const word = extractTargetWord(query);
    return {
      ...scores,
      isMeaningQuery: true,
      word,
      method: "model",
      needsConfirmation: !word
    };
  } catch (error) {
    return {
      isMeaningQuery: false,
      word: null,
      method: "model",
      reason: "classifier-unavailable",
      error: error instanceof Error ? error.message : String(error)
    };
  }
}
