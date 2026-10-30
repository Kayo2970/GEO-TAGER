const $ = id => document.getElementById(id);
const photos = [];           // {id, name, meta, loc, selected, result}
let marker = null;
let radiusCircle = null;
let scatterMarkers = [];

// ---------- map ----------
const map = L.map('map').setView([20.5937, 78.9629], 4);

const googleSat = L.tileLayer('https://mt{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
  subdomains: ['0', '1', '2', '3'],
  maxZoom: 20,
  attribution: '© Google Maps'
});

const googlePure = L.tileLayer('https://mt{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
  subdomains: ['0', '1', '2', '3'],
  maxZoom: 20,
  attribution: '© Google Maps'
});

const osm = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '© OpenStreetMap contributors'
});

// Google Satellite (Hybrid) is the default base map
googleSat.addTo(map);

L.control.layers({
  'Google Satellite': googleSat,
  'Satellite (Clean)': googlePure,
  'Street Map (OSM)': osm
}, null, { position: 'topright' }).addTo(map);

function clearScatterMarkers() {
  scatterMarkers.forEach(m => map.removeLayer(m));
  scatterMarkers = [];
}

function randomizeCoords(lat, lon, radiusMeters) {
  if (radiusMeters <= 0) return { lat, lon };
  const r = radiusMeters * Math.sqrt(Math.random());
  const theta = Math.random() * 2 * Math.PI;
  const dx = r * Math.cos(theta);
  const dy = r * Math.sin(theta);
  const dlat = dy / 111139.0;
  const cosLat = Math.cos(lat * Math.PI / 180.0);
  const dlon = dx / (111139.0 * (Math.abs(cosLat) < 1e-6 ? 1e-6 : cosLat));
  const newLat = Math.max(-90, Math.min(90, lat + dlat));
  const newLon = ((lon + dlon + 180) % 360) - 180;
  return { lat: +newLat.toFixed(6), lon: +newLon.toFixed(6) };
}

function updateRadiusCircle() {
  const isRand = $('randomizeLoc').checked;
  $('radiusRow').style.display = isRand ? 'flex' : 'none';
  const la = parseFloat($('lat').value), lo = parseFloat($('lon').value);
  const radius = parseFloat($('radiusMeters').value) || 500;
  if (isRand && !isNaN(la) && !isNaN(lo) && radius > 0) {
    if (radiusCircle) {
      radiusCircle.setLatLng([la, lo]).setRadius(radius);
    } else {
      radiusCircle = L.circle([la, lo], {
        radius: radius,
        color: '#1f6feb',
        fillColor: '#1f6feb',
        fillOpacity: 0.15
      }).addTo(map);
    }
  } else if (radiusCircle) {
    map.removeLayer(radiusCircle);
    radiusCircle = null;
  }
}

$('randomizeLoc').addEventListener('change', updateRadiusCircle);
$('radiusMeters').addEventListener('input', updateRadiusCircle);

function setPoint(lat, lon, fly) {
  $('lat').value = (+lat).toFixed(6); $('lon').value = (+lon).toFixed(6);
  if (marker) marker.setLatLng([lat, lon]); else marker = L.marker([lat, lon]).addTo(map);
  updateRadiusCircle();
  if (fly) {
    if ($('randomizeLoc').checked && radiusCircle) {
      map.fitBounds(radiusCircle.getBounds(), { padding: [20, 20], maxZoom: 17 });
    } else {
      map.setView([lat, lon], 16);
    }
  }
}
map.on('click', async e => {
  setPoint(e.latlng.lat, e.latlng.lng);
  $('title').value = ''; $('address').value = '';
  const r = await fetch(`/api/reverse?lat=${e.latlng.lat}&lon=${e.latlng.lng}`);
  if (r.ok) { const d = await r.json(); $('title').value = d.title; $('address').value = d.address; }
});
['lat', 'lon'].forEach(id => $(id).addEventListener('change', () => {
  const la = parseFloat($('lat').value), lo = parseFloat($('lon').value);
  if (!isNaN(la) && !isNaN(lo)) setPoint(la, lo, true);
}));

