"""Read and write EXIF capture time and GPS data."""
from datetime import datetime, timedelta
from pathlib import Path

import piexif
from PIL import Image

EXIF_FMT = "%Y:%m:%d %H:%M:%S"


def parse_offset(text):
    """'+05:30' -> timedelta; raises ValueError on bad input."""
    text = (text or "").strip()
    if len(text) != 6 or text[0] not in "+-" or text[3] != ":":
        raise ValueError(f"bad UTC offset {text!r}, expected like +05:30")
    delta = timedelta(hours=int(text[1:3]), minutes=int(text[4:6]))
    return -delta if text[0] == "-" else delta


def _text(raw):
    return raw.decode("ascii", "ignore").strip("\x00 ") if isinstance(raw, bytes) else None


def _to_deg(dms, ref):
    deg = sum(n / d / 60 ** i for i, (n, d) in enumerate(dms))
    return -deg if ref in (b"S", b"W") else deg


def _to_dms(value):
    """Decimal degrees -> EXIF rational triple (accurate to 1/10000 arc-second)."""
    total = round(abs(value) * 3600 * 10000)
    deg, rest = divmod(total, 3600 * 10000)
    minute, sec = divmod(rest, 60 * 10000)
    return ((deg, 1), (minute, 1), (sec, 10000))


def read_meta(path):
    """Return capture time, UTC offset, GPS, camera and size for an image."""
    meta = dict(datetime=None, offset=None, lat=None, lon=None,
                make=None, model=None, width=None, height=None)
    try:
        with Image.open(path) as im:
            meta["width"], meta["height"] = im.size
    except Exception:
        return meta
    try:
        ex = piexif.load(str(path))
    except Exception:
        return meta

    orientation = ex["0th"].get(piexif.ImageIFD.Orientation, 1)
    if orientation in (5, 6, 7, 8):
        meta["width"], meta["height"] = meta["height"], meta["width"]

    raw = (ex["Exif"].get(piexif.ExifIFD.DateTimeOriginal)
           or ex["Exif"].get(piexif.ExifIFD.DateTimeDigitized)
           or ex["0th"].get(piexif.ImageIFD.DateTime))
    try:
        meta["datetime"] = datetime.strptime(_text(raw), EXIF_FMT).isoformat()
    except (TypeError, ValueError):
        pass
    meta["offset"] = _text(ex["Exif"].get(piexif.ExifIFD.OffsetTimeOriginal)
                           or ex["Exif"].get(piexif.ExifIFD.OffsetTime)) or None
    meta["make"] = _text(ex["0th"].get(piexif.ImageIFD.Make))
    meta["model"] = _text(ex["0th"].get(piexif.ImageIFD.Model))

    gps = ex["GPS"]
    try:
        lat = _to_deg(gps[piexif.GPSIFD.GPSLatitude], gps[piexif.GPSIFD.GPSLatitudeRef])
        lon = _to_deg(gps[piexif.GPSIFD.GPSLongitude], gps[piexif.GPSIFD.GPSLongitudeRef])
        if (lat, lon) != (0, 0):
            meta["lat"], meta["lon"] = round(lat, 6), round(lon, 6)
    except (KeyError, ZeroDivisionError, TypeError):
        pass
    return meta


def build_exif(path, lat, lon, taken, offset, reencoded):
    """EXIF bytes: the photo's existing tags plus GPS and (optionally) time."""
    try:
        ex = piexif.load(str(path))
    except Exception:
        ex = {"0th": {}, "Exif": {}, "GPS": {}, "Interop": {}, "1st": {}, "thumbnail": None}
    ex["1st"], ex["thumbnail"] = {}, None
    ex["0th"][piexif.ImageIFD.Software] = b"GEO-TAGER"
    if reencoded:
        ex["0th"][piexif.ImageIFD.Orientation] = 1

    ex["GPS"].update({
        piexif.GPSIFD.GPSVersionID: (2, 3, 0, 0),
        piexif.GPSIFD.GPSLatitudeRef: b"N" if lat >= 0 else b"S",
        piexif.GPSIFD.GPSLatitude: _to_dms(lat),
        piexif.GPSIFD.GPSLongitudeRef: b"E" if lon >= 0 else b"W",
        piexif.GPSIFD.GPSLongitude: _to_dms(lon),
    })
    if taken:
        stamp = taken.strftime(EXIF_FMT).encode()
        ex["Exif"][piexif.ExifIFD.DateTimeOriginal] = stamp
        ex["Exif"][piexif.ExifIFD.DateTimeDigitized] = stamp
        ex["0th"][piexif.ImageIFD.DateTime] = stamp
        ex["Exif"][piexif.ExifIFD.OffsetTimeOriginal] = offset.encode()
        utc = taken - parse_offset(offset)
        ex["GPS"][piexif.GPSIFD.GPSDateStamp] = utc.strftime("%Y:%m:%d").encode()
        ex["GPS"][piexif.GPSIFD.GPSTimeStamp] = ((utc.hour, 1), (utc.minute, 1), (utc.second, 1))
    return piexif.dump(ex)


def is_jpeg(path):
    return Path(path).suffix.lower() in (".jpg", ".jpeg")
