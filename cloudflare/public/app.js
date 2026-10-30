const $ = id => document.getElementById(id);
const photos = [];           // {id, name, file, thumb, meta, loc, selected, result}
let marker = null, nextId = 1;
piexif.TAGS.Exif[36881] = { name: 'OffsetTimeOriginal', type: 'Ascii' };   // missing from piexifjs

// ---------- map ----------
const map = L.map('map').setView([20.5937, 78.9629], 4);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19, attribution: '© OpenStreetMap contributors' }).addTo(map);

function setPoint(lat, lon, fly) {
  $('lat').value = (+lat).toFixed(6); $('lon').value = (+lon).toFixed(6);
  if (marker) marker.setLatLng([lat, lon]); else marker = L.marker([lat, lon]).addTo(map);
  if (fly) map.setView([lat, lon], 16);
}
map.on('click', async e => {
  setPoint(e.latlng.lat, e.latlng.lng);
  $('title').value = ''; $('address').value = '';
  const d = await reverse(e.latlng.lat, e.latlng.lng);
  if (d) { $('title').value = d.title; $('address').value = d.address; }
});
['lat', 'lon'].forEach(id => $(id).addEventListener('change', () => {
  const la = parseFloat($('lat').value), lo = parseFloat($('lon').value);
  if (!isNaN(la) && !isNaN(lo)) setPoint(la, lo, true);
}));

// Nominatim asks for at most one request per second, so lookups are queued and cached.
const revCache = new Map(); let revQueue = Promise.resolve();
function reverse(lat, lon) {
  const key = lat.toFixed(5) + ',' + lon.toFixed(5);
  if (!revCache.has(key)) {
    revCache.set(key, revQueue = revQueue.then(async () => {
      const r = await fetch(`/api/reverse?lat=${lat}&lon=${lon}`).catch(() => null);
      await new Promise(ok => setTimeout(ok, 1100));
      return r && r.ok ? r.json() : null;
    }));
  }
  return revCache.get(key);
}

$('searchBtn').onclick = async () => {
  const q = $('q').value.trim(); if (!q) return;
  const ul = $('hits'); ul.innerHTML = '';
  const r = await fetch('/api/search?q=' + encodeURIComponent(q)); const d = await r.json();
  if (!r.ok) { ul.innerHTML = `<li>${d.error}</li>`; return; }
  if (!d.length) ul.innerHTML = '<li>No results</li>';
  d.forEach(h => {
    const li = document.createElement('li'); li.textContent = h.address;
    li.onclick = () => { setPoint(h.lat, h.lon, true); $('title').value = h.title; $('address').value = h.address; ul.innerHTML = ''; };
    ul.appendChild(li);
  });
};
$('q').addEventListener('keydown', e => { if (e.key === 'Enter') $('searchBtn').click(); });

// ---------- reading photos ----------
const readDataURL = file => new Promise((ok, no) => {
  const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = () => no(r.error); r.readAsDataURL(file);
});
const isJpeg = f => /^image\/jpeg$/.test(f.type) || /\.jpe?g$/i.test(f.name);

async function readMeta(file) {
  const meta = { datetime: null, offset: null, lat: null, lon: null, make: null, model: null };
  if (!isJpeg(file)) return meta;                       // EXIF is only read from JPEGs
  try {
    const ex = piexif.load(await readDataURL(file));
    const t = ex.Exif[piexif.ExifIFD.DateTimeOriginal] || ex.Exif[piexif.ExifIFD.DateTimeDigitized] || ex['0th'][piexif.ImageIFD.DateTime];
    meta.datetime = t ? GeoLib.fromExifTime(t) : null;
    meta.offset = ex.Exif[36881] || ex.Exif[36880] || null;
    meta.make = ex['0th'][piexif.ImageIFD.Make] || null; meta.model = ex['0th'][piexif.ImageIFD.Model] || null;
    const g = ex.GPS, la = g[piexif.GPSIFD.GPSLatitude], lo = g[piexif.GPSIFD.GPSLongitude];
    if (la && lo) {
      const lat = GeoLib.toDeg(la, g[piexif.GPSIFD.GPSLatitudeRef]), lon = GeoLib.toDeg(lo, g[piexif.GPSIFD.GPSLongitudeRef]);
      if (isFinite(lat) && isFinite(lon) && (lat || lon)) { meta.lat = +lat.toFixed(6); meta.lon = +lon.toFixed(6); }
    }
  } catch (e) { /* no or unreadable EXIF */ }
  return meta;
}

