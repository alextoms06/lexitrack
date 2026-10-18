// Set this to the deployed LexiTrack HTTPS URL before building the extension.
export const LEXITRACK_APP_URL = "";

export function isConfiguredAppUrl(value = LEXITRACK_APP_URL) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && Boolean(url.hostname);
  } catch {
    return false;
  }
}