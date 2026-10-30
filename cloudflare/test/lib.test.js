const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('../public/lib.js');
const piexif = require('piexifjs');
piexif.TAGS.Exif[36881] = { name: 'OffsetTimeOriginal', type: 'Ascii' };

test('dms round trip incl. hemispheres', () => {
  for (const [v, ref] of [[12.88802, 'N'], [-77.564133, 'W'], [0.000001, 'N'], [-33.8688, 'S']])
    assert.ok(Math.abs(G.toDeg(G.toDms(v), ref) - v) < 1e-6, String(v));
});

test('offset parsing', () => {
  assert.equal(G.parseOffset('+05:30'), 330);
  assert.equal(G.parseOffset('-08:00'), -480);
  assert.throws(() => G.parseOffset('IST'));
});

test('time shift, fill, keep', () => {
  const has = { datetime: '2026-10-27T09:51:00', offset: null }, none = { datetime: null, offset: null };
  const o = (extra) => ({ time_mode: 'keep', shift_minutes: 0, fill_datetime: '', tz: '+05:30', ...extra });
  assert.equal(G.toExifTime(G.resolveTime(has, o({ time_mode: 'shift', shift_minutes: -90 })).taken), '2026:10:27 08:21:00');
  assert.equal(G.resolveTime(none, o()).taken, null);
  assert.equal(G.toExifTime(G.resolveTime(none, o({ time_mode: 'fill', fill_datetime: '2026-10-27T10:00' })).taken), '2026:10:27 10:00:00');
  assert.equal(G.toExifTime(G.resolveTime(has, o({ time_mode: 'fill', fill_datetime: '2030-01-01T00:00' })).taken), '2026:10:27 09:51:00');
  assert.equal(G.resolveTime({ ...has, offset: '+01:00' }, o()).offset, '+01:00');
});

test('overlay date format matches reference stamp', () => {
  assert.equal(G.formatWhen(G.parseLocal('2026-10-27T09:51:00'), '+05:30'), 'Tuesday, 27/10/2026 09:51 AM GMT+05:30');
  assert.equal(G.formatWhen(G.parseLocal('2026-10-27T00:05:00'), '+05:30'), 'Tuesday, 27/10/2026 12:05 AM GMT+05:30');
  assert.equal(G.formatWhen(G.parseLocal('2026-10-27T13:05:00'), '+05:30'), 'Tuesday, 27/10/2026 01:05 PM GMT+05:30');
});

test('applyTags writes a valid EXIF block that piexif reads back', () => {
  const jpeg = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/yQALCAABAAEBAREA/8wAFAABAAAAAAAAAAAAAAAAAAAACv/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==';
  const ex = { '0th': {}, Exif: {}, GPS: {}, Interop: {}, '1st': {}, thumbnail: null };
  G.applyTags(ex, piexif, 12.88802, 77.564133, G.parseLocal('2026-10-27T09:51:00'), '+05:30', false);
  const back = piexif.load(piexif.insert(piexif.dump(ex), jpeg));
  assert.equal(back.GPS[piexif.GPSIFD.GPSLatitudeRef], 'N');
  assert.ok(Math.abs(G.toDeg(back.GPS[piexif.GPSIFD.GPSLatitude], 'N') - 12.88802) < 1e-6);
  assert.equal(back.Exif[piexif.ExifIFD.DateTimeOriginal], '2026:10:27 09:51:00');
  assert.equal(back.Exif[36881], '+05:30');
  assert.deepEqual(back.GPS[piexif.GPSIFD.GPSTimeStamp], [[4, 1], [21, 1], [0, 1]]);   // 09:51 IST = 04:21 UTC
  assert.equal(back['0th'][piexif.ImageIFD.Software], 'GEO-TAGER');
});
