import io
import sys
from datetime import datetime
from pathlib import Path

import piexif
import pytest
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from geotager import exiftools as ex, geo  # noqa: E402
from geotager.processing import Options, process_photo  # noqa: E402


@pytest.fixture(autouse=True)
def no_network(monkeypatch):
    monkeypatch.setattr(geo, "map_image", lambda *a, **k: None)
    monkeypatch.setattr(geo, "reverse", lambda *a, **k: {"title": "Bengaluru, Karnataka, India",
                                                         "address": "Amruth Nagar Main Road, Konanakunte"})


def make_jpeg(path, taken=None, size=(800, 600)):
    exif = {"0th": {}, "Exif": {}, "GPS": {}, "1st": {}, "thumbnail": None}
    if taken:
        exif["Exif"][piexif.ExifIFD.DateTimeOriginal] = taken.encode()
    Image.new("RGB", size, (90, 120, 160)).save(path, "JPEG", exif=piexif.dump(exif))
    return path


def test_dms_roundtrip():
    for v in (12.88802, -77.564133, 0.000001, 179.999999):
        d = ex._to_dms(v)
        ref = b"S" if v < 0 else b"N"
        assert abs(ex._to_deg(d, ref) - v) < 1e-6


def test_read_meta_empty_and_with_time(tmp_path):
    m = ex.read_meta(make_jpeg(tmp_path / "a.jpg", "2026:10:27 09:51:00"))
    assert m["datetime"] == "2026-10-27T09:51:00" and m["lat"] is None
    assert ex.read_meta(make_jpeg(tmp_path / "b.jpg"))["datetime"] is None


def test_tag_without_overlay_keeps_pixels_and_writes_gps(tmp_path):
    src = make_jpeg(tmp_path / "a.jpg", "2026:10:27 09:51:00")
    dst = tmp_path / "out.jpg"
    process_photo(src, dst, 12.88802, 77.564133, "", "", Options())
    m = ex.read_meta(dst)
    assert (m["lat"], m["lon"]) == (12.88802, 77.564133)
    assert m["datetime"] == "2026-10-27T09:51:00" and m["offset"] == "+05:30"
    assert Image.open(dst).tobytes() == Image.open(src).tobytes()  # not re-encoded
    gps = piexif.load(str(dst))["GPS"]
    assert gps[piexif.GPSIFD.GPSTimeStamp] == ((4, 1), (21, 1), (0, 1))  # 09:51 IST = 04:21 UTC


def test_southern_western_hemisphere(tmp_path):
    dst = tmp_path / "o.jpg"
    process_photo(make_jpeg(tmp_path / "a.jpg"), dst, -33.8688, -151.2093, "", "", Options())
    m = ex.read_meta(dst)
    assert (m["lat"], m["lon"]) == (-33.8688, -151.2093)


def test_time_shift_and_fill(tmp_path):
    src = make_jpeg(tmp_path / "a.jpg", "2026:10:27 09:51:00")
    dst = tmp_path / "o.jpg"
    process_photo(src, dst, 1, 1, "", "", Options(time_mode="shift", shift_minutes=-90))
    assert ex.read_meta(dst)["datetime"] == "2026-10-27T08:21:00"

    nt = make_jpeg(tmp_path / "n.jpg")
    process_photo(nt, dst, 1, 1, "", "", Options())  # keep: still no time
    assert ex.read_meta(dst)["datetime"] is None
    process_photo(nt, dst, 1, 1, "", "", Options(time_mode="fill", fill_datetime="2026-10-27T10:00:00"))
    assert ex.read_meta(dst)["datetime"] == "2026-10-27T10:00:00"
    # fill must not touch a photo that already has a time
    process_photo(src, dst, 1, 1, "", "", Options(time_mode="fill", fill_datetime="2030-01-01T00:00:00"))
    assert ex.read_meta(dst)["datetime"] == "2026-10-27T09:51:00"


