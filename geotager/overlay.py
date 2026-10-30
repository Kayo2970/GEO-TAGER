"""Draws the location/time stamp (map thumbnail + address block) on a photo."""
from datetime import datetime

from PIL import Image, ImageDraw, ImageFont

from . import geo

_FONTS = {
    False: ["/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
            "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
            "DejaVuSans.ttf", "Arial.ttf"],
    True: ["/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
           "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
           "DejaVuSans-Bold.ttf", "Arial Bold.ttf"],
}
NOTE = "Note : Location and time added after capture (GEO-TAGER)"


def _font(size, bold=False):
    for name in _FONTS[bold]:
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default(size)


def _wrap(draw, text, font, width, max_lines):
    lines, line = [], ""
    for word in text.split():
        trial = f"{line} {word}".strip()
        if line and draw.textlength(trial, font=font) > width:
            lines.append(line)
            line = word
        else:
            line = trial
    lines.append(line)
    if len(lines) > max_lines:
        lines = lines[:max_lines]
        lines[-1] = lines[-1].rstrip(",. ") + "..."
    return [l for l in lines if l]


def _pin(draw, x, y, r):
    draw.polygon([(x - r * 0.6, y - r * 0.9), (x + r * 0.6, y - r * 0.9), (x, y)], fill=(214, 40, 40))
    draw.ellipse([x - r, y - r * 2.2, x + r, y - r * 0.2], fill=(214, 40, 40),
                 outline="white", width=max(1, int(r / 5)))
    draw.ellipse([x - r * 0.35, y - r * 1.55, x + r * 0.35, y - r * 0.85], fill="white")


def _when(taken, offset):
    return f"{taken.strftime('%A, %d/%m/%Y %I:%M %p')} GMT{offset}"


def draw_overlay(img, lat, lon, title, address, taken, offset):
    """Return a new RGB image with the stamp drawn along the bottom edge."""
    img = img.convert("RGB")
    w, h = img.size
    s = max(0.35, w / 2000)
    pad, map_px = int(45 * s), int(330 * s)
    band_h = map_px + 2 * pad

    shade = Image.new("RGBA", (w, band_h), (0, 0, 0, 120))
    base = img.convert("RGBA")
    base.alpha_composite(shade, (0, h - band_h))
    draw = ImageDraw.Draw(base)

    tile = geo.map_image(lat, lon, map_px)
    top = h - band_h + pad
    if tile is None:
        tile = Image.new("RGB", (map_px, map_px), (70, 80, 90))
        ImageDraw.Draw(tile).text((map_px / 2, map_px - 24 * s), "map unavailable",
                                  fill=(200, 200, 200), font=_font(int(22 * s)), anchor="mm")
    base.paste(tile, (pad, top))
    _pin(draw, pad + map_px / 2, top + map_px / 2, 18 * s)

    x = pad + map_px + pad
    width = w - x - pad
    f_title, f_body, f_note = _font(int(58 * s), True), _font(int(40 * s)), _font(int(32 * s))
    y = top - int(6 * s)
    lines = [(t, f_title) for t in _wrap(draw, title or f"{lat:.5f}, {lon:.5f}", f_title, width, 1)]
    lines += [(t, f_body) for t in _wrap(draw, address or "", f_body, width, 2)]
    lines.append((f"Lat {lat:.6f}, Long {lon:.6f}", f_body))
    if taken:
        lines.append((_when(taken, offset), f_body))
    lines.append((NOTE, f_note))
    for text, font in lines:
        draw.text((x, y), text, fill="white", font=font, stroke_width=max(1, int(s)),
                  stroke_fill=(0, 0, 0))
        y += int(font.size * 1.3)
    return base.convert("RGB")
