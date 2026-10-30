// GEO-TAGER worker: serves the static app (public/) and proxies address and
// map-tile lookups to OpenStreetMap so the browser never needs to send a
// User-Agent or hit a third-party origin. Photos are never sent here.

const NOMINATIM = "https://nominatim.openstreetmap.org";
const TILES = "https://tile.openstreetmap.org";
const UA = "GEO-TAGER/1.0 (Cloudflare Worker photo geotagging tool)";

import { shape } from "./shape.js";

const json = (body, status = 200, extra = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...extra },
  });

async function upstream(url, ttl) {
  const res = await fetch(url, { headers: { "user-agent": UA }, cf: { cacheEverything: true, cacheTtl: ttl } });
  if (!res.ok) throw new Error(`upstream ${res.status}`);
  return res;
}

async function handleApi(url) {
  const path = url.pathname;

  if (path === "/api/search") {
    const q = (url.searchParams.get("q") || "").trim().slice(0, 200);
    if (!q) return json([]);
    const qs = new URLSearchParams({ format: "jsonv2", q, limit: "5", addressdetails: "1" });
    try {
      const hits = await (await upstream(`${NOMINATIM}/search?${qs}`, 86400)).json();
      return json(hits.map(shape), 200, { "cache-control": "public, max-age=3600" });
    } catch (e) {
      return json({ error: `address search failed: ${e.message}` }, 502);
    }
  }

  if (path === "/api/reverse") {
    const lat = parseFloat(url.searchParams.get("lat"));
    const lon = parseFloat(url.searchParams.get("lon"));
    if (!(Math.abs(lat) <= 90 && Math.abs(lon) <= 180)) return json({ error: "lat and lon required" }, 400);
    // round so nearby clicks share a cache entry (and Nominatim isn't hammered)
    const qs = new URLSearchParams({
      format: "jsonv2", lat: lat.toFixed(5), lon: lon.toFixed(5), zoom: "18", addressdetails: "1",
    });
    try {
      const hit = await (await upstream(`${NOMINATIM}/reverse?${qs}`, 604800)).json();
      if (hit.error) return json({ error: hit.error }, 404);
      return json(shape(hit), 200, { "cache-control": "public, max-age=86400" });
    } catch (e) {
      return json({ error: `address lookup failed: ${e.message}` }, 502);
    }
  }

  const tile = path.match(/^\/api\/tile\/(\d{1,2})\/(\d{1,7})\/(\d{1,7})\.png$/);
  if (tile) {
    const [z, x, y] = tile.slice(1).map(Number);
    if (z > 19 || x >= 2 ** z || y >= 2 ** z) return json({ error: "bad tile" }, 400);
    try {
      const res = await upstream(`${TILES}/${z}/${x}/${y}.png`, 86400 * 7);
      return new Response(res.body, {
        headers: { "content-type": "image/png", "cache-control": "public, max-age=604800" },
      });
    } catch (e) {
      return json({ error: `tile failed: ${e.message}` }, 502);
    }
  }

  return json({ error: "not found" }, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      if (request.method !== "GET") return json({ error: "method not allowed" }, 405);
      return handleApi(url);
    }
    return env.ASSETS.fetch(request);
  },
};
