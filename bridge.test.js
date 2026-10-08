const assert = require("node:assert/strict");
const { test } = require("node:test");
const { readFileSync } = require("node:fs");
const { webcrypto } = require("node:crypto");
const vm = require("node:vm");

function bridge(cookie = "") {
  let listener;
  const requests = [];
  const replies = [];
  const navigations = [];
  const config = { INNERTUBE_CONTEXT: { client: { hl: "pt" } }, SESSION_INDEX: 2, DELEGATED_SESSION_ID: "channel" };
  const window = {
    addEventListener(type, callback) { listener = callback; },
    postMessage(message) { replies.push(message); },
    ytcfg: { get: key => config[key] },
  };
  const context = vm.createContext({
    window, location: { origin: "https://music.youtube.com" }, URL, TextEncoder, structuredClone, AbortSignal,
    crypto: webcrypto, Date: { now: () => 1700000000000 },
    CustomEvent: class { constructor(type, options) { Object.assign(this, { type }, options); } },
    document: { cookie, querySelector: () => ({ dispatchEvent: event => navigations.push(event) }) },
    fetch: async (url, options) => {
      requests.push({ url, ...options });
      return { ok: true, json: async () => ({ contents: [] }) };
    },
  });
  vm.runInContext(readFileSync(require.resolve("./bridge.js"), "utf8"), context);
  const send = (data, overrides) => listener({ source: window, origin: "https://music.youtube.com", data, ...overrides });
  return { send, requests, replies, navigations, config, context };
}

test("Bridge rejects foreign messages and routes only allowed navigation and API requests", async () => {
  const { send, requests, replies, navigations } = bridge();
  const browse = { channel: "ytme-request", id: "request", endpoint: "browse", body: { browseId: "FEmusic_history" } };
  const navigate = { channel: "ytme-navigation", href: "/watch?v=song" };
  for (const message of [browse, navigate]) {
    await send(message, { source: {} });
    await send(message, { origin: "https://other.test" });
  }
  await send({ ...browse, endpoint: "delete" });
  await send({ ...browse, body: { browseId: "private" } });
  await send({ ...navigate, href: "https://other.test/watch?v=song" });
  await send({ ...navigate, href: "/watch?v=invalid!" });
  assert.equal(requests.length + replies.length + navigations.length, 0);
  for (const href of ["/watch?v=song", "/playlist?list=list", "/browse/UC123"]) await send({ ...navigate, href });
  assert.equal(navigations[0].detail.endpoint.watchEndpoint.videoId, "song");
  assert.equal(navigations[1].detail.endpoint.browseEndpoint.browseId, "VLlist");
  assert.equal(navigations[2].detail.endpoint.browseEndpoint.browseId, "UC123");
  await send(browse);
  assert.equal(requests[0].credentials, "same-origin");
  assert.equal(replies[0].id, "request");
  assert.equal(replies[0].channel, "ytme-response");
});

test("Bridge keeps cookie precedence, fallback and artist language without mutating the page context", async () => {
  for (const [cookies, chosen] of [["__Secure-3PAPISID=fallback; SAPISID=primary", "primary"], ["__Secure-3PAPISID=fallback", "fallback"], ["", null]]) {
    const { send, requests, config } = bridge(cookies);
    await send({ channel: "ytme-request", id: "artist", endpoint: "browse", body: { browseId: "UC123" } });
    const request = requests[0];
    assert.equal(JSON.parse(request.body).context.client.hl, "en");
    assert.equal(config.INNERTUBE_CONTEXT.client.hl, "pt");
    assert.equal(request.headers["X-Goog-AuthUser"], "2");
    if (chosen) {
      const hash = await webcrypto.subtle.digest("SHA-1", new TextEncoder().encode(`1700000000 ${chosen} https://music.youtube.com`));
      assert.equal(request.headers.Authorization, `SAPISIDHASH 1700000000_${Buffer.from(hash).toString("hex")}`);
      assert.equal(request.headers["X-Goog-PageId"], "channel");
    } else {
      assert.equal(request.headers.Authorization, undefined);
      assert.equal(request.headers["X-Goog-PageId"], undefined);
    }
  }
});

test("Bridge preserves loading, HTTP and network error replies", async () => {
  for (const code of ["musicLoading", "musicHttpError", "musicLoadError"]) {
    const { send, replies, config, context } = bridge();
    if (code === "musicLoading") delete config.INNERTUBE_CONTEXT;
    if (code === "musicHttpError") context.fetch = async () => ({ ok: false, status: 503 });
    if (code === "musicLoadError") context.fetch = async () => { throw new Error("Network failure"); };
    await send({ channel: "ytme-request", id: "search", endpoint: "search", body: { query: "Artist" } });
    assert.equal(replies[0].error, code);
    assert.equal(replies[0].substitutions, code === "musicHttpError" ? "503" : undefined);
  }
});
