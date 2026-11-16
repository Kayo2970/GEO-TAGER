# GEO-TAGER

Local web app for bulk geotagging photos with their **real** location and capture time, using Google Maps satellite imagery. Nothing leaves your machine except map-tile lookups. Original files are never modified; tagged copies are returned as a zip.

---

## 🚀 How to Run (Single Click on Any OS)

### 🌟 Universal One-Click Launch (Any OS: Windows, macOS, Linux)
Double-click **`Launch GEO-TAGER.html`** in your file manager or browser.
- Displays a single **"🚀 Start GEO-TAGER"** button.
- Automatically connects to your local Python server if running, or launches the 100% standalone web app.
- Zero installation or command-line needed!

---

### Native 1-Click Launchers

| Operating System | How to Start | What it does |
| :--- | :--- | :--- |
| **Any OS (Universal)** | Double-click `Launch GEO-TAGER.html` | Starts app immediately in default web browser |
| **Windows** | Double-click `start.bat` | Starts Flask server and opens default browser |
| **macOS** | Double-click `start.command` | Starts Flask server and opens browser |
| **Linux** | Run `./start.sh` | Starts Flask server and opens default browser |
| **Python (Cross-Platform)** | Run `python start.py` | Auto-detects environment, starts server & opens browser |
| **Standalone Browser** | Double-click `index.html` | Runs 100% in-browser offline with zero dependencies |

---

### Manual Terminal Run
```bash
pip install -r code/requirements.txt
python code/app.py        # then open http://127.0.0.1:5000
```

> **Cloudflare Workers version:** see [`cloudflare/`](cloudflare/README.md) for a browser-only build you can deploy with `wrangler deploy`.

---

## 📁 Project Structure

- **`Launch GEO-TAGER.html`**: Universal cross-platform launcher with a single start button.
- **`index.html`**: Standalone single-file application. Works on any browser!
- **`start.bat`**: Windows batch launcher.
- **`start.command`**: macOS one-click launcher.
- **`start.sh`**: Linux shell launcher.
- **`start.py`**: Cross-platform Python launcher script.
- **`code/`**: Backend Python code, modules, tests, and dependencies.
  - `code/app.py`: Flask local API server.
  - `code/geotager/`: EXIF reading/writing, geocoding, and image processing modules.
  - `code/tests/`: Automated unit & integration tests.

---

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
- **Location & Time Stamp Overlay**: Enabled by default to draw a clean GPS camera-style badge featuring a Google Maps Satellite thumbnail with pin, title, address, coordinates, and capture time (without promotional disclaimers). Stamp is dynamically restricted to the lower 1/4 of the image. Can be unchecked for pure EXIF-only mode.
- **Export**: zip of tagged photos plus `report.csv` (status, coordinates, time, address per photo; skipped photos say why).

---

## Notes

- **Map & Satellite Tiles**: Uses Google Maps Satellite (Hybrid) by default for both the in-app interactive map and the overlay stamp thumbnail (no API key required). Can be toggled to Clean Satellite or OpenStreetMap.
- Nominatim allows about one request per second; the app throttles itself. Set `NOMINATIM_URL` / `TILE_URL` to use custom servers.
- Map and address lookups need internet; tagging itself works offline (the overlay shows "map unavailable" if tiles can't be fetched).
- EXIF is written with a `Software=GEO-TAGER` tag so edited files remain identifiable.
- **Credits & Disclaimer**: Developed by Kayomarz Pavri. Users are solely responsible for the content and metadata of the images they produce.

---

## Tests

```bash
pytest code/tests
```
