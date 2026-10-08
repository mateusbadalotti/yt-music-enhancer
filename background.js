importScripts("core.js");

const pending = new Map();
const CACHE_MS = 30 * 60 * 1000;
const SEARCH_INTERVAL_MS = 1000;
const BLOCKED_MS = 60 * 1000;
const SET_LIMIT = 30;
const SEARCH_SUFFIXES = ["", " live", " set", " mix", " b2b", " dj set"];
const BLOCKED_KEY = "setsBlockedUntil";
const NEXT_SEARCH_KEY = "setsNextSearchAt";
let searchQueue = Promise.resolve();

async function requestSearch(url) {
  const stored = await chrome.storage.session.get([BLOCKED_KEY, NEXT_SEARCH_KEY]);
  if (stored[BLOCKED_KEY] > Date.now()) throw new Error("setsBlocked");
  const delay = (stored[NEXT_SEARCH_KEY] ?? 0) - Date.now();
  if (delay > 0) await new Promise(resolve => setTimeout(resolve, delay));
  await chrome.storage.session.set({ [NEXT_SEARCH_KEY]: Date.now() + SEARCH_INTERVAL_MS });
  const response = await fetch(url, { credentials: "omit", redirect: "manual", signal: AbortSignal.timeout(20000) });
  if (response.status === 403 || response.status === 429 || response.type === "opaqueredirect") {
    await chrome.storage.session.set({ [BLOCKED_KEY]: Date.now() + BLOCKED_MS });
    throw new Error("setsBlocked");
  }
  if (!response.ok) throw new Error("setsError");
  return response;
}

function artistSets(name, recent = true) {
  const key = `sets:${SET_LIMIT}:${recent}:${name}`;
  if (pending.has(key)) return pending.get(key);
  const request = searchQueue.then(async () => {
    const stored = await chrome.storage.session.get([key]);
    const cached = stored[key];
    if (cached && Date.now() - cached.time < CACHE_MS) return cached.items;
    let items = [];
    for (const suffix of SEARCH_SUFFIXES) {
      try {
        const url = new URL("https://www.youtube.com/results");
        url.search = new URLSearchParams({ search_query: name + suffix, hl: "en" });
        if (recent) url.searchParams.set("sp", "CAI%3D");
        const response = await requestSearch(url);
        const html = await response.text();
        const match = html.match(/(?:var\s+)?ytInitialData\s*=\s*(\{[^<]*?\});\s*<\/script>/);
        if (!match) throw new Error("setsError");
        const data = JSON.parse(match[1]);
        items = YTMusicHome.unique([...items, ...YTMusicHome.sets(data, name)]);
        if (items.length >= SET_LIMIT) break;
      } catch (error) {
        if (!items.length) throw error;
        break;
      }
    }
    items = items.sort((a, b) => a.age - b.age).slice(0, SET_LIMIT);
    await chrome.storage.session.set({ [key]: { time: Date.now(), items } });
    return items;
  }).finally(() => pending.delete(key));
  pending.set(key, request);
  searchQueue = request.catch(() => {});
  return request;
}

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id || !sender.url?.startsWith("https://music.youtube.com/") || message?.type !== "artist-sets" || typeof message.name !== "string" || !message.name.trim() || message.name.length > 200) return;
  artistSets(message.name, message.recent !== false).then(items => respond({ items }), error => respond({ error: error.message === "setsBlocked" ? "setsBlocked" : "setsError" }));
  return true;
});
