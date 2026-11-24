import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CARD_PALETTE, isHex, normalizeHex, textOn } from './cardcolor.ts';

test('white and black are in the palette and get readable text', () => {
  assert.ok(CARD_PALETTE.includes('#ffffff') && CARD_PALETTE.includes('#000000'));
  assert.equal(textOn('#ffffff'), '#0f172a');
  assert.equal(textOn('#000000'), '#ffffff');
  assert.equal(textOn('#1d4ed8'), '#ffffff');
  assert.equal(textOn('#eab308'), '#0f172a');
});
test('hex parsing', () => {
  assert.equal(normalizeHex('1D4ED8'), '#1d4ed8');
  assert.equal(normalizeHex(' #ABCDEF '), '#abcdef');
  assert.equal(normalizeHex('#abc'), null);
  assert.equal(normalizeHex('zzzzzz'), null);
  assert.ok(isHex('#00ff00') && !isHex('00ff00'));
});
test('every palette entry is valid hex', () => { for (const c of CARD_PALETTE) assert.ok(isHex(c), c); });
