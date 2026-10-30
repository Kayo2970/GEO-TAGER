// Pure helpers (no DOM): shared by app.js and the node tests.
(function (root) {
  const pad = (n, w = 2) => String(n).padStart(w, '0');

  function parseOffset(text) {
    const m = /^([+-])(\d{2}):(\d{2})$/.exec((text || '').trim());
    if (!m) throw new Error(`bad UTC offset "${text}", expected like +05:30`);
    return (m[1] === '-' ? -1 : 1) * (parseInt(m[2]) * 60 + parseInt(m[3]));   // minutes
  }

  // Wall-clock strings are handled as UTC-based Dates purely for arithmetic.
  const parseLocal = iso => new Date(iso.length === 16 ? iso + ':00Z' : iso + 'Z');
  const toIsoLocal = d => d.toISOString().slice(0, 19);
  const toExifTime = d => toIsoLocal(d).replace(/-/g, ':').replace('T', ' ');
  const fromExifTime = s => /^\d{4}:\d{2}:\d{2} \d{2}:\d{2}:\d{2}$/.test(s) ? s.slice(0, 10).replace(/:/g, '-') + 'T' + s.slice(11) : null;

  function toDms(v) {
    const total = Math.round(Math.abs(v) * 3600 * 10000);
    const deg = Math.floor(total / 36000000), rest = total % 36000000;
    return [[deg, 1], [Math.floor(rest / 600000), 1], [rest % 600000, 10000]];
  }
  const toDeg = (dms, ref) => {
    const d = dms.reduce((a, [n, dd], i) => a + n / dd / 60 ** i, 0);
    return ref === 'S' || ref === 'W' ? -d : d;
  };

  // opts: {time_mode: keep|shift|fill, shift_minutes, fill_datetime, tz}
  function resolveTime(meta, opts) {
    let taken = meta.datetime ? parseLocal(meta.datetime) : null;
    if (opts.time_mode === 'shift' && taken) taken = new Date(taken.getTime() + opts.shift_minutes * 60000);
    else if (opts.time_mode === 'fill' && !taken && opts.fill_datetime) taken = parseLocal(opts.fill_datetime);
    return { taken, offset: meta.offset || opts.tz };
  }

  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  function formatWhen(taken, offset) {
    const h = taken.getUTCHours();
    return `${DAYS[taken.getUTCDay()]}, ${pad(taken.getUTCDate())}/${pad(taken.getUTCMonth() + 1)}/${taken.getUTCFullYear()} ` +
           `${pad(h % 12 || 12)}:${pad(taken.getUTCMinutes())} ${h < 12 ? 'AM' : 'PM'} GMT${offset}`;
  }

  // Latitude/longitude/time -> EXIF object additions (piexif structure).
  function applyTags(ex, piexif, lat, lon, taken, offset, reencoded) {
    ex['1st'] = {}; ex.thumbnail = null;
    ex['0th'][piexif.ImageIFD.Software] = 'GEO-TAGER';
    if (reencoded) ex['0th'][piexif.ImageIFD.Orientation] = 1;
    Object.assign(ex.GPS, {
      [piexif.GPSIFD.GPSVersionID]: [2, 3, 0, 0],
      [piexif.GPSIFD.GPSLatitudeRef]: lat >= 0 ? 'N' : 'S',
      [piexif.GPSIFD.GPSLatitude]: toDms(lat),
      [piexif.GPSIFD.GPSLongitudeRef]: lon >= 0 ? 'E' : 'W',
      [piexif.GPSIFD.GPSLongitude]: toDms(lon),
    });
    if (taken) {
      const stamp = toExifTime(taken);
      ex.Exif[piexif.ExifIFD.DateTimeOriginal] = stamp;
      ex.Exif[piexif.ExifIFD.DateTimeDigitized] = stamp;
      ex['0th'][piexif.ImageIFD.DateTime] = stamp;
      ex.Exif[36881] = offset;                                  // OffsetTimeOriginal
      const utc = new Date(taken.getTime() - parseOffset(offset) * 60000);
      ex.GPS[piexif.GPSIFD.GPSDateStamp] = toExifTime(utc).slice(0, 10);
      ex.GPS[piexif.GPSIFD.GPSTimeStamp] = [[utc.getUTCHours(), 1], [utc.getUTCMinutes(), 1], [utc.getUTCSeconds(), 1]];
    }
    return ex;
  }

  const api = { parseOffset, parseLocal, toExifTime, fromExifTime, toDms, toDeg, resolveTime, formatWhen, applyTags };
  if (typeof module !== 'undefined') module.exports = api; else root.GeoLib = api;
})(typeof window !== 'undefined' ? window : globalThis);
