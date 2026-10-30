# GEO-TAGER on Cloudflare Workers

Same app as the Python version, rebuilt so it runs on Workers. **Photos never leave the browser**: EXIF reading/writing, the overlay and the zip are all done client-side. The Worker only serves the static app (`public/`) and proxies three lookups to OpenStreetMap (`src/index.js`):

| Route | Purpose |
|---|---|
| `GET /api/search?q=` | address search (Nominatim) |
| `GET /api/reverse?lat=&lon=` | coordinates to title and address (Nominatim) |
| `GET /api/tile/{z}/{x}/{y}.png` | map tiles for the overlay thumbnail (same-origin so the canvas can read them) |

Responses are cached at the edge. Photos are never sent to the Worker.

## Deploy

```bash
cd cloudflare
npm install
npx wrangler login      # once
npx wrangler deploy
```

It deploys as a Worker named `geo-tager` on `geo-tager.<your-subdomain>.workers.dev`. Change `name` in `wrangler.jsonc` to rename it. Local dev: `npx wrangler dev`.

## Tests

```bash
npm test
```

## Things to know

- **OpenStreetMap usage policy.** The Worker identifies itself with a User-Agent and caches aggressively, but all visitors share one egress, so heavy public use can get rate-limited or blocked by Nominatim and the tile server. For anything beyond personal or team use, point `NOMINATIM` and `TILES` in `src/index.js` at a provider you have an account with (MapTiler, Geoapify, LocationIQ, etc.).
- **Limits.** Processing happens in the user's browser, so batch size is bounded by the browser's memory (hundreds of phone photos is fine; thousands may not be). Only JPEG EXIF is read; PNG/WebP/TIFF inputs are converted to tagged JPEG.
- **Public URL.** Anyone with the link can use it. To restrict it, put the Worker behind Cloudflare Access (Zero Trust, free for small teams).
- **Honesty markers.** Same as the Python app: the overlay says location and time were added after capture, and EXIF `Software` is set to `GEO-TAGER`.
