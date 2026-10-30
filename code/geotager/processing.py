"""Apply location, time and overlay options to one photo."""
import io
import random
import shutil
from dataclasses import dataclass
from datetime import datetime, timedelta

import piexif
from PIL import Image, ImageOps

from . import exiftools as ex
from .overlay import draw_overlay


@dataclass
class Options:
    overlay: bool = False
    time_mode: str = "keep"            # keep | shift | fill | static | range
    shift_minutes: int = 0             # clock correction for time_mode == "shift"
    fill_datetime: str = ""            # used for time_mode == "fill" on photos with no time
    static_datetime: str = ""          # used for time_mode == "static"
    range_start: str = ""              # used for time_mode == "range"
    range_end: str = ""                # used for time_mode == "range"
    range_distribution: str = "random" # "random" or "spread"
    overwrite_time: bool = False       # overwrite existing capture time
    radius_m: float = 0.0              # coordinate jitter radius in meters
    tz: str = "+05:30"                 # UTC offset when the photo has none recorded

    @classmethod
    def from_dict(cls, d):
        d = d or {}
        o = cls(
            overlay=bool(d.get("overlay")),
            time_mode=d.get("time_mode", "keep"),
            shift_minutes=int(d.get("shift_minutes") or 0),
            fill_datetime=d.get("fill_datetime") or "",
            static_datetime=d.get("static_datetime") or "",
            range_start=d.get("range_start") or "",
            range_end=d.get("range_end") or "",
            range_distribution=d.get("range_distribution") or "random",
            overwrite_time=bool(d.get("overwrite_time")),
            radius_m=float(d.get("radius_m") or 0.0),
            tz=d.get("tz") or "+05:30",
        )
        ex.parse_offset(o.tz)
        if o.time_mode not in ("keep", "shift", "fill", "static", "range"):
            raise ValueError("time_mode must be keep, shift, fill, static or range")
        return o


def resolve_time(meta, opts, index=0, total=1, custom_datetime=None):
    """Capture time to record: (datetime | None, utc offset string)."""
    if custom_datetime:
        taken = datetime.fromisoformat(custom_datetime) if isinstance(custom_datetime, str) else custom_datetime
        return taken, meta["offset"] or opts.tz

    taken = datetime.fromisoformat(meta["datetime"]) if meta["datetime"] else None
    if opts.time_mode == "shift" and taken:
        taken += timedelta(minutes=opts.shift_minutes)
    elif opts.time_mode == "fill" and taken is None and opts.fill_datetime:
        taken = datetime.fromisoformat(opts.fill_datetime)
    elif opts.time_mode == "static":
        if opts.overwrite_time or taken is None:
            if opts.static_datetime:
                taken = datetime.fromisoformat(opts.static_datetime)
    elif opts.time_mode == "range":
        if opts.overwrite_time or taken is None:
            if opts.range_start and opts.range_end:
                t0 = datetime.fromisoformat(opts.range_start)
                t1 = datetime.fromisoformat(opts.range_end)
                if t0 > t1:
                    t0, t1 = t1, t0
                delta_sec = (t1 - t0).total_seconds()
                if opts.range_distribution == "spread" and total > 1:
                    offset_sec = delta_sec * (index / (total - 1))
                else:
                    offset_sec = delta_sec * random.random()
                taken = t0 + timedelta(seconds=offset_sec)
    return taken, meta["offset"] or opts.tz


def process_photo(src, dst, lat, lon, title, address, opts, max_side=None,
                  index=0, total=1, custom_datetime=None):
    """Write a geotagged copy of `src` to `dst` (a path, or None to return JPEG bytes).

    Original files are never modified. Without an overlay a JPEG is not re-encoded.
    """
    meta = ex.read_meta(src)
    taken, offset = resolve_time(meta, opts, index=index, total=total, custom_datetime=custom_datetime)
    inplace = ex.is_jpeg(src) and not opts.overlay and not max_side

    exif_bytes = ex.build_exif(src, lat, lon, taken, offset, reencoded=not inplace)
    if inplace and dst:
        shutil.copyfile(src, dst)
        piexif.insert(exif_bytes, str(dst))
        return {"taken": taken.isoformat() if taken else None}

    with Image.open(src) as im:
        img = ImageOps.exif_transpose(im)
        if max_side:
            img.thumbnail((max_side, max_side))
        if opts.overlay:
            img = draw_overlay(img, lat, lon, title, address, taken, offset)
        out = io.BytesIO() if dst is None else dst
        img.convert("RGB").save(out, "JPEG", quality=95, exif=exif_bytes)
    return out.getvalue() if dst is None else {"taken": taken.isoformat() if taken else None}
