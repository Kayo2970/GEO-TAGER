"""Address lookup (OpenStreetMap Nominatim) and map tiles (OSM tile server)."""
import io
import json
import math
import os
import random
import threading
import time
import urllib.parse
import urllib.request

from PIL import Image

NOMINATIM = os.environ.get("NOMINATIM_URL", "https://nominatim.openstreetmap.org")
GOOGLE_SATELLITE = "https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}"
TILE_URL = os.environ.get("TILE_URL", GOOGLE_SATELLITE)
USER_AGENT = "GEO-TAGER/1.0 (local photo geotagging tool)"
BROWSER_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
TIMEOUT = 6

_lock = threading.Lock()
_last_call = 0.0
_cache = {}


def randomize_coords(lat, lon, radius_meters):
    """Generate a random coordinate uniformly distributed within radius_meters around (lat, lon)."""
    if radius_meters <= 0:
        return round(float(lat), 6), round(float(lon), 6)
    r = radius_meters * math.sqrt(random.random())
    theta = random.random() * 2 * math.pi
    dx = r * math.cos(theta)
    dy = r * math.sin(theta)
    dlat = dy / 111139.0
    cos_lat = math.cos(math.radians(lat))
    if abs(cos_lat) < 1e-6:
        cos_lat = 1e-6 if cos_lat >= 0 else -1e-6
    dlon = dx / (111139.0 * cos_lat)
    new_lat = max(-90.0, min(90.0, lat + dlat))
    new_lon = ((lon + dlon + 180.0) % 360.0) - 180.0
    return round(new_lat, 6), round(new_lon, 6)


def distance_meters(lat1, lon1, lat2, lon2):
    """Haversine distance in meters between two lat/lon points."""
    r = 6371000.0  # Earth radius in meters
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2.0) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2.0) ** 2
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return r * c


def _get(url):
    """HTTP GET honouring Nominatim's one-request-per-second policy."""
    global _last_call
    with _lock:
        wait = 1.1 - (time.time() - _last_call)
        if wait > 0 and "nominatim" in url:
            time.sleep(wait)
        _last_call = time.time()
        ua = USER_AGENT if "nominatim" in url else BROWSER_UA
        req = urllib.request.Request(url, headers={"User-Agent": ua})
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