$('searchBtn').onclick = async () => {
  const q = $('q').value.trim(); if (!q) return;
  const r = await fetch('/api/search?q=' + encodeURIComponent(q)); const d = await r.json();
  const ul = $('hits'); ul.innerHTML = '';
  if (!r.ok) { ul.innerHTML = `<li>${d.error}</li>`; return; }
  if (!d.length) ul.innerHTML = '<li>No results</li>';
  d.forEach(h => {
    const li = document.createElement('li'); li.textContent = h.address;
    li.onclick = () => { setPoint(h.lat, h.lon, true); $('title').value = h.title; $('address').value = h.address; ul.innerHTML = ''; };
    ul.appendChild(li);
  });
};
$('q').addEventListener('keydown', e => { if (e.key === 'Enter') $('searchBtn').click(); });

// ---------- time controls ----------
function initTimeInputs() {
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  const localIso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  if (!$('staticTime').value) $('staticTime').value = localIso(now);
  if (!$('rangeStart').value) {
    const s = new Date(now); s.setHours(9, 0, 0, 0);
    $('rangeStart').value = localIso(s);
  }
  if (!$('rangeEnd').value) {
    const e = new Date(now); e.setHours(18, 0, 0, 0);
    $('rangeEnd').value = localIso(e);
  }
}

function updateTimeVisibility() {
  const tm = document.querySelector('input[name=tm]:checked').value;
  $('staticBox').style.display = tm === 'static' ? 'block' : 'none';
  $('rangeBox').style.display = tm === 'range' ? 'block' : 'none';
  if (tm === 'static' || tm === 'range') initTimeInputs();
}
document.querySelectorAll('input[name=tm]').forEach(el => el.addEventListener('change', updateTimeVisibility));
updateTimeVisibility();

