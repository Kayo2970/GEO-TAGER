"""GEO-TAGER: local web app for bulk geotagging photos. Run: python app.py"""
import csv
import io
import json
import re
import uuid
import zipfile
from pathlib import Path

from flask import Flask, abort, jsonify, request, send_file

from geotager import exiftools, geo
from geotager.processing import Options, process_photo

ROOT = Path(__file__).parent
DATA = ROOT / "data"
ALLOWED = {".jpg", ".jpeg", ".png", ".webp", ".tif", ".tiff"}
ID_RE = re.compile(r"^[0-9a-f]{32}$")

app = Flask(__name__, static_folder="static", template_folder="templates")
app.config["MAX_CONTENT_LENGTH"] = 4 * 1024 ** 3
(DATA / "uploads").mkdir(parents=True, exist_ok=True)
(DATA / "thumbs").mkdir(exist_ok=True)
(DATA / "outputs").mkdir(exist_ok=True)


def _upload_path(photo_id):
    if not ID_RE.match(photo_id):
        abort(404)
    found = next((DATA / "uploads").glob(f"{photo_id}.*"), None)
    if not found:
        abort(404)
    return found


@app.get("/")
def index():
    return send_file(ROOT / "templates" / "index.html")


@app.post("/api/upload")
def upload():
    from PIL import Image, ImageOps
    out = []
    for f in request.files.getlist("files"):
        ext = Path(f.filename or "").suffix.lower()
        if ext not in ALLOWED:
            out.append({"name": f.filename, "error": f"unsupported file type {ext or '(none)'}"})
            continue
        pid = uuid.uuid4().hex
        path = DATA / "uploads" / f"{pid}{ext}"
        f.save(path)
        try:
            with Image.open(path) as im:
                thumb = ImageOps.exif_transpose(im)
                thumb.thumbnail((360, 360))
                thumb.convert("RGB").save(DATA / "thumbs" / f"{pid}.jpg", quality=80)
        except Exception:
            path.unlink(missing_ok=True)
            out.append({"name": f.filename, "error": "could not read image"})
            continue
        out.append({"id": pid, "name": f.filename, "meta": exiftools.read_meta(path)})
    return jsonify(out)


@app.get("/api/thumb/<photo_id>")
def thumb(photo_id):
    if not ID_RE.match(photo_id):
        abort(404)
    return send_file(DATA / "thumbs" / f"{photo_id}.jpg", mimetype="image/jpeg")


@app.get("/api/search")
def search():
    q = request.args.get("q", "").strip()
    if not q:
        return jsonify([])
    try:
        return jsonify(geo.search(q))
    except Exception as e:
        return jsonify({"error": f"address search failed (offline?): {e}"}), 502


@app.get("/api/reverse")
def reverse():
    try:
        lat, lon = float(request.args["lat"]), float(request.args["lon"])
    except (KeyError, ValueError):
        return jsonify({"error": "lat and lon required"}), 400
    hit = geo.reverse(lat, lon)
    return jsonify(hit or {"error": "address lookup failed (offline?)"}), (200 if hit else 502)


def _location(item, meta, overwrite_gps, radius_m=0.0):
    """Existing EXIF GPS wins unless the user chose to overwrite it."""
    if meta["lat"] is not None and not overwrite_gps:
        return meta["lat"], meta["lon"], None, None
    if item.get("lat") is None or item.get("lon") is None:
        return None
    lat, lon = float(item["lat"]), float(item["lon"])
    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        raise ValueError("coordinates out of range")
    eff_radius = float(item.get("radius_m") or radius_m or 0.0)
    if eff_radius > 0 and not item.get("is_randomized"):
        lat, lon = geo.randomize_coords(lat, lon, eff_radius)
    return lat, lon, item.get("title") or "", item.get("address") or ""


def _fill_address(lat, lon, title, address):
    if title is None or (not title and not address):
        hit = geo.reverse(lat, lon) or {}
        return hit.get("title", ""), hit.get("address", "")
    return title, address


@app.post("/api/preview")
def preview():
    body = request.get_json(force=True)
    item, opts = body["item"], Options.from_dict(body.get("options"))
    src = _upload_path(item["id"])
    loc = _location(item, exiftools.read_meta(src), bool(body.get("overwrite_gps")), opts.radius_m)
    if not loc:
        return jsonify({"error": "no location for this photo"}), 400
    lat, lon, title, address = loc
    title, address = _fill_address(lat, lon, title, address)
    data = process_photo(src, None, lat, lon, title, address, opts, max_side=1400,
                         custom_datetime=item.get("datetime"))
    return send_file(io.BytesIO(data), mimetype="image/jpeg")


@app.post("/api/process")
def process():
    body = request.get_json(force=True)
    try:
        opts = Options.from_dict(body.get("options"))
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    overwrite = bool(body.get("overwrite_gps"))
    batch = uuid.uuid4().hex
    out_dir = DATA / "outputs" / batch
    out_dir.mkdir()
    results, used = [], set()
    items = body.get("items", [])
    total_items = len(items)

    for idx, item in enumerate(items):
        res = {"id": item.get("id"), "name": item.get("name", ""), "status": "ok"}
        try:
            src = _upload_path(item["id"])
            meta = exiftools.read_meta(src)
            loc = _location(item, meta, overwrite, opts.radius_m)
            if not loc:
                res.update(status="skipped", detail="no location (no EXIF GPS and none assigned)")
                results.append(res)
                continue
            lat, lon, title, address = loc
            if opts.overlay:
                title, address = _fill_address(lat, lon, title, address)
            stem = re.sub(r"[^\w.\- ]", "_", Path(item.get("name") or src.stem).stem)
            name, n = f"{stem}_geotagged.jpg", 1
            while name in used:
                n += 1
                name = f"{stem}_geotagged_{n}.jpg"
            used.add(name)
            info = process_photo(src, out_dir / name, lat, lon, title, address, opts,
                                 index=idx, total=total_items, custom_datetime=item.get("datetime"))
            res.update(output=name, lat=lat, lon=lon, address=address or "", taken=info["taken"])
        except Exception as e:
            res.update(status="error", detail=str(e))
        results.append(res)

    with zipfile.ZipFile(out_dir / "geotagged.zip", "w", zipfile.ZIP_STORED) as z:
        for r in results:
            if r["status"] == "ok":
                z.write(out_dir / r["output"], r["output"])
        rep = io.StringIO()
        cols = ["name", "status", "detail", "output", "lat", "lon", "taken", "address"]
        w = csv.DictWriter(rep, cols, extrasaction="ignore")
        w.writeheader()
        w.writerows(results)
        z.writestr("report.csv", rep.getvalue())
    return jsonify({"batch": batch, "results": results})


@app.get("/api/download/<batch>")
def download(batch):
    if not ID_RE.match(batch):
        abort(404)
    return send_file(DATA / "outputs" / batch / "geotagged.zip", as_attachment=True,
                     download_name="geotagged_photos.zip")


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=False)
