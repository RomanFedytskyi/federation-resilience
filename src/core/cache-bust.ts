/**
 * Cache-busting for dynamic imports.
 *
 * WHY THIS EXISTS (the bug it defeats): Chromium *stickily caches a failed
 * dynamic import* (whatwg/html#6768). Once `import("https://…/remoteEntry.js")`
 * rejects, every later import of the SAME url resolves to the cached failure —
 * so a naive retry can never succeed. Appending a unique query param produces a
 * *different* module-map key, forcing a real network fetch on retry.
 *
 * These functions are pure and deterministic given an injected token source, so
 * Property 4 (cache-bust idempotence) is directly testable.
 */
import type { CacheBustToken } from "../types.js";

export const DEFAULT_CACHE_BUST_PARAM = "__mf_bust";

let counter = 0;

/**
 * Mint a fresh, collision-resistant token. Monotonic counter + random suffix so
 * tokens are unique even within the same millisecond and across reloads.
 */
export function mintCacheBust(): CacheBustToken {
  counter = (counter + 1) % Number.MAX_SAFE_INTEGER;
  const rand = Math.random().toString(36).slice(2, 8);
  return `${Date.now().toString(36)}-${counter.toString(36)}-${rand}`;
}

/**
 * Append (or replace) the cache-bust query param on a URL.
 *
 * Idempotence guarantee (Property 4): applying the SAME token twice yields the
 * same URL — we never stack duplicate params. Applying a NEW token replaces the
 * old one. Works on absolute and relative URLs and preserves existing query and
 * hash. Falls back to manual string surgery if URL parsing fails.
 */
export function applyCacheBust(
  url: string,
  token: CacheBustToken,
  param: string = DEFAULT_CACHE_BUST_PARAM,
): string {
  try {
    // Use a base so relative URLs parse; strip it back off afterwards.
    const isAbsolute = /^[a-z][a-z0-9+.-]*:\/\//i.test(url);
    const base = isAbsolute ? undefined : "http://__cb_base__";
    const u = new URL(url, base);
    u.searchParams.set(param, token);
    const out = u.toString();
    return isAbsolute ? out : out.replace("http://__cb_base__", "");
  } catch {
    // Manual fallback: replace an existing param value or append.
    const sep = url.includes("?") ? "&" : "?";
    const re = new RegExp(`([?&])${escapeRegExp(param)}=[^&#]*`);
    if (re.test(url)) {
      return url.replace(re, `$1${param}=${encodeURIComponent(token)}`);
    }
    const [path, hash = ""] = splitHash(url);
    return `${path}${sep}${param}=${encodeURIComponent(token)}${hash ? "#" + hash : ""}`;
  }
}

function splitHash(url: string): [string, string] {
  const i = url.indexOf("#");
  return i === -1 ? [url, ""] : [url.slice(0, i), url.slice(i + 1)];
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
