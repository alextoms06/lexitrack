import { normalizeWordKey } from "./wordStore.js";

const GOOGLE_HOSTS = new Set(["google.com", "www.google.com", "google.co.in", "www.google.co.in"]);

export function getGoogleSearch(locationLike) {
  if (!locationLike) return null;
  const host = String(locationLike.hostname || "").toLowerCase();
  if (!GOOGLE_HOSTS.has(host) || locationLike.pathname !== "/search") return null;

  const query = new URLSearchParams(locationLike.search || "").get("q")?.trim();
  const key = normalizeWordKey(query);
  return key ? { query, key } : null;
}

export function createSearchDeduper() {
  const seen = new Set();
  return {
    claim(key) {
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    },
    has(key) {
      return seen.has(key);
    }
  };
}