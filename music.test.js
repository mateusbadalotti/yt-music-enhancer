const assert = require("node:assert/strict");
const { test } = require("node:test");
require("./core.js");
const core = globalThis.YTMusicHome;

const artist = { id: "UC1", name: "Artist One" };
const song = (id, performer = artist) => ({ musicResponsiveListItemRenderer: {
  playlistItemData: { videoId: id },
  flexColumns: [
    { musicResponsiveListItemFlexColumnRenderer: { text: { runs: [{ text: id }] } } },
    { musicResponsiveListItemFlexColumnRenderer: { text: { runs: [{ text: performer.name, navigationEndpoint: { browseEndpoint: { browseId: performer.id } } }] } } },
  ],
} });
const page = (ids, token, performer) => ({ contents: ids.map(id => song(id, performer)), ...(token ? { continuations: [{ nextContinuationData: { continuation: token } }] } : {}) });
const ids = (start, count) => Array.from({ length: count }, (_, index) => `song-${start + index}`);

test("Artist music loads shuffled batches of 30 and follows continuations without duplicates", async context => {
  context.mock.method(Math, "random", () => 0);
  const requests = [];
  const responses = [page(ids(0, 24), "next"), page(ids(20, 24), "last"), page(ids(44, 26))];
  const next = core.musicPager([artist], async body => { requests.push(body); return responses.shift(); });
  const first = await next();
  assert.equal(first.items.length, 30);
  assert.equal(first.hasMore, true);
  assert.equal(requests.length, 2);
  assert.equal(requests[0].continuation, undefined);
  assert.equal(requests[1].continuation, "next");
  assert.notDeepEqual(first.items.map(item => item.id), ids(0, 30));
  const second = await next();
  assert.equal(second.items.length, 30);
  assert.equal(requests[2].continuation, "last");
  const last = await next();
  assert.equal(last.items.length, 10);
  assert.equal(last.hasMore, false);
  assert.equal(new Set([...first.items, ...second.items, ...last.items].map(item => item.id)).size, 70);
  assert.deepEqual((await next()).items, []);
  assert.equal(requests.length, 3);
});

test("Artist music mixes selected artists and rejects unrelated search matches", async () => {
  const other = { id: "UC2", name: "Artist Two" };
  const requested = [];
  const next = core.musicPager([artist, other], async body => {
    requested.push(body.query);
    const performer = body.query === artist.name ? artist : other;
    return { contents: [song(performer.id, performer), song("unrelated", { id: "UC3", name: "Someone Else" })] };
  });
  const result = await next();
  assert.deepEqual(requested.sort(), [artist.name, other.name]);
  assert.deepEqual(result.items.map(item => item.id).sort(), [artist.id, other.id]);
  assert.equal(result.hasMore, false);
});

test("Artist music accepts the same artist name on a topic channel without matching partial names", async () => {
  const next = core.musicPager([artist], async () => ({ contents: [song("topic", { id: "UCTopic", name: "artist one" }), song("tribute", { id: "UCTribute", name: "Artist One Tribute" })] }));
  assert.deepEqual((await next()).items.map(item => item.id), ["topic"]);
});

test("Artist music preserves partial results and retries the failed continuation", async () => {
  let requests = 0;
  const next = core.musicPager([artist], async body => {
    requests++;
    if (requests === 1) return page(ids(0, 20), "next");
    assert.equal(body.continuation, "next");
    if (requests === 2) throw new Error("offline");
    return page(ids(20, 20));
  });
  const first = await next();
  assert.equal(first.items.length, 20);
  assert.equal(first.error.message, "offline");
  assert.equal(first.hasMore, true);
  const retry = await next();
  assert.equal(retry.items.length, 20);
  assert.equal(retry.error, undefined);
  assert.equal(retry.hasMore, false);
  assert.equal(new Set([...first.items, ...retry.items].map(item => item.id)).size, 40);
});

test("Artist music stops repeated continuation tokens and bounds empty-page requests", async () => {
  let requests = 0;
  const repeat = core.musicPager([artist], async () => { requests++; return page(["one"], "same"); });
  const result = await repeat();
  assert.equal(requests, 2);
  assert.equal(result.items.length, 1);
  assert.equal(result.hasMore, false);
  requests = 0;
  const empty = core.musicPager([artist], async () => { requests++; return page([], String(requests)); });
  const batch = await empty();
  assert.equal(requests, 6);
  assert.equal(batch.hasMore, true);
  assert.deepEqual(batch.items, []);
  assert.equal((await core.musicPager([], () => assert.fail())()).hasMore, false);
});
