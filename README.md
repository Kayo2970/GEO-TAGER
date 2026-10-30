# GEO-TAGER

Local web app for bulk geotagging photos with their **real** location and capture time. Nothing leaves your machine except OpenStreetMap address/map-tile lookups. Original files are never modified; tagged copies are returned as a zip.

## Run

```bash
pip install -r requirements.txt
python app.py        # then open http://127.0.0.1:5000
```

> **Cloudflare Workers version:** see [`cloudflare/`](cloudflare/README.md) for a browser-only build you can deploy with `wrangler deploy`.

## What it does

- **Bulk upload** of JPEG, PNG, WebP and TIFF by drag and drop; thumbnails and a per-photo card.
- **Auto-reads EXIF**: capture time, UTC offset, existing GPS, camera. Cards show what each photo already has (`GPS ...` / `no GPS`, time / `no time`).
- **Location**: search an address (OpenStreetMap Nominatim) or click the map; coordinates, title and address are filled in and editable. Apply to any selection, so different groups of photos can get different places.
- **Existing GPS is kept** by default; tick "Overwrite GPS" to replace it.
- **Time**: keep the photo's own time (default), shift by N minutes to fix a wrong camera clock, or set a time on photos that have none. Timezone offset is configurable (default `+05:30`).
- **Writes EXIF**: GPS latitude/longitude, GPS date/time (UTC), DateTimeOriginal, OffsetTime. JPEGs are not re-encoded unless an overlay is drawn.
- **Optional overlay**: map thumbnail with pin, title, address, coordinates, weekday/date/time/GMT offset, bottom-left layout like common GPS camera apps. It carries a note that the location and time were added after capture. Preview before exporting.
- **Export**: zip of tagged photos plus `report.csv` (status, coordinates, time, address per photo; skipped photos say why).

## Notes

- Nominatim allows about one request per second; the app throttles itself. Set `NOMINATIM_URL` / `TILE_URL` to use your own servers.
- Map and address lookups need internet; tagging itself works offline (the overlay shows "map unavailable" if tiles can't be fetched).
- EXIF is written with a `Software=GEO-TAGER` tag so edited files remain identifiable.

## Tests

```bash
python -m pytest
```
