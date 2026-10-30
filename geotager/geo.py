"""Address lookup (OpenStreetMap Nominatim) and map tiles (OSM tile server)."""
import io
import json
import math
import os
import threading
import time
import urllib.parse
import urllib.request

from PIL import Image

NOMINATIM = os.environ.get("NOMINATIM_URL", "https://nominatim.openstreetmap.org")
TILE_URL = os.environ.get("TILE_URL", "https://tile.openstreetmap.org/{z}/{x}/{y}.png")
USER_AGENT = "GEO-TAGER/1.0 (local photo geotagging tool)"
TIMEOUT = 6

_lock = threading.Lock()
_last_call = 0.0
_cache = {}


def _get(url):
    """HTTP GET honouring Nominatim's one-request-per-second policy."""
    global _last_call
    with _lock:
        wait = 1.1 - (time.time() - _last_call)
        if wait > 0 and "nominatim" in url:
            time.sleep(wait)
        _last_call = time.time()
        req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
            return resp.read()


def _title(addr):
    place = next((addr[k] for k in ("city", "town", "village", "suburb", "county")
                  if addr.get(k)), "")
    return ", ".join(p for p in (place, addr.get("state"), addr.get("country")) if p)


def _shape(hit):
    return {"lat": round(float(hit["lat"]), 6), "lon": round(float(hit["lon"]), 6),
            "title": _title(hit.get("address", {})), "address": hit.get("display_name", "")}


def reverse(lat, lon):
    """Coordinates -> {title, address}. Returns None when the lookup fails."""
    key = ("r", round(lat, 5), round(lon, 5))
    if key not in _cache:
        qs = urllib.parse.urlencode({"format": "jsonv2", "lat": lat, "lon": lon,
                                     "zoom": 18, "addressdetails": 1})
        try:
            _cache[key] = _shape(json.loads(_get(f"{NOMINATIM}/reverse?{qs}")))
        except Exception:
            return None
    return _cache[key]


def search(query, limit=5):
    qs = urllib.parse.urlencode({"format": "jsonv2", "q": query, "limit": limit,
                                 "addressdetails": 1})
    return [_shape(h) for h in json.loads(_get(f"{NOMINATIM}/search?{qs}"))]


def _tile_xy(lat, lon, zoom):
    n = 2 ** zoom
    x = (lon + 180) / 360 * n
    y = (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n
    return x, y


def map_image(lat, lon, size, zoom=17):
    """Square map centred on the point, or None when tiles are unreachable."""
    fx, fy = _tile_xy(lat, lon, zoom)
    tx, ty = int(fx), int(fy)
    canvas = Image.new("RGB", (768, 768), (200, 200, 200))
    try:
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                key = ("t", zoom, tx + dx, ty + dy)
                if key not in _cache:
                    _cache[key] = _get(TILE_URL.format(z=zoom, x=tx + dx, y=ty + dy))
                tile = Image.open(io.BytesIO(_cache[key])).convert("RGB")
                canvas.paste(tile, ((dx + 1) * 256, (dy + 1) * 256))
    except Exception:
        return None
    cx, cy = int((fx - tx + 1) * 256), int((fy - ty + 1) * 256)
    half = 180
    return canvas.crop((cx - half, cy - half, cx + half, cy + half)).resize((size, size))
