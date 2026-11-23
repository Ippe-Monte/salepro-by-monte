import test from 'node:test';
import assert from 'node:assert/strict';
import { gateFor, canOpen, validateEmail, validatePassword, type Profile } from './roles.ts';

const p = (status: Profile['status'], role: Profile['role'] = 'sales'): Profile => ({
  id: '1', email: 'a@b.co', display_name: 'A', role, status,
});

test('gate: loading until session known', () => {
  assert.equal(gateFor(null, null), 'loading');
  assert.equal(gateFor(true, null), 'loading');
});
test('gate: signed out', () => assert.equal(gateFor(false, null), 'signed-out'));
test('gate: pending/disabled/ready', () => {
  assert.equal(gateFor(true, p('pending')), 'pending');
  assert.equal(gateFor(true, p('disabled')), 'disabled');
  assert.equal(gateFor(true, p('active')), 'ready');
});
test('module access', () => {
  assert.equal(canOpen('users', 'admin'), true);
  assert.equal(canOpen('users', 'sales'), false);
  assert.equal(canOpen('dashboard', 'viewer'), true);
  assert.equal(canOpen('dashboard', undefined), false);
  assert.equal(canOpen('unknown', 'admin'), false);
});
test('validation', () => {
  assert.equal(validateEmail('x@y.com'), null);
  assert.notEqual(validateEmail('nope'), null);
  assert.notEqual(validatePassword('short'), null);
  assert.equal(validatePassword('longenough'), null);
});
