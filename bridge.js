(() => {
  const allowed = body => typeof body.continuation === "string" || ["FEmusic_home", "FEmusic_liked_playlists", "FEmusic_history"].includes(body.browseId) || /^UC[\w-]+$/.test(body.browseId);

  window.addEventListener("message", async event => {
    if (event.source !== window || event.origin !== location.origin) return;
    const message = event.data;
    if (message?.channel === "ytme-navigation" && typeof message.href === "string") {
      const url = new URL(message.href, location.origin);
      if (url.origin !== location.origin) return;
      let endpoint;
      if (url.pathname === "/watch" && /^[\w-]+$/.test(url.searchParams.get("v") ?? "")) endpoint = { watchEndpoint: { videoId: url.searchParams.get("v") } };
      if (url.pathname === "/playlist" && /^[\w-]+$/.test(url.searchParams.get("list") ?? "")) endpoint = { browseEndpoint: { browseId: `VL${url.searchParams.get("list")}` } };
      if (/^\/browse\/[\w-]+$/.test(url.pathname)) endpoint = { browseEndpoint: { browseId: url.pathname.slice(8) } };
      if (endpoint) document.querySelector("ytmusic-app")?.dispatchEvent(new CustomEvent("yt-navigate", { detail: { endpoint }, bubbles: true, composed: true }));
      return;
    }
    if (message?.channel !== "ytme-request") return;
    const { id, endpoint, body } = message;
    if (typeof id !== "string" || !body || !(endpoint === "browse" && allowed(body) || endpoint === "search" && typeof body.query === "string")) return;
    try {
      const config = window.ytcfg;
      if (!config?.get("INNERTUBE_CONTEXT")) throw new Error("musicLoading");
      const context = structuredClone(config.get("INNERTUBE_CONTEXT"));
      if (body.browseId?.startsWith("UC")) context.client.hl = "en";
      const headers = { "Content-Type": "application/json", "X-Goog-AuthUser": String(config.get("SESSION_INDEX") ?? 0) };
      const cookies = document.cookie.split("; ");
      const cookie = cookies.find(value => value.startsWith("SAPISID=")) ?? cookies.find(value => value.startsWith("__Secure-3PAPISID="));
      if (cookie) {
        const timestamp = Math.floor(Date.now() / 1000);
        const hash = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(`${timestamp} ${cookie.slice(cookie.indexOf("=") + 1)} ${location.origin}`));
        headers.Authorization = `SAPISIDHASH ${timestamp}_${Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, "0")).join("")}`;
        const pageId = config.get("DELEGATED_SESSION_ID");
        if (pageId) headers["X-Goog-PageId"] = pageId;
      }
      const response = await fetch(`/youtubei/v1/${endpoint}?prettyPrint=false`, {
        method: "POST", credentials: "same-origin", headers,
        body: JSON.stringify({ ...body, context }), signal: AbortSignal.timeout(20000),
      });
      if (!response.ok) throw Object.assign(new Error("musicHttpError"), { status: String(response.status) });
      const data = await response.json();
      if (data.error) throw new Error("musicLoadError");
      window.postMessage({ channel: "ytme-response", id, data }, location.origin);
    } catch (error) {
      const code = ["musicLoading", "musicHttpError"].includes(error.message) ? error.message : "musicLoadError";
      window.postMessage({ channel: "ytme-response", id, error: code, substitutions: error.status }, location.origin);
    }
  });
})();
