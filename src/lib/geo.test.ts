import assert from 'node:assert/strict';
import { test } from 'node:test';
import { directionsLink, distanceKm, mapsLink, nearestOrder, parseCoords, validateCoordPair } from './geo.ts';

test('parseCoords accepts "lat, lng" and two fields', () => {
  assert.deepEqual(parseCoords('13.7563, 100.5018'), { lat: 13.7563, lng: 100.5018 });
  assert.deepEqual(parseCoords('13.7563', '100.5018'), { lat: 13.7563, lng: 100.5018 });
  assert.deepEqual(parseCoords('-33.8688 151.2093'), { lat: -33.8688, lng: 151.2093 });
});

test('parseCoords rejects bad input and out-of-range values', () => {
  assert.equal(parseCoords('abc'), null);
  assert.equal(parseCoords('91, 10'), null);
  assert.equal(parseCoords('10, 181'), null);
  assert.equal(parseCoords('1,2,3'), null);
  assert.equal(parseCoords('', ''), null);
});

test('validateCoordPair: both empty ok, one missing is an error', () => {
  assert.equal(validateCoordPair('', ''), null);
  assert.notEqual(validateCoordPair('13.7', ''), null);
  assert.notEqual(validateCoordPair('', '100.5'), null);
  assert.notEqual(validateCoordPair('999', '100'), null);
  assert.equal(validateCoordPair('13.7', '100.5'), null);
});

test('links', () => {
  const c = { lat: 13.7563, lng: 100.5018 };
  assert.match(mapsLink(c), /query=13\.7563,100\.5018$/);
  assert.match(directionsLink(c), /destination=13\.7563,100\.5018$/);
});

test('distanceKm Bangkok to Chiang Mai is about 580 km', () => {
  const d = distanceKm({ lat: 13.7563, lng: 100.5018 }, { lat: 18.7883, lng: 98.9853 });
  assert.ok(d > 570 && d < 600, String(d));
  assert.equal(distanceKm({ lat: 1, lng: 1 }, { lat: 1, lng: 1 }), 0);
});

test('nearestOrder visits nearest first and keeps uncoordinated stops last', () => {
  const stops = [
    { id: 'far', coords: { lat: 18.79, lng: 98.98 } },
    { id: 'none', coords: null },
    { id: 'near', coords: { lat: 13.8, lng: 100.5 } },
  ];
  const out = nearestOrder({ lat: 13.75, lng: 100.5 }, stops).map((s) => s.id);
  assert.deepEqual(out, ['near', 'far', 'none']);
});
