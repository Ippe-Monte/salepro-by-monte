import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parsePlaces } from './places.ts';

test('parsePlaces maps Nominatim rows', () => {
  const [p] = parsePlaces([{ place_id: 1, name: 'ABC Co', display_name: 'ABC Co, Bangkok', lat: '13.7563001', lon: '100.5018', address: { road: 'Sukhumvit', postcode: '10110', state: 'กรุงเทพมหานคร' }, extratags: { phone: '+66 2 123 4567', website: 'https://abc.co.th' } }]);
  assert.equal(p!.name, 'ABC Co'); assert.equal(p!.lat, 13.7563); assert.equal(p!.lng, 100.5018);
  assert.equal(p!.address, 'Sukhumvit 10110'); assert.equal(p!.province, 'กรุงเทพมหานคร'); assert.equal(p!.phone, '+66 2 123 4567');
});
test('parsePlaces drops rows without a name or coordinates', () => {
  assert.equal(parsePlaces([{ place_id: 2, display_name: '', lat: 'x', lon: 'y' }]).length, 0);
});
