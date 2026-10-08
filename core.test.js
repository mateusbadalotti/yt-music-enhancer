const assert = require("node:assert/strict");
const { test } = require("node:test");
require("./core.js");
const core = globalThis.YTMusicHome;

test("History artists are preserved on two-row songs", () => {
  const [song] = core.items({ musicTwoRowItemRenderer: {
    title: { simpleText: "Heard before" }, navigationEndpoint: { watchEndpoint: { videoId: "song" } },
    subtitle: { runs: [{ text: "Artist", navigationEndpoint: { browseEndpoint: { browseId: "UC123" } } }] },
  } });
  assert.deepEqual(song.artists, [{ id: "UC123", name: "Artist" }]);
});

test("Random mixes preserve old and new songs and sets without changing the source", context => {
  context.mock.method(Math, "random", () => 0);
  const items = [{ id: "old", age: 315360000 }, { id: "new", age: 60 }, { id: "set", duration: 3600 }];
  assert.deepEqual(core.shuffled(items).map(item => item.id), ["new", "set", "old"]);
  assert.deepEqual(items.map(item => item.id), ["old", "new", "set"]);
  assert.deepEqual(core.shuffled([]), []);
});

test("Sections keep their order and new native sections stay hidden after customization", () => {
  const settings = core.normalize();
  assert.equal(core.discover(settings, ["Quick picks"]), true);
  settings.order = ["Quick picks", core.CUSTOM[0]];
  assert.equal(core.discover(settings, ["Quick picks", "New today"]), true);
  assert.deepEqual(settings.hidden, ["New today"]);
  assert.equal(core.discover(settings, ["New today"]), false);
  assert.deepEqual(core.ordered(settings, ["Quick picks", "New today"]).slice(0, 2), settings.order);
  assert.deepEqual(core.ordered(core.normalize(), ["Quick picks"]), [...core.CUSTOM, "Quick picks"]);
});

test("The first home is remembered without manual changes and later sections start disabled", () => {
  const settings = core.normalize();
  assert.equal(core.discover(settings, []), false);
  assert.equal(core.discover(settings, [...core.CUSTOM, "Quick picks", "Favorites"]), true);
  assert.deepEqual(settings.known, ["Quick picks", "Favorites"]);
  assert.deepEqual(settings.hidden, []);

  const reloaded = core.normalize(JSON.parse(JSON.stringify(settings)));
  assert.equal(core.discover(reloaded, ["Favorites", "New today", "New today"]), true);
  assert.deepEqual(reloaded.hidden, ["New today"]);
  reloaded.hidden = [];
  const enabled = core.normalize(JSON.parse(JSON.stringify(reloaded)));
  assert.equal(core.discover(enabled, ["Quick picks", "New today"]), false);
  assert.deepEqual(enabled.hidden, []);
});

test("Active sections stay remembered when YouTube rotates more than 200 titles", () => {
  const settings = core.normalize();
  core.discover(settings, ["Keep visible"]);
  core.discover(settings, Array.from({ length: 201 }, (_, index) => `Section ${index}`));
  const reloaded = core.normalize(JSON.parse(JSON.stringify(settings)));
  assert.equal(reloaded.known.includes("Keep visible"), true);
  assert.equal(core.discover(reloaded, ["Keep visible"]), false);
  assert.equal(reloaded.hidden.includes("Keep visible"), false);
});

test("Music rows preserve navigation, artist identity and long durations", () => {
  const data = { musicResponsiveListItemRenderer: {
    playlistItemData: { videoId: "set123" },
    flexColumns: [
      { musicResponsiveListItemFlexColumnRenderer: { text: { runs: [{ text: "Live set" }] } } },
      { musicResponsiveListItemFlexColumnRenderer: { text: { runs: [{ text: "Artist", navigationEndpoint: { browseEndpoint: { browseId: "UC123" } } }] } } },
    ],
    fixedColumns: [{ musicResponsiveListItemFixedColumnRenderer: { text: { simpleText: "1:30:00" } } }],
  } };
  const [item] = core.items(data);
  assert.equal(item.duration, 5400);
  assert.equal(item.href, "/watch?v=set123");
  assert.deepEqual(item.artists, [{ id: "UC123", name: "Artist" }]);
});

test("Sets require the selected artist in the title and at least 30 minutes", () => {
  const video = (id, title, length) => ({ videoRenderer: { videoId: id, title: { simpleText: title }, lengthText: { simpleText: length }, publishedTimeText: { simpleText: "2 days ago" } } });
  const data = [video("long", "Anyma live", "30:00"), video("short", "Anyma", "29:59"), video("other", "Another artist", "1:00:00")];
  const sets = core.sets(data, "Anyma");
  assert.deepEqual(sets.map(item => item.id), ["long"]);
  assert.equal(sets[0].age, 172800);
  data[0].videoRenderer.publishedTimeText.simpleText = "2d ago";
  assert.equal(core.sets(data, "Anyma")[0].age, 172800);
  assert.equal(core.duration("LIVE"), 0);
});

test("Stored preferences reject malformed values and deduplicate artists", () => {
  assert.deepEqual(core.normalize(null), core.normalize());
  const settings = core.normalize({ order: ["A", "A", null], known: "bad", artists: [{ id: "UC1", name: "One" }, { id: "UC1", name: "One" }, { id: "javascript:bad", name: "Bad" }] });
  assert.deepEqual(settings.order, ["A"]);
  assert.deepEqual(settings.known, []);
  assert.equal(settings.artists.length, 1);
});

