import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseCardText } from './cardparse.ts';

test('parses an English card', () => {
  const p = parseCardText('ACME Engineering Co., Ltd.\nJohn Smith\nSales Manager\nTel: 02-123-4567\nMobile 081-234-5678\njohn@acme.co.th\nwww.acme.co.th\nLINE ID: johnsmith');
  assert.equal(p.company, 'ACME Engineering Co., Ltd.');
  assert.equal(p.name, 'John Smith');
  assert.equal(p.position, 'Sales Manager');
  assert.equal(p.email, 'john@acme.co.th');
  assert.equal(p.website, 'www.acme.co.th');
  assert.equal(p.lineId, 'johnsmith');
  assert.ok(p.phone.replace(/\D/g, '').length >= 9);
});
test('parses a Thai card', () => {
  const p = parseCardText('บริษัท ทดสอบ จำกัด\nสมชาย ใจดี\nผู้จัดการฝ่ายขาย\n081-234-5678\nsomchai@test.co.th');
  assert.equal(p.company, 'บริษัท ทดสอบ จำกัด');
  assert.equal(p.name, 'สมชาย ใจดี');
  assert.equal(p.position, 'ผู้จัดการฝ่ายขาย');
  assert.equal(p.phone, '081-234-5678');
  assert.equal(p.email, 'somchai@test.co.th');
});
test('empty or noisy text gives empty fields, not a crash', () => {
  const p = parseCardText('');
  assert.deepEqual(Object.values(p).filter(Boolean), []);
  assert.equal(parseCardText('!!\n--\n').name, '');
});