async function makeThumb(file) {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const s = Math.min(1, 360 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height); bmp.close();
  return URL.createObjectURL(await new Promise(ok => c.toBlob(ok, 'image/jpeg', .8)));
}

// ---------- upload ----------
const drop = $('drop');
['dragover', 'dragenter'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
drop.addEventListener('drop', e => addFiles([...e.dataTransfer.files]));
$('files').onchange = e => { addFiles([...e.target.files]); e.target.value = ''; };

async function addFiles(files) {
  files = files.filter(f => /^image\/(jpeg|png|webp|tiff)$/.test(f.type) || /\.(jpe?g|png|webp|tiff?)$/i.test(f.name));
  const errors = [];
  for (let i = 0; i < files.length; i++) {
    $('uploadStatus').textContent = `Reading ${i + 1} / ${files.length}...`;
    try {
      photos.push({ id: nextId++, name: files[i].name, file: files[i], thumb: await makeThumb(files[i]),
                    meta: await readMeta(files[i]), loc: null, selected: false });
    } catch (e) { errors.push(`${files[i].name}: could not read image`); }
    if (i % 5 === 4) render();
  }
  render();
  $('uploadStatus').textContent = errors.length ? errors.join('; ') : `${files.length} photo(s) added.`;
}

// ---------- grid ----------
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function render() {
  const g = $('grid'); g.innerHTML = '';
  photos.forEach(p => {
    const c = document.createElement('div'); c.className = 'card' + (p.selected ? ' sel' : '');
    const gps = p.meta.lat != null ? `<span class="badge ok">GPS ${p.meta.lat.toFixed(4)}, ${p.meta.lon.toFixed(4)}</span>` : '<span class="badge warn">no GPS</span>';
    const time = p.meta.datetime ? `<span class="badge ok">${p.meta.datetime.replace('T', ' ')}</span>` : '<span class="badge warn">no time</span>';
    const loc = p.loc ? `<span class="badge ok">→ ${esc(p.loc.title || p.loc.lat.toFixed(4) + ', ' + p.loc.lon.toFixed(4))}</span>` : '';
    const res = p.result ? `<span class="badge ${p.result.status === 'ok' ? 'ok' : 'warn'}">${p.result.status}${p.result.detail ? ': ' + esc(p.result.detail) : ''}</span>` : '';
    c.innerHTML = `<img src="${p.thumb}"><div class="info"><div class="name" title="${esc(p.name)}">${esc(p.name)}</div>${gps}${time}${loc}${res}</div>`;
    c.onclick = () => { p.selected = !p.selected; render(); };
    g.appendChild(c);
  });
  const n = photos.filter(p => p.selected).length;
  $('count').textContent = `${photos.length} photos, ${n} selected`;
  $('apply').textContent = `Apply to selected (${n})`;
}
$('selAll').onclick = () => { photos.forEach(p => p.selected = true); render(); };
$('selNone').onclick = () => { photos.forEach(p => p.selected = false); render(); };
$('selNoGps').onclick = () => { photos.forEach(p => p.selected = p.meta.lat == null); render(); };
$('remove').onclick = () => { for (let i = photos.length - 1; i >= 0; i--) if (photos[i].selected) { URL.revokeObjectURL(photos[i].thumb); photos.splice(i, 1); } render(); };

$('apply').onclick = () => {
  const lat = parseFloat($('lat').value), lon = parseFloat($('lon').value);
  if (isNaN(lat) || isNaN(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return alert('Pick a valid location on the map or search for one first.');
  const loc = { lat, lon, title: $('title').value.trim(), address: $('address').value.trim() };
  photos.filter(p => p.selected).forEach(p => p.loc = { ...loc });
  render();
};

// ---------- overlay ----------
const tileCache = new Map();
const loadTile = (z, x, y) => {
  const k = `${z}/${x}/${y}`;
  if (!tileCache.has(k)) tileCache.set(k, new Promise((ok, no) => {
    const im = new Image(); im.onload = () => ok(im); im.onerror = no; im.src = `/api/tile/${k}.png`;
  }));
  return tileCache.get(k);
};

async function mapImage(lat, lon, size, zoom = 17) {
  const n = 2 ** zoom, fx = (lon + 180) / 360 * n;
  const fy = (1 - Math.asinh(Math.tan(lat * Math.PI / 180)) / Math.PI) / 2 * n;
  const tx = Math.floor(fx), ty = Math.floor(fy);
  try {
    const tiles = await Promise.all([-1, 0, 1].flatMap(dx => [-1, 0, 1].map(async dy => [dx, dy, await loadTile(zoom, tx + dx, ty + dy)])));
    const c = document.createElement('canvas'); c.width = c.height = size;
    const ctx = c.getContext('2d'), k = size / 360, cx = (fx - tx + 1) * 256, cy = (fy - ty + 1) * 256;
    tiles.forEach(([dx, dy, im]) => ctx.drawImage(im, ((dx + 1) * 256 - (cx - 180)) * k, ((dy + 1) * 256 - (cy - 180)) * k, 256 * k, 256 * k));
    return c;
  } catch (e) { return null; }
}

function wrap(ctx, text, width, maxLines) {
  const lines = []; let line = '';
  for (const w of text.split(/\s+/).filter(Boolean)) {
    const t = (line + ' ' + w).trim();
    if (line && ctx.measureText(t).width > width) { lines.push(line); line = w; } else line = t;
  }
  lines.push(line);
  if (lines.length > maxLines) { lines.length = maxLines; lines[maxLines - 1] = lines[maxLines - 1].replace(/[,. ]+$/, '') + '...'; }
  return lines.filter(Boolean);
}

async function drawOverlay(ctx, w, h, { lat, lon, title, address, taken, offset }) {
  const s = Math.max(0.35, w / 2000), pad = Math.round(45 * s), mapPx = Math.round(330 * s), bandH = mapPx + 2 * pad, top = h - bandH + pad;
  ctx.fillStyle = 'rgba(0,0,0,0.47)'; ctx.fillRect(0, h - bandH, w, bandH);
  const tile = await mapImage(lat, lon, mapPx);
  if (tile) ctx.drawImage(tile, pad, top);
  else {
    ctx.fillStyle = '#46505a'; ctx.fillRect(pad, top, mapPx, mapPx);
    ctx.fillStyle = '#c8c8c8'; ctx.font = `${22 * s}px sans-serif`; ctx.textAlign = 'center'; ctx.fillText('map unavailable', pad + mapPx / 2, top + mapPx - 24 * s);
  }
  // pin
  const px = pad + mapPx / 2, py = top + mapPx / 2, r = 18 * s;
  ctx.fillStyle = '#d62828'; ctx.beginPath(); ctx.moveTo(px - r * .6, py - r * .9); ctx.lineTo(px + r * .6, py - r * .9); ctx.lineTo(px, py); ctx.fill();
  ctx.beginPath(); ctx.arc(px, py - r * 1.2, r, 0, 7); ctx.fill(); ctx.lineWidth = Math.max(1, r / 5); ctx.strokeStyle = '#fff'; ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(px, py - r * 1.2, r * .35, 0, 7); ctx.fill();

  const x = pad + mapPx + pad, width = w - x - pad;
  const F = (px, bold) => `${bold ? 'bold ' : ''}${Math.round(px * s)}px "DejaVu Sans", Arial, sans-serif`;
  ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#000'; ctx.lineWidth = Math.max(2, 2 * s);
  const lines = [];
  ctx.font = F(58, true); wrap(ctx, title || `${lat.toFixed(5)}, ${lon.toFixed(5)}`, width, 1).forEach(t => lines.push([t, 58, true]));
  ctx.font = F(40); wrap(ctx, address || '', width, 2).forEach(t => lines.push([t, 40]));
  lines.push([`Lat ${lat.toFixed(6)}, Long ${lon.toFixed(6)}`, 40]);
  if (taken) lines.push([GeoLib.formatWhen(taken, offset), 40]);
  lines.push(['Note : Location and time added after capture (GEO-TAGER)', 32]);
  let y = top - 6 * s;
  for (const [t, px, bold] of lines) { ctx.font = F(px, bold); ctx.strokeText(t, x, y); ctx.fillText(t, x, y); y += px * s * 1.3; }
}

// ---------- tagging ----------
function options() {
  const o = { overlay: $('overlay').checked, time_mode: document.querySelector('input[name=tm]:checked').value,
              shift_minutes: parseInt($('shift').value || 0), fill_datetime: $('fill').value, tz: $('tz').value.trim() };
  GeoLib.parseOffset(o.tz); return o;
}

function finalLocation(p, overwrite) {
  if (p.meta.lat != null && !overwrite) return { lat: p.meta.lat, lon: p.meta.lon, title: null, address: null };
  return p.loc;
}

// Returns a JPEG data URL with tags (and overlay, when asked) applied. Never touches the original file.
async function tagPhoto(p, loc, opts, maxSide) {
  const { taken, offset } = GeoLib.resolveTime(p.meta, opts);
  let title = loc.title, address = loc.address;
  if (opts.overlay && (title === null || (!title && !address))) {
    const hit = await reverse(loc.lat, loc.lon); title = hit ? hit.title : ''; address = hit ? hit.address : '';
  }
  const src = await readDataURL(p.file);
  let ex;
  try { ex = isJpeg(p.file) ? piexif.load(src) : null; } catch (e) { ex = null; }
  const fresh = () => ({ '0th': {}, Exif: {}, GPS: {}, Interop: {}, '1st': {}, thumbnail: null });
  const inplace = isJpeg(p.file) && !opts.overlay && !maxSide;

  const dump = (exif) => piexif.dump(GeoLib.applyTags(exif, piexif, loc.lat, loc.lon, taken, offset, !inplace));
  let exifStr; try { exifStr = dump(ex || fresh()); } catch (e) { exifStr = dump(fresh()); }
  if (inplace) return { url: piexif.insert(exifStr, src), taken };

  const bmp = await createImageBitmap(p.file, { imageOrientation: 'from-image' });
  const sc = maxSide ? Math.min(1, maxSide / Math.max(bmp.width, bmp.height)) : 1;
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * sc); c.height = Math.round(bmp.height * sc);
  const ctx = c.getContext('2d'); ctx.drawImage(bmp, 0, 0, c.width, c.height); bmp.close();
  if (opts.overlay) await drawOverlay(ctx, c.width, c.height, { lat: loc.lat, lon: loc.lon, title, address, taken, offset });
  return { url: piexif.insert(exifStr, c.toDataURL('image/jpeg', 0.95)), taken, title, address };
}

const dataUrlToBytes = url => { const b = atob(url.split(',')[1]); const a = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return a; };

$('previewBtn').onclick = async () => {
  const p = photos.find(p => p.selected); if (!p) return alert('Select a photo first.');
  try {
    const opts = options(), loc = finalLocation(p, $('overwrite').checked);
    if (!loc) return alert('This photo has no location. Apply one first.');
    $('status').textContent = 'Rendering preview...';
    $('prevImg').src = (await tagPhoto(p, loc, opts, 1400)).url; $('modal').hidden = false;
  } catch (e) { alert(e.message); }
  $('status').textContent = '';
};
$('closeModal').onclick = () => $('modal').hidden = true;

const csvCell = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
$('go').onclick = async () => {
  const sel = photos.filter(p => p.selected);
  if (!sel.length) return alert('Select the photos to tag.');
  let opts; try { opts = options(); } catch (e) { return alert(e.message); }
  $('go').disabled = true;
  const zip = new JSZip(), used = new Set(), rows = [['name', 'status', 'detail', 'output', 'lat', 'lon', 'taken', 'address']];
  let ok = 0;
  for (const [i, p] of sel.entries()) {
    $('status').textContent = `Processing ${i + 1} / ${sel.length}...`;
    const loc = finalLocation(p, $('overwrite').checked);
    if (!loc) { p.result = { status: 'skipped', detail: 'no location (no EXIF GPS and none assigned)' }; rows.push([p.name, 'skipped', p.result.detail]); continue; }
    try {
      const out = await tagPhoto(p, loc, opts);
      const stem = p.name.replace(/\.[^.]+$/, '').replace(/[^\w.\- ]/g, '_');
      let name = `${stem}_geotagged.jpg`, n = 1;
      while (used.has(name)) name = `${stem}_geotagged_${++n}.jpg`;
      used.add(name); zip.file(name, dataUrlToBytes(out.url));
      p.result = { status: 'ok' }; ok++;
      rows.push([p.name, 'ok', '', name, loc.lat, loc.lon, out.taken ? GeoLib.toExifTime(out.taken) : '', out.address ?? loc.address ?? '']);
    } catch (e) { p.result = { status: 'error', detail: e.message }; rows.push([p.name, 'error', e.message]); }
    render();
  }
  zip.file('report.csv', rows.map(r => r.map(csvCell).join(',')).join('\n'));
  $('status').textContent = `${ok} tagged, ${sel.length - ok} skipped or failed (see cards).`;
  if (ok) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(await zip.generateAsync({ type: 'blob' }));
    a.download = 'geotagged_photos.zip'; a.click();
  }
  $('go').disabled = false; render();
};
render();
