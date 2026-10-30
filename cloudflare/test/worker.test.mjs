import test from 'node:test';
import assert from 'node:assert/strict';
import { shape, title } from '../src/shape.js';
import worker from '../src/index.js';

test('title prefers city, then town/village/suburb', () => {
  assert.equal(title({ city: 'Bengaluru', state: 'Karnataka', country: 'India' }), 'Bengaluru, Karnataka, India');
  assert.equal(title({ suburb: 'Konanakunte', country: 'India' }), 'Konanakunte, India');
});

test('shape rounds coordinates', () => {
  const s = shape({ lat: '12.8880201', lon: '77.5641331', display_name: 'X', address: { city: 'C' } });
  assert.deepEqual(s, { lat: 12.88802, lon: 77.564133, title: 'C', address: 'X' });
});

test('api validation (no network needed)', async () => {
  const env = { ASSETS: { fetch: () => new Response('asset') } };
  const get = (p, init) => worker.fetch(new Request('https://x.test' + p, init), env);
  assert.equal((await get('/api/reverse?lat=999&lon=1')).status, 400);
  assert.equal((await get('/api/reverse')).status, 400);
  assert.deepEqual(await (await get('/api/search?q=')).json(), []);
  assert.equal((await get('/api/tile/25/1/1.png')).status, 400);
  assert.equal((await get('/api/tile/3/9/1.png')).status, 400);
  assert.equal((await get('/api/nope')).status, 404);
  assert.equal((await get('/api/search?q=x', { method: 'POST' })).status, 405);
  assert.equal(await (await get('/')).text(), 'asset');
});