// ---------- upload ----------
const drop = $('drop');
['dragover', 'dragenter'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
drop.addEventListener('drop', e => upload([...e.dataTransfer.files]));
$('files').onchange = e => { upload([...e.target.files]); e.target.value = ''; };

async function upload(files) {
  files = files.filter(f => f.type.startsWith('image/'));
  const errors = [];
  for (let i = 0; i < files.length; i += 8) {
    $('uploadStatus').textContent = `Uploading ${Math.min(i + 8, files.length)} / ${files.length}...`;
    const fd = new FormData(); files.slice(i, i + 8).forEach(f => fd.append('files', f));
    const res = await (await fetch('/api/upload', { method: 'POST', body: fd })).json();
    res.forEach(p => p.error ? errors.push(`${p.name}: ${p.error}`) : photos.push({ ...p, loc: null, selected: false }));
    render();
  }
  $('uploadStatus').textContent = errors.length ? errors.join('; ') : `${files.length} photo(s) added.`;
}

// ---------- grid ----------
const fmtTime = iso => iso ? iso.replace('T', ' ') : null;
function render() {
  const g = $('grid'); g.innerHTML = '';
  photos.forEach((p, i) => {
    const c = document.createElement('div'); c.className = 'card' + (p.selected ? ' sel' : '');
    const gps = p.meta.lat != null ? `<span class="badge ok">GPS ${p.meta.lat.toFixed(4)}, ${p.meta.lon.toFixed(4)}</span>` : '<span class="badge warn">no GPS</span>';
    const t = fmtTime(p.meta.datetime);
    const time = t ? `<span class="badge ok">${t}</span>` : '<span class="badge warn">no time</span>';
    const loc = p.loc ? `<span class="badge ok">→ ${p.loc.title ? p.loc.title + ' ' : ''}(${p.loc.lat.toFixed(4)}, ${p.loc.lon.toFixed(4)})</span>` : '';
    const res = p.result ? `<span class="badge ${p.result.status === 'ok' ? 'ok' : 'warn'}">${p.result.status}${p.result.detail ? ': ' + p.result.detail : ''}</span>` : '';
    c.innerHTML = `<img src="/api/thumb/${p.id}" loading="lazy"><div class="info"><div class="name" title="${p.name}">${p.name}</div>${gps}${time}${loc}${res}</div>`;
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
$('remove').onclick = () => {
  for (let i = photos.length - 1; i >= 0; i--) if (photos[i].selected) photos.splice(i, 1);
  clearScatterMarkers();
  render();
};

$('apply').onclick = () => {
  const lat = parseFloat($('lat').value), lon = parseFloat($('lon').value);
  if (isNaN(lat) || isNaN(lon)) return alert('Pick a location on the map or search for one first.');
  const title = $('title').value.trim(), address = $('address').value.trim();
  const isRand = $('randomizeLoc').checked;
  const radius = parseFloat($('radiusMeters').value) || 500;
  const sel = photos.filter(p => p.selected);
  if (!sel.length) return alert('Select the photos to apply location to.');

  clearScatterMarkers();
  sel.forEach(p => {
    if (isRand && radius > 0) {
      const pt = randomizeCoords(lat, lon, radius);
      p.loc = { lat: pt.lat, lon: pt.lon, title, address, is_randomized: true };
      const sm = L.circleMarker([pt.lat, pt.lon], {
        radius: 5,
        color: '#1a7f37',
        fillColor: '#2da44e',
        fillOpacity: 0.8
      }).bindTooltip(p.name).addTo(map);
      scatterMarkers.push(sm);
    } else {
      p.loc = { lat, lon, title, address };
    }
  });
  render();
};

// ---------- options / export ----------
function options() {
  const tm = document.querySelector('input[name=tm]:checked').value;
  return {
    overlay: $('overlay').checked,
    time_mode: tm,
    shift_minutes: parseInt($('shift').value || 0),
    fill_datetime: $('fill').value,
    static_datetime: $('staticTime').value,
    range_start: $('rangeStart').value,
    range_end: $('rangeEnd').value,
    range_distribution: $('rangeDist').value,
    overwrite_time: $('overwriteTime').checked,
    radius_m: $('randomizeLoc').checked ? parseFloat($('radiusMeters').value || 0) : 0,
    tz: $('tz').value.trim()
  };
}
const item = p => ({ id: p.id, name: p.name, ...(p.loc || {}) });

$('previewBtn').onclick = async () => {
  const p = photos.find(p => p.selected); if (!p) return alert('Select a photo first.');
  $('status').textContent = 'Rendering preview...';
  const r = await fetch('/api/preview', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ item: item(p), options: options(), overwrite_gps: $('overwrite').checked }) });
  $('status').textContent = '';
  if (!r.ok) return alert((await r.json()).error || 'Preview failed');
  $('prevImg').src = URL.createObjectURL(await r.blob()); $('modal').hidden = false;
};
$('closeModal').onclick = () => $('modal').hidden = true;

$('go').onclick = async () => {
  const sel = photos.filter(p => p.selected);
  if (!sel.length) return alert('Select the photos to tag.');
  $('go').disabled = true; $('status').textContent = `Processing ${sel.length} photo(s)...`;
  try {
    const r = await fetch('/api/process', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: sel.map(item), options: options(), overwrite_gps: $('overwrite').checked }) });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error);
    d.results.forEach(res => { const p = photos.find(p => p.id === res.id); if (p) p.result = res; });
    const ok = d.results.filter(x => x.status === 'ok').length;
    $('status').textContent = `${ok} tagged, ${d.results.length - ok} skipped or failed (see cards).`;
    render();
    if (ok) location.href = '/api/download/' + d.batch;
  } catch (e) { $('status').textContent = 'Error: ' + e.message; }
  $('go').disabled = false;
};

// ---------- Terms & Conditions Modal ----------
const tcModal = $('tcModal');
if (tcModal) {
  if (!localStorage.getItem('geotager_tc_accepted')) {
    tcModal.hidden = false;
  }
  const acceptBtn = $('acceptTc');
  if (acceptBtn) {
    acceptBtn.onclick = () => {
      localStorage.setItem('geotager_tc_accepted', 'true');
      tcModal.hidden = true;
    };
  }
  const openTcBtn = $('openTcBtn');
  if (openTcBtn) {
    openTcBtn.onclick = () => {
      tcModal.hidden = false;
    };
  }
}

render();
