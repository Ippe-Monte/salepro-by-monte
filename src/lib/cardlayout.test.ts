import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defaultLayout, drag, isPortrait, newEl, sanitize, setPortrait, setSize } from './cardlayout.ts';

test('size is kept within bounds and orientation swaps the sides', () => {
  const l = setSize(defaultLayout(), 5, 900);
  assert.deepEqual([l.w, l.h], [30, 200]);
  const p = setPortrait(defaultLayout(), true);
  assert.deepEqual([p.w, p.h, isPortrait(p)], [55, 90, true]);
  assert.deepEqual([setPortrait(p, false).w, setPortrait(p, false).h], [90, 55]);
});
test('dragging moves in percent of the card and stays inside it', () => {
  const e = newEl('name', { x: 10, y: 10 });
  const m = drag(e, 50, 25, 500, 250);
  assert.equal(m.x, 20); assert.equal(m.y, 20);
  const far = drag(e, 99999, -99999, 500, 250);
  assert.equal(far.x, 96); assert.equal(far.y, 0);
});
test('sanitize drops unknown element types and bad numbers', () => {
  const l = sanitize({ w: 'x', h: 55, els: [{ id: 'a', t: 'name', x: -5, y: 500, s: 'big', c: 'red' }, { id: 'b', t: 'script', x: 1, y: 1, s: 3 }] });
  assert.equal(l.w, 90);
  assert.equal(l.els.length, 1);
  assert.deepEqual([l.els[0].x, l.els[0].y, l.els[0].s, l.els[0].c], [0, 100, 4, '']);
});
test('default layout has the basics incl. a QR code', () => {
  const t = defaultLayout().els.map((e) => e.t);
  assert.ok(t.includes('name') && t.includes('qr') && t.includes('phone'));
});
