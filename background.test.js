const assert = require("node:assert/strict");
const { test } = require("node:test");
const { readFileSync } = require("node:fs");
const vm = require("node:vm");
require("./core.js");

function background(storage = {}, clock = { now: 0 }) {
  const requests = [];
  const context = vm.createContext({
    importScripts() {}, YTMusicHome: globalThis.YTMusicHome, URL, URLSearchParams, AbortSignal,
    Date: { now: () => clock.now },
    setTimeout(callback, delay) { clock.now += delay; callback(); },
    chrome: {
      runtime: { onMessage: { addListener() {} } },
      storage: { session: {
        get: async keys => Object.fromEntries(keys.map(key => [key, storage[key]])),
        set: async value => Object.assign(storage, value),
      } },
    },
    fetch: async url => {
      const name = url.searchParams.get("search_query");
      const video = { videoRenderer: { videoId: "old-set", title: { simpleText: `${name} live set` }, lengthText: { simpleText: "1:00:00" }, publishedTimeText: { simpleText: "10 years ago" } } };
      const data = { contents: Array.from({ length: 30 }, (_, index) => ({ videoRenderer: { ...video.videoRenderer, videoId: index ? `set-${index}` : "old-set" } })) };
      requests.push({ url: new URL(url), time: clock.now });
      return { ok: true, text: async () => `<script>var ytInitialData = ${JSON.stringify(data)};</script>` };
    },
  });
  vm.runInContext(readFileSync(require.resolve("./background.js"), "utf8"), context);
  return { context, requests, storage, clock };
}

test("A complete first search needs one request and history and recent caches survive worker restarts", async () => {
  const { context, requests, storage, clock } = background();
  const history = await context.artistSets("Artist", false);
  assert.equal(history[0].id, "old-set");
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url.searchParams.has("sp"), false);
  await context.artistSets("Artist");
  assert.equal(requests.length, 2);
  assert.equal(requests[1].url.searchParams.get("sp"), "CAI%3D");
  await context.artistSets("Artist", false);
  await context.artistSets("Artist");
  assert.equal(requests.length, 2);
  const restarted = background(storage, clock);
  assert.equal((await restarted.context.artistSets("Artist"))[0].id, "old-set");
  await restarted.context.artistSets("Artist", false);
  assert.equal(restarted.requests.length, 0);
  clock.now += 30 * 60 * 1000;
  await restarted.context.artistSets("Artist");
  assert.equal(restarted.requests.length, 1);
});

test("Concurrent requests share results and searches for different artists are spaced apart", async () => {
  const { context, requests } = background();
  const results = await Promise.all([context.artistSets("Alpha"), context.artistSets("Alpha"), context.artistSets("Beta")]);
  assert.deepEqual(results[0], results[1]);
  assert.equal(requests.length, 2);
  assert.deepEqual(requests.map(request => request.url.searchParams.get("search_query")), ["Alpha", "Beta"]);
  assert(requests[1].time - requests[0].time >= 1000);
});

test("Blocked searches pause queued requests and retain the cooldown across worker restarts", async () => {
  for (const response of [{ ok: false, status: 403 }, { ok: false, status: 429 }, { ok: false, status: 0, type: "opaqueredirect" }]) {
    const { context, storage, clock } = background();
    let attempts = 0;
    context.fetch = async (url, options) => {
      attempts++;
      assert.equal(options.redirect, "manual");
      return response;
    };
    const results = await Promise.allSettled([context.artistSets("Alpha"), context.artistSets("Beta")]);
    assert(results.every(result => result.status === "rejected" && result.reason.message === "setsBlocked"));
    assert.equal(attempts, 1);
    const restarted = background(storage, clock);
    await assert.rejects(restarted.context.artistSets("Alpha"), /setsBlocked/);
    assert.equal(restarted.requests.length, 0);
    clock.now += 60 * 1000;
    assert.equal((await restarted.context.artistSets("Alpha"))[0].id, "old-set");
    assert.equal(restarted.requests.length, 1);
  }
});

test("Network failures are retryable and successful empty searches are cached", async () => {
  const { context, requests } = background();
  const fetch = context.fetch;
  context.fetch = async () => { throw new Error("Network failure"); };
  await assert.rejects(context.artistSets("Artist"), /Network failure/);
  context.fetch = fetch;
  assert.equal((await context.artistSets("Artist"))[0].id, "old-set");
  assert.equal(requests.length, 1);
  let emptyRequests = 0;
  context.fetch = async () => {
    emptyRequests++;
    return { ok: true, text: async () => '<script>var ytInitialData = {};</script>' };
  };
  assert.equal((await context.artistSets("Unknown")).length, 0);
  await context.artistSets("Unknown");
  assert.equal(emptyRequests, 6);
});

function searchResults(ids) {
  const contents = ids.map(id => ({ videoRenderer: {
    videoId: String(id), title: { simpleText: "Artist live set" },
    lengthText: { simpleText: "1:00:00" }, publishedTimeText: { simpleText: `${id} days ago` },
  } }));
  const data = { contents };
  return {
    ok: true,
    text: async () => `<script>var ytInitialData = ${JSON.stringify(data)};</script>`,
  };
}

test("Searches collect 30 unique sets across queries and stop as soon as the target is reached", async () => {
  const { context, clock } = background({ "sets:true:Artist": { time: 0, items: [{ id: "old-cache" }] } });
  const requests = [];
  context.fetch = async (url, options) => {
    requests.push({ url: String(url), options, time: clock.now });
    if (requests.length === 1) return searchResults(Array.from({ length: 20 }, (_, index) => index));
    return searchResults(Array.from({ length: 25 }, (_, index) => index + 10));
  };
  const items = await context.artistSets("Artist");
  assert.deepEqual(Array.from(items, item => item.id), Array.from({ length: 30 }, (_, index) => String(index)));
  assert.equal(requests.length, 2);
  assert.equal(new URL(requests[1].url).searchParams.get("search_query"), "Artist live");
  assert.equal(new URL(requests[1].url).searchParams.get("sp"), "CAI%3D");
  assert(requests[1].time - requests[0].time >= 1000);
  await context.artistSets("Artist");
  assert.equal(requests.length, 2);
});

test("Searches stop at the query limit when fewer than 30 sets exist", async () => {
  for (const ids of [[], [1, 2]]) {
    const { context } = background();
    let requests = 0;
    context.fetch = async () => { requests++; return searchResults(ids); };
    const items = await context.artistSets("Artist");
    assert.equal(requests, 6);
    assert.equal(items.length, ids.length);
  }
});

test("Later search failures preserve collected sets and rate limits stop other queued searches", async () => {
  for (const blocked of [false, true]) {
    const { context } = background();
    let requests = 0;
    context.fetch = async () => {
      if (++requests === 1) return searchResults([1, 2]);
      if (blocked) return { ok: false, status: 429 };
      throw new Error("Network failure");
    };
    const items = await context.artistSets("Artist");
    assert.deepEqual(Array.from(items, item => item.id), ["1", "2"]);
    assert.equal(requests, 2);
    if (blocked) {
      await assert.rejects(context.artistSets("Another artist"), /setsBlocked/);
      assert.equal(requests, 2);
    }
  }
});
