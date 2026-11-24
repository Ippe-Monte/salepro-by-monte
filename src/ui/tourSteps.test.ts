import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ALL_ITEMS } from './nav.ts';
import { TOUR_STEPS } from './tourSteps.ts';

test('tour has complete steps', () => {
  assert.ok(TOUR_STEPS.length >= 5);
  for (const s of TOUR_STEPS) assert.ok(s.icon && s.title.length > 3 && s.text.length > 20);
  assert.equal(new Set(TOUR_STEPS.map((s) => s.title)).size, TOUR_STEPS.length);
});

test('menu names quoted in the tour exist in the app menu', () => {
  const labels = new Set(ALL_ITEMS.map((i) => i.label));
  const text = TOUR_STEPS.map((s) => s.text).join(' ');
  const quoted = [...text.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  const extra = new Set(['เพิ่มเติม', 'ติดตั้งแอปลงเครื่อง', 'คู่มือเริ่มต้นใช้งาน', 'อนุมัติ', 'ใช้ตำแหน่งของฉัน']);
  for (const q of quoted) assert.ok(labels.has(q) || extra.has(q), `unknown menu name in tour: ${q}`);
});
