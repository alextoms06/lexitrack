const DEFINITION_SELECTORS = [
  '[data-dobid="dfn"]',
  '.lr_dct_ent [data-dobid="dfn"]'
];
const AI_OVERVIEW_SELECTORS = [
  '[data-attrid="AIOverview"]',
  '[data-attrid*="AIOverview"]',
  '[data-async-type="ai_overview"]',
  '[data-async-type*="ai_overview"]',
  '[data-attrid*="definition"]',
  '[data-attrid*="dictionary"]'
];
const DEFINITION_CUES = /\b(?:means|mean|refers to|is defined as|defined as|denotes|describes|is a|is an)\b/i;

function containsTarget(text, word) {
  const escaped = String(word).trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return escaped && new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}($|[^\\p{L}\\p{N}])`, "iu").test(text);
}

function cleanDefinitionText(value, word) {
  let text = String(value || "")
    .replace(/\s+/g, " ")
    .replace(/^\s*AI\s+Overview\s*/i, "")
    .replace(/\s*\[\d+\]\s*/g, " ")
    .trim();
  const escapedWord = String(word).trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  text = text.replace(new RegExp(`^${escapedWord}\\s*(?::|[-–—])\\s*`, "iu"), "");
  text = text.replace(new RegExp(`^${escapedWord}\\s+(?:means|refers to|is defined as|is)\\s+`, "iu"), "");
  text = text.replace(new RegExp(`^(?:the\\s+)?(?:meaning|definition)\\s+of\\s+${escapedWord}\\s*(?::|is)?\\s*`, "iu"), "");
  return text.trim();
}

export function normalizeDefinitionText(value, word, query = "") {
  const definition = String(value || "").replace(/\s+/g, " ").trim();
  const normalizedWord = String(word || "").trim().toLocaleLowerCase();
  const normalizedQuery = String(query || "").trim().replace(/\s+/g, " ").toLocaleLowerCase();

  if (
    definition.length < 8 ||
    definition.length > 500 ||
    definition.toLocaleLowerCase() === normalizedWord ||
    (normalizedQuery && definition.toLocaleLowerCase() === normalizedQuery)
  ) {
    return "";
  }

  return definition;
}

export function extractDefinitionFromGoogleDOM(documentObject, word, query = "") {
  if (!documentObject || !String(word || "").trim()) return "";

  for (const selector of DEFINITION_SELECTORS) {
    for (const node of documentObject.querySelectorAll(selector)) {
      const definition = normalizeDefinitionText(node.textContent, word, query);
      if (definition) return definition;
    }
  }

  const candidates = [];
  for (const selector of AI_OVERVIEW_SELECTORS) {
    for (const node of documentObject.querySelectorAll(selector)) {
      candidates.push(node);
    }
  }

  for (const heading of documentObject.querySelectorAll("h1, h2, h3, h4, [role='heading']")) {
    if (!/^AI\s+Overview$/i.test(heading.textContent?.trim() || "")) continue;
    let container = heading.parentElement;
    for (let depth = 0; container && depth < 5; depth += 1, container = container.parentElement) {
      candidates.push(container);
    }
  }

  const seenTexts = new Set();
  for (const node of candidates) {
    const rawText = String(node.innerText || node.textContent || "").replace(/\s+/g, " ").trim();
    if (!rawText || seenTexts.has(rawText)) continue;
    seenTexts.add(rawText);
    if (
      rawText.length < 12 ||
      rawText.length > 900 ||
      !containsTarget(rawText, word) ||
      !DEFINITION_CUES.test(rawText)
    ) continue;

    const definition = normalizeDefinitionText(cleanDefinitionText(rawText, word), word, query);
    if (definition && definition.length <= 600) return definition;
  }

  return "";
}