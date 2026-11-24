import assert from 'node:assert/strict';
import { test } from 'node:test';
import { extractThai } from '../../scripts/extract-thai.mjs';
import { EN } from './en.ts';
import { translate } from './translate.ts';

const THAI = /[฀-๿]/;

test('every Thai text in the code has an English translation', () => {
  const missing = extractThai().filter((f: string) => EN[f] === undefined);
  assert.deepEqual(missing, [], `Add these to src/i18n/en.ts:\n${missing.join('\n')}`);
});

test('no unused translations and no Thai left in English text', () => {
  const frags = new Set<string>(extractThai());
  assert.deepEqual(Object.keys(EN).filter((k) => !frags.has(k)), [], 'Remove translations that no code uses');
  assert.deepEqual(Object.values(EN).filter((v) => THAI.test(v)), []);
});

test('translate: Thai stays Thai, exact and composed text go to English', () => {
  assert.equal(translate('ลูกค้า', 'th'), 'ลูกค้า');
  assert.equal(translate('บันทึก', 'en'), 'Save');
  assert.equal(translate(' บันทึก ', 'en'), ' Save ');
  assert.equal(translate('ใช้ได้ถึง (ปปปป-ดด-วว)', 'en'), 'Valid until (YYYY-MM-DD)');
  assert.equal(translate('5 ชิ้น', 'en'), '5 pcs');
  assert.equal(translate('INV-2026-0001', 'en'), 'INV-2026-0001');
});

test('translate: user data in Thai is never half-translated', () => {
  assert.equal(translate('บริษัท ทดสอบ จำกัด', 'en'), 'บริษัท ทดสอบ จำกัด');
  assert.equal(translate('สินค้าตัวอย่างพิเศษ', 'en'), 'สินค้าตัวอย่างพิเศษ');
});
