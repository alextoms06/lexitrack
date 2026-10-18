const DEFINITION_SELECTORS = [
  '[data-attrid="wa:/description"]',
  '[data-attrid^="wa:/description"]',
  '[data-attrid*="dictionary"] [data-attrid]'
];

export function extractDefinitionFromGoogleDOM(documentObject, word) {
  if (!documentObject || !word) return "";
  if (!word.trim()) return "";

  for (const selector of DEFINITION_SELECTORS) {
    for (const node of documentObject.querySelectorAll(selector)) {
      const text = node.textContent?.replace(/\s+/g, " ").trim() || "";
      if (
        text.length >= 12 &&
        text.length <= 600
      ) {
        return text;
      }
    }
  }

  return "";
}