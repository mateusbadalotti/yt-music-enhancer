(() => {
  const core = YTMusicHome;
  const t = (key, substitutions) => chrome.i18n.getMessage(key, substitutions);
  const [PLAYLISTS, ARTIST_SETS, ARTIST_RELEASES, LONG_LISTENS, LISTENED_ARTISTS, ARTIST_MUSIC] = core.CUSTOM;
  const labels = {
    [PLAYLISTS]: t("yourPlaylists"),
    [ARTIST_SETS]: t("artistSets"),
    [ARTIST_RELEASES]: t("artistReleases"),
    [LONG_LISTENS]: t("longListens"),
    [LISTENED_ARTISTS]: t("listenedArtists"),
    [ARTIST_MUSIC]: t("artistMusic"),
  };
  const pending = new Map();
  const cache = new Map();
  const nativeTitles = new Set();
  const customNodes = new Map();
  const carousels = new Map();
  const carouselObserver = new ResizeObserver(entries => {
    for (const entry of entries) carousels.get(entry.target)?.update();
  });
  const STORAGE_KEY = "home";
  const REQUEST_TIMEOUT_MS = 25000;
  const HISTORY_ARTIST_LIMIT = 6;
  const HISTORY_ITEMS_PER_TYPE = 6;
  let settings = core.normalize();
  let homeContainer;
  let renderVersion = 0;
  let searchVersion = 0;
  let sectionsLoaded = false;
  let sectionsLoading = false;
  let ready = false;
  let refreshTimer;
  let saveQueue = Promise.resolve();
  let queuedWrites = 0;
  let importing = false;
  let selectedSetsArtist;

  function element(tag, className, value) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (value !== undefined) node.textContent = value;
    return node;
  }

  function button(label, handler, className = "ytme-pill") {
    const node = element("button", className, label);
    node.type = "button";
    node.addEventListener("click", handler);
    return node;
  }

  function image(url, className = "ytme-avatar") {
    const node = element("img", className);
    node.alt = "";
    node.loading = "lazy";
    const source = core.imageUrl(url);
    if (source) node.src = source;
    return node;
  }

  function sourceBadge(custom) {
    const badge = element("span", "ytme-source-badge", custom ? "Enhancer" : "YouTube");
    badge.dataset.source = custom ? "enhancer" : "youtube";
    badge.title = t(custom ? "enhancerSource" : "youtubeSource");
    return badge;
  }

  const dialog = element("dialog", "ytme-dialog");
  dialog.id = "ytme-settings";
  dialog.lang = t("languageTag");
  dialog.dir = "ltr";
  dialog.setAttribute("aria-labelledby", "ytme-title");
  dialog.innerHTML = `<header class="ytme-header"><div><h2 id="ytme-title">${t("customizeHome")}</h2><p>${t("homeDescription")}</p></div></header>
    <div class="ytme-body"><section><h3>${t("home")}</h3><label class="ytme-toggle-label ytme-player-setting"><input id="ytme-hide-home-filters" class="ytme-toggle" type="checkbox" role="switch"><span>${t("hideHomeFilters")}<small class="ytme-source">${t("hideHomeFiltersDescription")}</small></span></label></section>
    <section><h3>${t("player")}</h3><label class="ytme-toggle-label ytme-player-setting"><input id="ytme-hide-player-panel" class="ytme-toggle" type="checkbox" role="switch"><span>${t("hidePlayerPanel")}<small class="ytme-source">${t("hidePlayerPanelDescription")}</small></span></label></section>
    <section><h3>${t("yourArtists")}</h3><p>${t("artistsDescription")}</p><div class="ytme-artists"></div>
    <form class="ytme-search"><input type="search" aria-label="${t("searchArtist")}" placeholder="${t("searchArtist")}" maxlength="200"><button type="submit" class="ytme-pill">${t("search")}</button></form>
    <div class="ytme-results" aria-live="polite"></div></section>
    <section><div class="ytme-section-heading"><h3>${t("sections")}</h3></div><p>${t("sectionsDescription")}</p><div class="ytme-sections"></div><p class="ytme-load-status" role="status"></p></section>
    <section class="ytme-backup"><h3>${t("settingsBackup")}</h3><p>${t("backupDescription")}</p><div class="ytme-backup-actions"></div><p class="ytme-backup-status" role="status"></p></section></div>
    <footer class="ytme-footer"><span class="ytme-save-status" role="status">${t("autoSave")}</span></footer>`;
  const close = button("", () => dialog.close(), "ytme-icon-button");
  close.setAttribute("aria-label", t("closeSettings"));
  close.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>';
  dialog.querySelector("header").append(close);
  const reset = button(t("reset"), () => {
    settings.order = [];
    settings.hidden = [];
    settings.known = [...nativeTitles];
    change();
  });
  dialog.querySelector(".ytme-section-heading").append(reset);
  dialog.querySelector("footer").append(button(t("done"), () => dialog.close(), "ytme-pill ytme-primary"));
  const backupActions = dialog.querySelector(".ytme-backup-actions");
  const backupStatus = dialog.querySelector(".ytme-backup-status");
  const importFile = element("input");
  importFile.type = "file";
  importFile.accept = ".json,application/json";
  importFile.hidden = true;
  backupActions.append(button(t("exportSettings"), () => {
    const url = URL.createObjectURL(new Blob([core.exportSettings(settings)], { type: "application/json" }));
    const link = element("a");
    link.href = url;
    link.download = "enhance-youtube-music-settings.json";
    link.hidden = true;
    backupActions.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }));
  const importButton = button(t("importSettings"), () => importFile.click());
  backupActions.append(importButton, importFile);
  importFile.addEventListener("change", async () => {
    const file = importFile.files[0];
    importFile.value = "";
    if (!file || importing) return;
    importing = true;
    dialog.querySelector(".ytme-body").inert = true;
    backupStatus.textContent = t("importingSettings");
    try {
      let incoming;
      try {
        if (file.size > core.MAX_BACKUP_BYTES) throw new Error("invalidBackup");
        incoming = core.importSettings(await file.text());
      } catch {
        backupStatus.textContent = t("invalidBackup");
        return;
      }
      core.discover(incoming, [...nativeTitles]);
      if (!await save(incoming)) {
        backupStatus.textContent = t("saveError");
        return;
      }
      settings = incoming;
      searchVersion++;
      dialog.querySelector(".ytme-results").replaceChildren();
      applySettings();
      backupStatus.textContent = t("settingsImported");
    } finally {
      importing = false;
      dialog.querySelector(".ytme-body").inert = false;
      refresh();
      importButton.focus();
    }
  });
  const playerToggle = dialog.querySelector("#ytme-hide-player-panel");
  const filtersToggle = dialog.querySelector("#ytme-hide-home-filters");
  filtersToggle.addEventListener("change", () => {
    settings.hideHomeFilters = filtersToggle.checked;
    applyHomeFilters();
    save();
  });
  playerToggle.addEventListener("change", () => {
    settings.hidePlayerPanel = playerToggle.checked;
    applyPlayer();
    save();
  });
  dialog.addEventListener("click", event => {
    const bounds = dialog.getBoundingClientRect();
    if (event.target === dialog && (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom)) dialog.close();
  });
  dialog.addEventListener("close", () => document.querySelector("#ytme-config")?.focus());
  window.addEventListener("keydown", event => {
    if (!dialog.open) return;
    if (event.key === "Escape") {
      event.preventDefault();
      dialog.close();
    }
    event.stopImmediatePropagation();
  }, true);

  window.addEventListener("message", event => {
    if (event.source !== window || event.origin !== location.origin || event.data?.channel !== "ytme-response") return;
    const request = pending.get(event.data.id);
    if (!request) return;
    clearTimeout(request.timer);
    pending.delete(event.data.id);
    if (event.data.error) request.reject(new Error(t(event.data.error, event.data.substitutions) || t("musicLoadError")));
    else request.resolve(event.data.data);
  });

  function api(endpoint, body) {
    return new Promise((resolve, reject) => {
      const id = crypto.randomUUID();
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(t("musicTimeout")));
      }, REQUEST_TIMEOUT_MS);
      pending.set(id, { resolve, reject, timer });
      window.postMessage({ channel: "ytme-request", id, endpoint, body }, location.origin);
    });
  }

  function cached(key, loader) {
    if (!cache.has(key)) cache.set(key, loader().catch(error => { cache.delete(key); throw error; }));
    return cache.get(key);
  }

  function artistSets(artist, recent = true) {
    return cached(`sets:${recent}:${artist.name}`, async () => {
      const result = await chrome.runtime.sendMessage({ type: "artist-sets", name: artist.name, recent }).catch(() => null);
      if (result?.error === "setsBlocked") throw new Error(t("setsBlocked"));
      if (result?.error || !result?.items) throw new Error(t("setsError"));
      return result.items;
    });
  }

  function save(incoming) {
    if (importing && !incoming) return Promise.resolve(false);
    const snapshot = structuredClone(incoming ?? settings);
    queuedWrites++;
    saveQueue = saveQueue.then(() => chrome.storage.local.set({ [STORAGE_KEY]: snapshot })).then(() => {
      dialog.querySelector(".ytme-save-status").textContent = t("saved");
      return true;
    }).catch(() => {
      dialog.querySelector(".ytme-save-status").textContent = t("saveError");
      return false;
    }).finally(() => { queuedWrites--; });
    return saveQueue;
  }

  function change(artistsChanged = false) {
    save();
    renderSections();
    applyHome();
    if (artistsChanged) renderArtists();
    renderExtras();
  }

  function applySettings() {
    applyPlayer();
    applyHomeFilters();
    renderArtists();
    renderSections();
    applyHome();
    renderExtras();
  }

  function applyPlayer() {
    document.documentElement.classList.toggle("ytme-hide-player-panel", settings.hidePlayerPanel);
    playerToggle.checked = settings.hidePlayerPanel;
  }

  function applyHomeFilters() {
    document.documentElement.classList.toggle("ytme-hide-home-filters", settings.hideHomeFilters && location.pathname === "/");
    filtersToggle.checked = settings.hideHomeFilters;
  }

  function remember() {
    settings.known = [...new Set([...settings.known, ...nativeTitles])];
  }

  function renderSections(focus) {
    const list = dialog.querySelector(".ytme-sections");
    list.replaceChildren();
    const titles = core.ordered(settings, [...nativeTitles]);
    titles.forEach((title, index) => {
      const row = element("div", "ytme-section-row");
      const label = element("label", "ytme-toggle-label");
      const toggle = element("input", "ytme-toggle");
      toggle.type = "checkbox";
      toggle.setAttribute("role", "switch");
      toggle.checked = !settings.hidden.includes(title);
      toggle.addEventListener("change", () => {
        remember();
        settings.hidden = toggle.checked ? settings.hidden.filter(value => value !== title) : [...settings.hidden, title];
        change();
        renderSections({ title, control: 0 });
      });
      const name = element("span", "ytme-section-name", labels[title] ?? title);
      name.append(sourceBadge(core.CUSTOM.includes(title)));
      label.append(toggle, name);
      row.append(label);
      [-1, 1].forEach((direction, offset) => {
        const arrow = button("", () => {
          remember();
          const order = [...titles];
          [order[index], order[index + direction]] = [order[index + direction], order[index]];
          settings.order = [...order, ...settings.order.filter(value => !order.includes(value))].slice(0, core.MAX_ORDERED_SECTIONS);
          change();
          renderSections({ title, control: offset + 1 });
        }, "ytme-icon-button ytme-arrow");
        arrow.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${direction === -1 ? "m7 14 5-5 5 5" : "m7 10 5 5 5-5"}"/></svg>`;
        arrow.setAttribute("aria-label", t(direction === -1 ? "moveUp" : "moveDown", labels[title] ?? title));
        arrow.disabled = index + direction < 0 || index + direction >= titles.length;
        row.append(arrow);
      });
      list.append(row);
      if (focus?.title === title) row.querySelectorAll("input, button")[focus.control]?.focus();
    });
    reset.disabled = !settings.order.length && !settings.hidden.length;
  }

  function renderArtists() {
    const list = dialog.querySelector(".ytme-artists");
    list.replaceChildren();
    for (const artist of settings.artists) {
      const chip = button("", () => {
        settings.artists = settings.artists.filter(value => value.id !== artist.id);
        change(true);
        dialog.querySelector("input[type=search]").focus();
      }, "ytme-artist-chip");
      chip.setAttribute("aria-label", t("removeArtist", artist.name));
      chip.append(image(artist.image), document.createTextNode(artist.name), element("span", "", "×"));
      list.append(chip);
    }
  }

  dialog.querySelector("form").addEventListener("submit", async event => {
    event.preventDefault();
    const query = dialog.querySelector("input[type=search]").value.trim();
    if (!query) return;
    const version = ++searchVersion;
    const results = dialog.querySelector(".ytme-results");
    results.textContent = t("searchingArtists");
    try {
      const data = await api("search", { query, params: "EgWKAQIgAWoQEAkQBRAKEAMQBBAQEBUQEQ==" });
      if (version !== searchVersion) return;
      const artists = core.items(data).filter(item => item.id.startsWith("UC")).slice(0, 5);
      results.replaceChildren();
      if (!artists.length) results.textContent = t("noArtists");
      for (const artist of artists) {
        const row = element("div", "ytme-result");
        const add = button(t("add"), () => {
          if (!settings.artists.some(value => value.id === artist.id)) settings.artists.push({ id: artist.id, name: artist.title, image: artist.image });
          change(true);
          add.textContent = t("added");
          add.disabled = true;
        });
        add.disabled = settings.artists.some(value => value.id === artist.id);
        if (add.disabled) add.textContent = t("added");
        const description = element("span", "ytme-result-name", artist.title);
        description.append(element("small", "", artist.subtitle));
        row.append(image(artist.image), description, add);
        results.append(row);
      }
    } catch (error) {
      if (version === searchVersion) results.textContent = error.message;
    }
  });
  dialog.querySelector("input[type=search]").addEventListener("input", () => {
    searchVersion++;
    dialog.querySelector(".ytme-results").replaceChildren();
  });

  async function loadSections() {
    if (sectionsLoaded || sectionsLoading) return;
    sectionsLoading = true;
    const status = dialog.querySelector(".ytme-load-status");
    status.textContent = t("loadingSections");
    try {
      let token;
      const seen = new Set();
      do {
        const data = await api("browse", token ? { continuation: token } : { browseId: "FEmusic_home" });
        core.shelves(data).forEach(shelf => nativeTitles.add(shelf.title));
        if (!importing && core.discover(settings, [...nativeTitles])) save();
        renderSections();
        const list = core.collect(data, "sectionListRenderer")[0] ?? data.continuationContents?.sectionListContinuation;
        token = core.continuation(list?.continuations) ?? core.continuation(list?.contents?.filter(node => node.continuationItemRenderer))
          ?? core.continuation(core.collect(data, "appendContinuationItemsAction").flatMap(action => action.continuationItems?.filter(node => node.continuationItemRenderer) ?? []));
        if (seen.has(token)) break;
        seen.add(token);
      } while (token);
      sectionsLoaded = true;
      status.textContent = "";
      applyHome();
    } catch (error) {
      status.textContent = error.message + " ";
      status.append(button(t("retry"), loadSections));
    } finally {
      sectionsLoading = false;
    }
  }

  function installButton() {
    const nav = document.querySelector("ytmusic-nav-bar #right-content");
    if (!nav || document.querySelector("#ytme-config")) return;
    const config = button("", () => {
      if (!dialog.isConnected) document.body.append(dialog);
      renderArtists();
      renderSections();
      dialog.showModal();
      loadSections();
    }, "ytme-icon-button");
    config.id = "ytme-config";
    config.lang = t("languageTag");
    config.title = t("customizeHome");
    config.setAttribute("aria-label", t("customizeHome"));
    config.setAttribute("aria-haspopup", "dialog");
    config.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9.5 3-.6 2.2-1.5.9-2.2-.6-2.5 4.3 1.6 1.6v1.7l-1.6 1.6L5.2 19l2.2-.6 1.5.9.6 2.2h5l.6-2.2 1.5-.9 2.2.6 2.5-4.3-1.6-1.6v-1.7l1.6-1.6-2.5-4.3-2.2.6-1.5-.9-.6-2.2z"/><circle cx="12" cy="12.25" r="3.25"/></svg>';
    const profile = nav.querySelector("ytmusic-avatar-stack, yt-avatar-shape, #avatar-btn, .sign-in-link");
    let anchor = profile;
    while (anchor && anchor.parentElement !== nav) anchor = anchor.parentElement;
    nav.insertBefore(config, anchor ?? null);
  }

  function applyHome() {
    if (!homeContainer?.isConnected) return;
    const titles = core.ordered(settings, [...nativeTitles]);
    homeContainer.classList.add("ytme-home-sections");
    for (const node of homeContainer.children) {
      const title = node.dataset.ytmeTitle;
      if (!title) continue;
      const order = String(titles.indexOf(title));
      if (node.style.order !== order) node.style.order = order;
      node.toggleAttribute("data-ytme-hidden", settings.hidden.includes(title));
    }
  }

  function cards(items, title, rows = false) {
    const section = element("div", rows ? "ytme-shelf-content ytme-long-listens" : "ytme-shelf-content");
    if (title) {
      const heading = element("div", "ytme-shelf-heading");
      heading.append(element("h2", "ytme-shelf-title", title));
      section.append(heading);
    }
    const row = element("div", "ytme-cards");
    for (const item of items) {
      if (!/^\/(?:watch\?|playlist\?|browse\/)/.test(item.href)) continue;
      const link = element("a", "ytme-card");
      link.href = item.href;
      link.addEventListener("click", event => {
        if (event.button || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        window.postMessage({ channel: "ytme-navigation", href: item.href }, location.origin);
      });
      link.append(image(item.image, "ytme-cover"), element("span", "ytme-card-title", item.title), element("span", "ytme-card-subtitle", item.subtitle));
      row.append(link);
    }
    section.append(row);
    return section;
  }

  function refreshCarousels() {
    for (const [row, carousel] of carousels) {
      if (row.isConnected) continue;
      carouselObserver.unobserve(row);
      carousel.controls.remove();
      carousels.delete(row);
    }
    for (const row of homeContainer?.querySelectorAll(".ytme-cards") ?? []) {
      if (carousels.has(row)) {
        carousels.get(row).update();
        continue;
      }
      const heading = row.closest(".ytme-shelf-content").querySelector(".ytme-shelf-heading")
        ?? row.closest(".ytme-custom-shelf").querySelector(".ytme-shelf-heading");
      if (!heading) continue;
      const controls = element("div", "ytme-carousel-controls");
      const arrows = [-1, 1].map(direction => {
        const label = t(direction === -1 ? "previousItems" : "nextItems");
        const arrow = button("", () => {
          const card = row.querySelector(".ytme-card");
          if (!card) return;
          const step = card.getBoundingClientRect().width + parseFloat(getComputedStyle(row).columnGap);
          const distance = Math.max(1, Math.floor(row.clientWidth / step)) * step;
          row.scrollBy({ left: direction * distance, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
        }, "ytme-icon-button ytme-carousel-arrow");
        arrow.setAttribute("aria-label", label);
        arrow.title = label;
        arrow.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${direction === -1 ? "m14 6-6 6 6 6" : "m10 6 6 6-6 6"}"/></svg>`;
        return arrow;
      });
      const update = () => {
        const end = row.scrollWidth - row.clientWidth;
        arrows[0].disabled = row.scrollLeft <= 1;
        arrows[1].disabled = row.scrollLeft >= end - 1;
      };
      controls.append(...arrows);
      heading.append(controls);
      carousels.set(row, { controls, update });
      row.addEventListener("scroll", update, { passive: true });
      carouselObserver.observe(row);
      update();
    }
  }

  async function library() {
    return cached("playlists", async () => {
      const items = [];
      const seen = new Set();
      let token;
      do {
        const data = await api("browse", token ? { continuation: token } : { browseId: "FEmusic_liked_playlists" });
        items.push(...core.items(data).filter(item => item.id.startsWith("VL")));
        token = core.continuation(data);
        if (seen.has(token)) break;
        seen.add(token);
      } while (token);
      return core.unique(items);
    });
  }

  async function longListens(artists) {
    const data = await cached("history", () => api("browse", { browseId: "FEmusic_history" }));
    const played = core.items(data);
    const counts = new Map();
    for (const artist of played.flatMap(item => item.artists)) {
      const entry = counts.get(artist.name) ?? { ...artist, count: 0 };
      entry.count++;
      counts.set(artist.name, entry);
    }
    const picked = core.unique([...artists, ...[...counts.values()].sort((a, b) => b.count - a.count).slice(0, 6)]);
    const found = await Promise.allSettled(picked.map(artist => artistSets(artist)));
    const sets = found.filter(result => result.status === "fulfilled").flatMap(result => result.value).sort((a, b) => a.age - b.age);
    return core.unique([...played.filter(item => item.duration >= core.MIN_SET_SECONDS), ...sets]).slice(0, 200);
  }

  function historyMix() {
    return cached("history-mix", async () => {
      const played = core.items(await cached("history", () => api("browse", { browseId: "FEmusic_history" }))).filter(item => item.href.startsWith("/watch?"));
      const artists = core.shuffled(core.unique(played.flatMap(item => item.artists))).slice(0, HISTORY_ARTIST_LIMIT);
      const groups = await Promise.all(artists.map(async artist => {
        const [catalog, sets] = await Promise.allSettled([
          cached(`artist:${artist.id}`, () => api("browse", { browseId: artist.id })),
          artistSets(artist, false),
        ]);
        const songs = played.filter(item => item.artists.some(value => value.id === artist.id));
        if (catalog.status === "fulfilled") {
          songs.push(...core.shelves(catalog.value).filter(shelf => /^(Top songs|Videos)\b/.test(shelf.title)).flatMap(shelf => shelf.items));
        }
        return [
          ...core.shuffled(core.unique(songs.filter(item => item.href.startsWith("/watch?")))).slice(0, HISTORY_ITEMS_PER_TYPE),
          ...core.shuffled(sets.status === "fulfilled" ? sets.value : []).slice(0, HISTORY_ITEMS_PER_TYPE),
        ];
      }));
      return core.shuffled(core.unique(groups.flat()));
    });
  }

  function renderHistoryShelf(node) {
    const heading = element("div", "ytme-shelf-heading");
    const content = element("div", "ytme-shelf-body");
    const status = element("p", "ytme-mix-status");
    status.setAttribute("role", "status");
    const surprise = button(t("surpriseMe"), () => {
      cache.delete("history-mix");
      load();
    });
    heading.append(element("h2", "ytme-shelf-title", labels[LISTENED_ARTISTS]), surprise);
    node.append(heading, content, status);
    async function load() {
      surprise.disabled = true;
      content.setAttribute("aria-busy", "true");
      status.textContent = t("loading");
      try {
        const items = await historyMix();
        if (!content.isConnected) return;
        content.replaceChildren(items.length ? cards(items) : element("p", "ytme-empty", t("noListenedArtists")));
        status.textContent = "";
      } catch (error) {
        if (content.isConnected) status.textContent = error.message;
      } finally {
        content.removeAttribute("aria-busy");
        surprise.disabled = false;
      }
    }
    load();
  }

  function renderArtistSetsShelf(node, artists) {
    const selected = artists.find(artist => artist.id === selectedSetsArtist) ?? artists[0];
    selectedSetsArtist = selected.id;
    const choices = element("div", "ytme-artists ytme-sets-artists");
    choices.setAttribute("role", "group");
    choices.setAttribute("aria-label", t("yourArtists"));
    const content = element("div", "ytme-shelf-body");
    content.setAttribute("aria-live", "polite");
    let version = 0;
    for (const artist of artists) {
      const chip = button("", () => {
        if (selectedSetsArtist === artist.id) return;
        selectedSetsArtist = artist.id;
        for (const choice of choices.children) choice.setAttribute("aria-pressed", String(choice === chip));
        load(artist);
      }, "ytme-artist-chip");
      chip.setAttribute("aria-pressed", String(artist.id === selectedSetsArtist));
      chip.append(image(artist.image), document.createTextNode(artist.name));
      choices.append(chip);
    }
    node.append(choices, content);
    async function load(artist) {
      const requestVersion = ++version;
      content.textContent = t("loading");
      content.setAttribute("aria-busy", "true");
      try {
        const items = await artistSets(artist);
        if (requestVersion !== version || !content.isConnected) return;
        content.replaceChildren(items.length ? cards(items) : element("p", "ytme-empty", t("noSets")));
      } catch (error) {
        if (requestVersion !== version || !content.isConnected) return;
        content.textContent = error.message + " ";
        content.append(button(t("retry"), () => load(artist)));
      } finally {
        if (requestVersion === version) content.removeAttribute("aria-busy");
      }
    }
    load(selected);
  }

  function renderArtistMusicShelf(node, artists) {
    const content = cards([]);
    const row = content.querySelector(".ytme-cards");
    const status = element("p", "ytme-mix-status");
    status.setAttribute("role", "status");
    const more = button(t("loadMore"), load);
    const next = core.musicPager(artists, body => api("search", body));
    let loading = false;
    let hasMore = true;
    let failed = false;
    node.append(content, status, more);
    row.addEventListener("scroll", () => {
      if (!failed && row.scrollWidth - row.scrollLeft - row.clientWidth <= row.clientWidth) load();
    }, { passive: true });
    async function load() {
      if (loading || !hasMore || !content.isConnected || settings.hidden.includes(ARTIST_MUSIC)) return;
      loading = true;
      failed = false;
      more.disabled = true;
      row.setAttribute("aria-busy", "true");
      status.textContent = t("loading");
      try {
        const result = await next();
        if (!content.isConnected) return;
        row.append(...cards(result.items).querySelector(".ytme-cards").children);
        hasMore = result.hasMore;
        failed = Boolean(result.error);
        status.textContent = result.error?.message ?? (hasMore ? "" : t(row.children.length ? "noMoreMusic" : "noArtistMusic"));
        more.textContent = t(failed ? "retry" : "loadMore");
        more.hidden = !hasMore;
      } finally {
        loading = false;
        more.disabled = false;
        row.removeAttribute("aria-busy");
      }
    }
    load();
  }

  async function loadShelf(title, artists) {
    if (title === PLAYLISTS) return cards(await library());
    if (title === ARTIST_RELEASES) {
      const group = element("div");
      for (const artist of artists) {
        const data = await cached(`artist:${artist.id}`, () => api("browse", { browseId: artist.id }));
        const shelves = core.shelves(data);
        const items = [["Singles", 6], ["Albums", 4], ["Top songs", 6]].flatMap(([prefix, count]) => shelves.find(shelf => shelf.title.startsWith(prefix))?.items.slice(0, count) ?? []);
        if (items.length) group.append(cards(items, t("newFromArtist", artist.name)));
      }
      return group;
    }
    return cards(await longListens(artists), undefined, true);
  }

  function renderExtras() {
    if (!homeContainer?.isConnected) return;
    const version = ++renderVersion;
    const artists = [...settings.artists];
    for (const title of core.CUSTOM) {
      const node = customNodes.get(title);
      if (!node || settings.hidden.includes(title)) continue;
      node.replaceChildren();
      if (title === LISTENED_ARTISTS) {
        node.hidden = false;
        renderHistoryShelf(node);
        continue;
      }
      if (title !== ARTIST_RELEASES) {
        const heading = element("div", "ytme-shelf-heading");
        heading.append(element("h2", "ytme-shelf-title", labels[title]));
        node.append(heading);
      }
      if ([ARTIST_SETS, ARTIST_RELEASES, ARTIST_MUSIC].includes(title) && !artists.length) {
        node.hidden = true;
        continue;
      }
      node.hidden = false;
      if (title === ARTIST_MUSIC) {
        renderArtistMusicShelf(node, artists);
        continue;
      }
      if (title === ARTIST_SETS) {
        renderArtistSetsShelf(node, artists);
        continue;
      }
      const content = element("div", "ytme-shelf-body", t("loading"));
      node.append(content);
      loadShelf(title, artists).then(result => {
        if (version !== renderVersion) return;
        content.replaceChildren(result);
        node.hidden = !result.querySelector("a") && !result.matches(".ytme-empty");
      }).catch(error => {
        if (version !== renderVersion) return;
        content.textContent = error.message + " ";
        content.append(button(t("retry"), renderExtras));
      });
    }
    applyHome();
  }

  const observer = new MutationObserver(() => {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(refresh, 100);
  });

  function refresh() {
    if (!ready) return;
    observer.disconnect();
    applyPlayer();
    applyHomeFilters();
    installButton();
    const container = location.pathname === "/" ? document.querySelector("ytmusic-browse-response ytmusic-section-list-renderer > #contents") : null;
    if (homeContainer && container !== homeContainer) {
      homeContainer.classList.remove("ytme-home-sections");
      for (const node of [...homeContainer.children]) {
        if (node.dataset.ytmeCustom) node.remove();
        else if (node.dataset.ytmeTitle) {
          node.style.removeProperty("order");
          delete node.dataset.ytmeTitle;
          node.removeAttribute("data-ytme-hidden");
        }
      }
      homeContainer = null;
      renderVersion++;
    }
    let changed = false;
    if (container) {
      for (const node of container.children) {
        if (node.dataset.ytmeCustom) continue;
        const heading = node.querySelector("ytmusic-carousel-shelf-basic-header-renderer .title, h2");
        const title = heading?.textContent.trim();
        if (!title) continue;
        node.dataset.ytmeTitle = title;
        if (!nativeTitles.has(title)) { nativeTitles.add(title); changed = true; }
      }
      if (!importing && core.discover(settings, [...nativeTitles])) save();
      if (container !== homeContainer || [...customNodes.values()].some(node => !node.isConnected)) {
        homeContainer = container;
        for (const node of customNodes.values()) node.remove();
        customNodes.clear();
        for (const title of core.CUSTOM) {
          const node = element("section", "ytme-custom-shelf");
          node.lang = t("languageTag");
          node.dataset.ytmeTitle = title;
          node.dataset.ytmeCustom = "true";
          customNodes.set(title, node);
          container.append(node);
        }
        renderExtras();
      }
      applyHome();
    }
    if (changed && dialog.open) renderSections();
    refreshCarousels();
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["page-type"] });
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes[STORAGE_KEY] || queuedWrites) return;
    const incoming = core.normalize(changes[STORAGE_KEY].newValue);
    if (JSON.stringify(incoming) === JSON.stringify(settings)) return;
    settings = incoming;
    applySettings();
  });

  chrome.storage.local.get(STORAGE_KEY).then(result => {
    settings = core.normalize(result[STORAGE_KEY]);
  }).catch(() => {
    dialog.querySelector(".ytme-save-status").textContent = t("storageError");
  }).finally(() => {
    ready = true;
    refresh();
  });
  document.addEventListener("yt-navigate-finish", refresh);
})();