@pytest.mark.parametrize("size", [(2000, 1500), (900, 1600), (400, 300)])
def test_overlay_draws_in_bottom_band_only(tmp_path, size):
    src = make_jpeg(tmp_path / "a.jpg", "2026:10:27 09:51:00", size)
    dst = tmp_path / "o.jpg"
    process_photo(src, dst, 12.88802, 77.564133, "Bengaluru, Karnataka, India",
                  "Amruth Nagar Main Road, Konanakunte, Bengaluru", Options(overlay=True))
    out, orig = Image.open(dst), Image.open(src)
    assert out.size == orig.size
    assert out.crop((0, 0, size[0], size[1] // 4)).tobytes() != b""
    top_diff = sum(abs(a - b) for a, b in zip(out.getpixel((5, 5)), orig.getpixel((5, 5))))
    assert top_diff < 12  # only JPEG noise at the top
    assert out.getpixel((size[0] // 2, size[1] - 3)) != orig.getpixel((size[0] // 2, size[1] - 3))
    assert ex.read_meta(dst)["lat"] == 12.88802


def test_png_is_converted_to_tagged_jpeg(tmp_path):
    src = tmp_path / "a.png"
    Image.new("RGB", (300, 200), "white").save(src)
    dst = tmp_path / "o.jpg"
    process_photo(src, dst, 10, 20, "", "", Options())
    assert ex.read_meta(dst)["lat"] == 10


def test_bad_offset_rejected():
    with pytest.raises(ValueError):
        Options.from_dict({"tz": "IST"})
    with pytest.raises(ValueError):
        Options.from_dict({"time_mode": "random"})


def test_http_flow(tmp_path, monkeypatch):
    import app as app_mod
    monkeypatch.setattr(app_mod, "DATA", tmp_path)
    for d in ("uploads", "thumbs", "outputs"):
        (tmp_path / d).mkdir()
    c = app_mod.app.test_client()

    jpg = io.BytesIO()
    Image.new("RGB", (400, 300), "gray").save(jpg, "JPEG")
    gps_src = make_jpeg(tmp_path / "g.jpg")
    process_photo(gps_src, tmp_path / "has_gps.jpg", 28.6, 77.2, "", "", Options())

    r = c.post("/api/upload", data={"files": [(io.BytesIO(jpg.getvalue()), "plain.jpg"),
                                              (io.BytesIO(b"x"), "evil.exe"),
                                              ((tmp_path / "has_gps.jpg").open("rb"), "has_gps.jpg")]},
               content_type="multipart/form-data")
    res = r.get_json()
    assert "unsupported" in res[1]["error"]
    plain, withgps = res[0], res[2]
    assert withgps["meta"]["lat"] == 28.6

    body = {"items": [{"id": plain["id"], "name": "plain.jpg", "lat": 12.9, "lon": 77.5, "title": "T", "address": "A"},
                      {"id": withgps["id"], "name": "has_gps.jpg", "lat": 12.9, "lon": 77.5, "title": "T", "address": "A"},
                      {"id": plain["id"], "name": "plain.jpg"}], "options": {}}
    out = c.post("/api/process", json=body).get_json()
    assert [x["status"] for x in out["results"]] == ["ok", "ok", "skipped"]
    assert out["results"][1]["lat"] == 28.6          # existing GPS kept
    body["overwrite_gps"] = True
    assert c.post("/api/process", json=body).get_json()["results"][1]["lat"] == 12.9

    z = c.get(f"/api/download/{out['batch']}")
    assert z.status_code == 200 and z.data[:2] == b"PK"
    assert c.get("/api/download/../../etc").status_code == 404
    assert c.get("/api/thumb/not-an-id").status_code == 404

    p = c.post("/api/preview", json={"item": body["items"][0], "options": {"overlay": True}})
    assert p.status_code == 200 and p.mimetype == "image/jpeg"
