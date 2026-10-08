(() => {
  const CUSTOM = ["Your playlists", "Sets from your artists", "New from your artists", "Your long listens", "Artists you have listened to", "Music from your artists"];
  const MIN_SET_SECONDS = 1800;
  const MAX_BACKUP_BYTES = 1024 * 1024;
  const MAX_ORDERED_SECTIONS = 60;
  const MUSIC_PAGE_SIZE = 30;
  const MUSIC_SEARCH_LIMIT = 6;
  const text = value => value?.simpleText ?? value?.runs?.map(run => run.text).join("") ?? "";

  function collect(value, key) {
    if (!value || typeof value !== "object") return [];
    return Object.entries(value).flatMap(([name, child]) => name === key ? [child] : collect(child, key));
  }

  function unique(items) {
    return [...new Map(items.map(item => [item.id, item])).values()];
  }

  function shuffled(items) {
    const result = [...items];
    for (let index = result.length - 1; index > 0; index--) {
      const other = Math.floor(Math.random() * (index + 1));
      [result[index], result[other]] = [result[other], result[index]];
    }
    return result;
  }

  function duration(value) {
    return /^\d+(?::\d{2}){1,2}$/.test(value) ? value.split(":").reduce((total, part) => total * 60 + Number(part), 0) : 0;
  }

  function imageUrl(value) {
    if (typeof value !== "string" || !value) return "";
    try {
      const url = new URL(value, "https://music.youtube.com");
      const allowed = /(^|\.)(googleusercontent\.com|ytimg\.com|ggpht\.com|gstatic\.com)$/.test(url.hostname) || url.hostname === "music.youtube.com";
      return url.protocol === "https:" && allowed ? url.href : "";
    } catch {
      return "";
    }
  }

  function item(renderer) {
    const columns = renderer.flexColumns?.map(column => column.musicResponsiveListItemFlexColumnRenderer?.text) ?? [];
    const title = renderer.title ?? columns[0];
    const endpoint = renderer.navigationEndpoint ?? title?.runs?.find(run => run.navigationEndpoint)?.navigationEndpoint;
    const videoId = renderer.playlistItemData?.videoId ?? endpoint?.watchEndpoint?.videoId;
    const browseId = endpoint?.browseEndpoint?.browseId;
    const id = videoId ?? browseId;
    if (!id || !text(title)) return null;
    const runs = [...(renderer.subtitle?.runs ?? []), ...columns.slice(1).flatMap(column => column?.runs ?? [])];
    const artists = runs.filter(run => run.navigationEndpoint?.browseEndpoint?.browseId?.startsWith("UC"))
      .map(run => ({ id: run.navigationEndpoint.browseEndpoint.browseId, name: run.text }));
    const time = renderer.fixedColumns?.map(column => text(column.musicResponsiveListItemFixedColumnRenderer?.text)).find(value => duration(value))
      ?? runs.map(run => run.text).find(value => duration(value)) ?? "";
    const thumbnails = [renderer.thumbnailRenderer, renderer.thumbnail].flatMap(value => collect(value, "thumbnails")).find(list => Array.isArray(list) && list.length) ?? [];
    let href;
    if (videoId) href = `/watch?v=${encodeURIComponent(videoId)}`;
    else if (browseId.startsWith("VL")) href = `/playlist?list=${encodeURIComponent(browseId.slice(2))}`;
    else href = `/browse/${encodeURIComponent(browseId)}`;
    return {
      id, title: text(title), subtitle: text(renderer.subtitle) || columns.slice(1).map(text).filter(Boolean).join(" · "),
      artists, duration: duration(time), image: thumbnails.at(-1)?.url ?? "",
      href,
    };
  }

  function items(data) {
    return unique(["musicTwoRowItemRenderer", "musicResponsiveListItemRenderer"].flatMap(key => collect(data, key).map(item).filter(Boolean)));
  }

  function shelves(data) {
    return ["musicCarouselShelfRenderer", "musicShelfRenderer", "musicImmersiveCarouselShelfRenderer"].flatMap(key => collect(data, key).map(shelf => ({
      title: text(shelf.header?.musicCarouselShelfBasicHeaderRenderer?.title ?? shelf.header?.musicImmersiveCarouselShelfBasicHeaderRenderer?.title ?? shelf.title),
      items: items(shelf.contents),
    }))).filter(shelf => shelf.title);
  }

  function continuation(data) {
    return collect(data, "nextContinuationData")[0]?.continuation ?? collect(data, "continuationCommand")[0]?.token;
  }

  function musicPager(artists, search) {
    const sources = shuffled(unique(artists)).map(artist => ({ artist, token: undefined, tokens: new Set() }));
    const seen = new Set();
    let buffer = [];
    return async () => {
      let error;
      for (let request = 0; buffer.length < MUSIC_PAGE_SIZE && sources.length && request < MUSIC_SEARCH_LIMIT; request++) {
        const source = sources.shift();
        try {
          const data = await search({ query: source.artist.name, params: "EgWKAQIIAWoQEAkQBRAKEAMQBBAQEBUQEQ==", ...(source.token ? { continuation: source.token } : {}) });
          const songs = items(data).filter(item => item.href.startsWith("/watch?") && item.artists.some(artist =>
            artist.id === source.artist.id || artist.name.localeCompare(source.artist.name, undefined, { sensitivity: "base" }) === 0));
          for (const song of songs) {
            if (seen.has(song.id)) continue;
            seen.add(song.id);
            buffer.push(song);
          }
          const token = continuation(data);
          if (token && !source.tokens.has(token)) {
            source.tokens.add(token);
            source.token = token;
            sources.push(source);
          }
        } catch (failure) {
          sources.unshift(source);
          error = failure;
          break;
        }
      }
      buffer = shuffled(buffer);
      return { items: buffer.splice(0, MUSIC_PAGE_SIZE), hasMore: Boolean(buffer.length || sources.length), error };
    };
  }

  function normalize(value = {}) {
    if (!value || typeof value !== "object") value = {};
    const strings = key => Array.isArray(value[key]) ? [...new Set(value[key].filter(v => typeof v === "string"))] : [];
    return {
      hidePlayerPanel: value.hidePlayerPanel !== false,
      hideHomeFilters: value.hideHomeFilters !== false,
      order: strings("order").slice(0, MAX_ORDERED_SECTIONS), hidden: strings("hidden"), known: strings("known"),
      artists: unique((Array.isArray(value.artists) ? value.artists : []).filter(artist => /^UC[\w-]+$/.test(artist?.id) && typeof artist.name === "string")
        .map(({ id, name, image }) => ({ id, name, image: typeof image === "string" ? image : "" }))),
    };
  }

  function ordered(settings, titles) {
    const all = [...new Set([...CUSTOM, ...titles])];
    return [...settings.order.filter(title => all.includes(title)), ...all.filter(title => !settings.order.includes(title))];
  }

  function exportSettings(settings) {
    return JSON.stringify({ format: "yt-music-enhancer", version: 1, settings: normalize(settings) }, null, 2);
  }

  function importSettings(source) {
    const backup = JSON.parse(source);
    const value = backup?.settings;
    if (backup?.format !== "yt-music-enhancer" || backup.version !== 1 || !value || typeof value.hidePlayerPanel !== "boolean") {
      throw new Error("invalidBackup");
    }
    if (value.hideHomeFilters !== undefined && typeof value.hideHomeFilters !== "boolean") throw new Error("invalidBackup");
    const validSections = ["order", "hidden", "known"].every(key => Array.isArray(value[key]) && value[key].every(title => typeof title === "string"));
    if (!validSections || value.order.length > MAX_ORDERED_SECTIONS) throw new Error("invalidBackup");
    const validArtists = Array.isArray(value.artists) && value.artists.every(artist =>
      artist && /^UC[\w-]+$/.test(artist.id) && typeof artist.name === "string" && artist.name.trim() && typeof artist.image === "string");
    if (!validArtists) {
      throw new Error("invalidBackup");
    }
    return normalize(value);
  }

  function discover(settings, titles) {
    const initialized = settings.order.length || settings.hidden.length || settings.known.length;
    const added = [...new Set(titles)].filter(title => !CUSTOM.includes(title) && !settings.known.includes(title));
    if (initialized) settings.hidden.push(...added.filter(title => !settings.order.includes(title) && !settings.hidden.includes(title)));
    settings.known.push(...added);
    return added.length > 0;
  }

  function age(value) {
    const match = value.match(/(\d+)\s*(second|minute|hour|day|week|month|year|mo|s|m|h|d|w|y)s?\b/i);
    const seconds = { second: 1, s: 1, minute: 60, m: 60, hour: 3600, h: 3600, day: 86400, d: 86400, week: 604800, w: 604800, month: 2592000, mo: 2592000, year: 31536000, y: 31536000 };
    return match ? Number(match[1]) * seconds[match[2].toLowerCase()] : Number.MAX_SAFE_INTEGER;
  }

  function sets(data, name) {
    const normalizeName = value => value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
    const artist = normalizeName(name);
    return collect(data, "videoRenderer").filter(video => artist && duration(text(video.lengthText)) >= MIN_SET_SECONDS && ` ${normalizeName(text(video.title))} `.includes(` ${artist} `))
      .map(video => ({ id: video.videoId, title: text(video.title), subtitle: [text(video.ownerText), text(video.publishedTimeText)].filter(Boolean).join(" · "),
        duration: duration(text(video.lengthText)), age: age(text(video.publishedTimeText)),
        image: video.thumbnail?.thumbnails?.at(-1)?.url ?? "", href: `/watch?v=${encodeURIComponent(video.videoId)}` }));
  }

  globalThis.YTMusicHome = { CUSTOM, MIN_SET_SECONDS, MAX_BACKUP_BYTES, MAX_ORDERED_SECTIONS, text, collect, unique, shuffled, duration, imageUrl, items, shelves, continuation, musicPager, normalize, exportSettings, importSettings, ordered, discover, sets };
})();
