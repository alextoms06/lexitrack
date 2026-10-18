const TARGET_PATTERNS = [
  /^what\s+does\s+(?:the\s+)?(?:word|term)\s+(.+?)\s+refer\s+to$/iu,
  /^(?:can\s+you\s+)?explain\s+what\s+(.+?)\s+means\??$/iu,
  /^(?:could\s+you\s+)?tell\s+me\s+what\s+(.+?)\s+means\??$/iu,
  /^what\s+is\s+meant\s+by\s+(?:(?:the\s+)?(?:word|term)\s+)?(.+)$/iu,
  /^what\s+does\s+(.+?)\s+stand\s+for$/iu,
  /^what\s+does\s+(?:(?:the\s+)?(?:word|term)\s+)?(.+?)\s+mean(?:\s+in\s+[\p{L}\p{M}\s-]+)?$/iu,
  /^what\s+is\s+(?:the\s+)?(?:meaning|definition)\s+of\s+(.+)$/iu,
  /^(?:the\s+)?(?:meaning|definition)\s+of\s+(.+)$/iu,
  /^define\s+(.+)$/iu,
  /^explain\s+(?:the\s+)?(?:word|term|expression)\s+(.+)$/iu,
  /^(.+?)\s+(?:meaning|definition)(?:\s+in\s+[\p{L}\p{M}\s-]+)?$/iu
];
const NON_TARGET_WORDS = new Set(["meaning", "definition", "define", "word", "term", "this", "that", "it"]);

function normalizeQuery(query) {
  return String(query || "").trim().replace(/\s+/g, " ").replace(/[.!?]+$/, "");
}

export function extractTargetWord(query) {
  const normalized = normalizeQuery(query);

  for (const pattern of TARGET_PATTERNS) {
    const match = normalized.match(pattern);
    if (!match) continue;

    const candidate = match[1]
      .trim()
      .replace(/\s+in\s+(?:English|Malayalam|Spanish|Hindi|French|German|Arabic|Japanese|Chinese|Tamil|Telugu)$/i, "")
      .replace(/^["'“”‘’]+|["'“”‘’]+$/g, "")
      .replace(/[.,;:!?]+$/, "")
      .trim();
    const tokens = candidate.split(/\s+/);
    if (
      tokens.length > 0 &&
      tokens.length <= 3 &&
      !tokens.some((token) => NON_TARGET_WORDS.has(token.toLocaleLowerCase())) &&
      tokens.every((token) => /^[\p{L}\p{M}]+(?:[-'’][\p{L}\p{M}]+)*$/u.test(token))
    ) {
      return candidate;
    }
  }

  return null;
}