import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildVCard, parseVCard } from './vcard.ts';

test('buildVCard has required lines and CRLF', () => {
  const v = buildVCard({ name: 'สมชาย ใจดี', company: 'T15 Engineering', position: 'Sales Engineer', department: 'Sales', phone: '0619362982', email: 'a@b.co', website: 'https://t15.co.th', lineId: 'somchai' });
  assert.ok(v.startsWith('BEGIN:VCARD\r\nVERSION:3.0\r\n'));
  assert.ok(v.includes('FN:สมชาย ใจดี'));
  assert.ok(v.includes('N:ใจดี;สมชาย;;;'));
  assert.ok(v.includes('ORG:T15 Engineering;Sales'));
  assert.ok(v.includes('TEL;TYPE=CELL,VOICE:0619362982'));
  assert.ok(v.trimEnd().endsWith('END:VCARD'));
});
test('buildVCard escapes separators and omits empty fields and photo by default', () => {
  const v = buildVCard({ name: 'A', company: 'X, Y; Z', photoB64: 'AAAA' });
  assert.ok(v.includes('ORG:X\\, Y\; Z'));
  assert.ok(!v.includes('TEL') && !v.includes('PHOTO'));
  assert.ok(buildVCard({ name: 'A', photoB64: 'AAAA' }, { photo: true }).includes('PHOTO;ENCODING=b;TYPE=JPEG:AAAA'));
});
test('parseVCard round trip', () => {
  const v = buildVCard({ name: 'Jane Doe', company: 'Acme', position: 'CEO', phone: '081', email: 'j@a.co' });
  const p = parseVCard(v)!;
  assert.equal(p.name, 'Jane Doe'); assert.equal(p.company, 'Acme'); assert.equal(p.position, 'CEO'); assert.equal(p.phone, '081'); assert.equal(p.email, 'j@a.co');
  assert.equal(parseVCard('hello'), null);
});
