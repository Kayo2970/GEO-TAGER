# GEO-TAGER

Local web app for bulk geotagging photos with their **real** location and capture time, using Google Maps satellite imagery. Nothing leaves your machine except map-tile lookups. Original files are never modified; tagged copies are returned as a zip.

## 🚀 How to Run (Dead Simple)

### Option 1: Double-Click the HTML file (Zero Installation)
Simply double-click **`index.html`** in your file manager / Finder.
- Runs 100% locally in your browser.
- No terminal, no Python, no dependencies needed.

### Option 2: Double-Click the Mac Launcher
Double-click **`start.command`** in Finder.
- Automatically launches the local Python server and pops open the app in your browser at `http://127.0.0.1:5000`.

### Option 3: Terminal
```bash
pip install -r code/requirements.txt
python code/app.py        # then open http://127.0.0.1:5000
```

> **Cloudflare Workers version:** see [`cloudflare/`](cloudflare/README.md) for a browser-only build you can deploy with `wrangler deploy`.

## 📁 Project Structure

- **`index.html`**: Standalone single-file application. Click to run anywhere!
- **`start.command`**: macOS one-click launcher for the Python server.
- **`code/`**: All backend Python code, modules, tests, and dependencies.
  - `code/app.py`: Flask local API server.
  - `code/geotager/`: EXIF reading/writing, geocoding, and image processing modules.
  - `code/tests/`: Automated unit & integration tests.

## What it does

- **Bulk upload** of JPEG, PNG, WebP and TIFF by drag and drop; thumbnails and a per-photo card.
- **Auto-reads EXIF**: capture time, UTC offset, existing GPS, camera. Cards show what each photo already has (`GPS ...` / `no GPS`, time / `no time`).
- **Location**: search an address (OpenStreetMap Nominatim) or click the map; coordinates, title and address are filled in and editable. Apply to any selection, so different groups of photos can get different places.
- **Area randomization**: toggle "Randomize location within area" and set a radius (in meters) to uniformly scatter coordinates across the selected zone. The map displays the radius circle and scatter markers for each photo.
- **Existing GPS is kept** by default; tick "Overwrite GPS" to replace it.
- **Time options**:
  - Keep photo's own capture time (default).
  - **Static date & time**: apply an exact timestamp across photos.
  - **Time range**: specify start and end dates/times with random or evenly spaced (chronological) distribution.
  - Shift by N minutes to fix camera clock offsets.
  - Fill missing times on photos that have none.
  - Configurable timezone offset (default `+05:30`).
- **Writes EXIF**: GPS latitude/longitude, GPS date/time (UTC), DateTimeOriginal, OffsetTime. JPEGs are not re-encoded unless an overlay is drawn.
- **Location & Time Stamp Overlay**: Enabled by default to draw a clean GPS camera-style badge featuring a Google Maps Satellite thumbnail with pin, title, address, coordinates, and capture time (without promotional disclaimers). Can be unchecked for pure EXIF-only mode.
- **Export**: zip of tagged photos plus `report.csv` (status, coordinates, time, address per photo; skipped photos say why).

## Notes

- **Map & Satellite Tiles**: Uses Google Maps Satellite (Hybrid) by default for both the in-app interactive map and the overlay stamp thumbnail (no API key required). Can be toggled to Clean Satellite or OpenStreetMap.
- Nominatim allows about one request per second; the app throttles itself. Set `NOMINATIM_URL` / `TILE_URL` to use custom servers.
- Map and address lookups need internet; tagging itself works offline (the overlay shows "map unavailable" if tiles can't be fetched).
- EXIF is written with a `Software=GEO-TAGER` tag so edited files remain identifiable.

## Tests

```bash
pytest code/tests
```
