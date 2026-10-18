// Temporary debugging switch. Set false before distributing a diagnostic-free build.
export const ENABLE_EXTENSION_DIAGNOSTICS = true;

const VOCABULARY_CUE = /\b(?:meaning|definition|define|word|term|vocabulary)\b/i;

export function isVocabularyDiagnosticCandidate(query, targetWord = null) {
  return Boolean(targetWord) || VOCABULARY_CUE.test(String(query || ""));
}

export function logVocabularyDiagnostic(event, details) {
  if (!ENABLE_EXTENSION_DIAGNOSTICS) return;
  console.debug("[LexiTrack diagnostic]", event, details);
}