test("Settings backups restore every preference without exporting unrelated data", () => {
  const settings = core.normalize({ hidePlayerPanel: true, order: [core.CUSTOM[4], "Favorites"], hidden: ["New today"], known: ["Favorites", "New today"], artists: [{ id: "UC123", name: "Artist", image: "https://yt3.googleusercontent.com/artist" }] });
  const backup = core.exportSettings({ ...settings, history: ["private playback"], cookies: "not settings" });
  assert.deepEqual(core.importSettings(backup), settings);
  assert.equal(backup.includes("private playback"), false);
  assert.equal(backup.includes("cookies"), false);
  const restored = core.importSettings(backup);
  core.discover(restored, ["Favorites", "A new shelf"]);
  assert.deepEqual(restored.hidden, ["New today", "A new shelf"]);
});

test("Invalid settings files are rejected instead of silently resetting preferences", () => {
  const valid = JSON.parse(core.exportSettings(core.normalize()));
  for (const source of ["broken", "null", "[]", "{}", JSON.stringify({ ...valid, format: "another-extension" }), JSON.stringify({ ...valid, version: 2 })]) {
    assert.throws(() => core.importSettings(source));
  }
  for (const patch of [{ hidePlayerPanel: "true" }, { known: null }, { hidden: [null] }, { order: Array(61).fill("A") }, { artists: null }, { artists: [null] }, { artists: [{ id: "bad", name: "Artist", image: "" }] }, { artists: [{ id: "UC123", name: "", image: "" }] }, { artists: [{ id: "UC123", name: "Artist" }] }]) {
    assert.throws(() => core.importSettings(JSON.stringify({ ...valid, settings: { ...valid.settings, ...patch } })));
  }
  for (const key of Object.keys(valid.settings).filter(key => key !== "hideHomeFilters")) {
    const settings = { ...valid.settings };
    delete settings[key];
    assert.throws(() => core.importSettings(JSON.stringify({ ...valid, settings })));
  }
});

test("The player panel is hidden by default and preserves an explicit visible preference", () => {
  assert.equal(core.normalize().hidePlayerPanel, true);
  assert.equal(core.normalize({ hidePlayerPanel: false }).hidePlayerPanel, false);
  assert.equal(core.normalize({ hidePlayerPanel: true }).hidePlayerPanel, true);
  const visible = core.normalize({ hidePlayerPanel: false });
  assert.equal(core.importSettings(core.exportSettings(visible)).hidePlayerPanel, false);
});

test("Home filters are hidden by default and an explicit visible preference survives backups", () => {
  assert.equal(core.normalize().hideHomeFilters, true);
  const visible = core.normalize({ hideHomeFilters: false });
  assert.equal(visible.hideHomeFilters, false);
  assert.equal(core.importSettings(core.exportSettings(visible)).hideHomeFilters, false);
  const backup = JSON.parse(core.exportSettings(visible));
  delete backup.settings.hideHomeFilters;
  assert.equal(core.importSettings(JSON.stringify(backup)).hideHomeFilters, true);
  backup.settings.hideHomeFilters = "false";
  assert.throws(() => core.importSettings(JSON.stringify(backup)));
});

test("Album artwork uses the two-row thumbnail renderer", () => {
  const [album] = core.items({ musicTwoRowItemRenderer: {
    title: { simpleText: "Album" }, navigationEndpoint: { browseEndpoint: { browseId: "MPRE123" } },
    thumbnailRenderer: { musicThumbnailRenderer: { thumbnail: { thumbnails: [{ url: "https://lh3.googleusercontent.com/cover" }] } } },
  } });
  assert.equal(album.image, "https://lh3.googleusercontent.com/cover");
  assert.equal(album.href, "/browse/MPRE123");
});

test("Playlist artwork falls back past empty thumbnail fields and supports collage wrappers", () => {
  const cover = "https://www.gstatic.com/youtube/media/ytm/images/pbg/offline-songs-@576.png";
  const [playlist] = core.items({ musicTwoRowItemRenderer: {
    title: { simpleText: "Playlist" }, navigationEndpoint: { browseEndpoint: { browseId: "VL123" } },
    thumbnail: {},
    thumbnailRenderer: { musicThumbnailRenderer: { thumbnail: { thumbnails: [{ url: cover, width: 576 }] } } },
  } });
  assert.equal(playlist.image, cover);
  const [collage] = core.items({ musicTwoRowItemRenderer: {
    title: { simpleText: "Collage" }, navigationEndpoint: { browseEndpoint: { browseId: "VL456" } },
    thumbnailRenderer: { musicThumbnailRenderer: { thumbnail: { collage: { thumbnails: [{ url: cover }] } } } },
  } });
  assert.equal(collage.image, cover);
});

test("Artwork accepts YouTube static images and CDNs, but rejects unrelated URLs", () => {
  for (const url of ["https://www.gstatic.com/youtube/media/ytm/images/pbg/offline-songs-@576.png", "https://yt3.googleusercontent.com/cover", "https://i.ytimg.com/cover", "https://yt3.ggpht.com/cover", "https://music.youtube.com/img/cover.png"]) {
    assert.equal(core.imageUrl(url), url);
  }
  assert.equal(core.imageUrl("//www.gstatic.com/cover.png"), "https://www.gstatic.com/cover.png");
  for (const url of ["", null, "javascript:alert(1)", "http://www.gstatic.com/cover", "https://www.gstatic.com.evil.test/cover", "https://evil.test/cover"]) {
    assert.equal(core.imageUrl(url), "");
  }
});

test("Short artist names do not match inside unrelated words", () => {
  const data = { videoRenderer: { videoId: "one", title: { simpleText: "Party live" }, lengthText: { simpleText: "45:00" } } };
  assert.equal(core.sets(data, "Art").length, 0);
  assert.equal(core.sets(data, "").length, 0);
});
