import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bahtText } from './bahttext.ts';
import { formatDocNo, validateColor, validatePrefix } from './docno.ts';
import { base64ToHex, byteaToDataUri, hexToBase64, toByteaParam } from './image.ts';

test('docno formats like the database', () => {
  const d = new Date('2026-11-24T00:00:00Z');
  assert.equal(formatDocNo({ prefix: 'QT', digits: 4, year_fmt: 'ce', separator: '-' }, 7, d), 'QT-2026-0007');
  assert.equal(formatDocNo({ prefix: 'IV', digits: 5, year_fmt: 'be', separator: '/' }, 12, d), 'IV/2569/00012');
  assert.equal(formatDocNo({ prefix: 'DN', digits: 3, year_fmt: 'none', separator: '-' }, 1, d), 'DN-001');
  assert.equal(formatDocNo({ prefix: 'DN', digits: 3, year_fmt: 'none', separator: '' }, 1, d), 'DN001');
});
test('prefix and colour validation', () => {
  assert.equal(validatePrefix('QT'), null);
  assert.notEqual(validatePrefix('q-1'), null);
  assert.notEqual(validatePrefix('ABCDEFG'), null);
  assert.equal(validateColor('#2563EB'), null);
  assert.notEqual(validateColor('blue'), null);
});
test('base64 <-> hex round trip', () => {
  const b64 = 'iVBORw0KGgo=';
  assert.equal(base64ToHex(b64), '89504e470d0a1a0a');
  assert.equal(hexToBase64('89504e470d0a1a0a'), b64);
  assert.equal(hexToBase64('ff'), '/w==');
  assert.equal(hexToBase64('ffd8'), '/9g=');
  assert.equal(toByteaParam('/w=='), '\\xff');
  assert.equal(byteaToDataUri('\\x89504e47', 'image/png'), 'data:image/png;base64,iVBORw==');
  assert.equal(byteaToDataUri(null, 'image/png'), null);
  assert.equal(byteaToDataUri('zz', 'image/png'), null);
});
test('baht text', () => {
  assert.equal(bahtText(0), 'ศูนย์บาทถ้วน');
  assert.equal(bahtText(21), 'ยี่สิบเอ็ดบาทถ้วน');
  assert.equal(bahtText(101), 'หนึ่งร้อยเอ็ดบาทถ้วน');
  assert.equal(bahtText(2033), 'สองพันสามสิบสามบาทถ้วน');
  assert.equal(bahtText(1234.5), 'หนึ่งพันสองร้อยสามสิบสี่บาทห้าสิบสตางค์');
  assert.equal(bahtText(1000000), 'หนึ่งล้านบาทถ้วน');
});
