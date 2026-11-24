import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveAccess, canOpen, canEdit, assignableRoles, canManageMember, validateEmail, validatePassword, validateOrgName,
  type Membership, type Profile,
} from './roles.ts';

const prof: Profile = { id: 'u', email: 'a@b.co', display_name: 'A' };
const mem = (org_id: string, role: Membership['role'] = 'sales', status: Membership['status'] = 'active',
  orgStatus: 'active' | 'suspended' = 'active'): Membership => ({
  org_id, role, status,
  org: { id: org_id, name: org_id, status: orgStatus, tax_id: null, address: null, phone: null, currency: 'THB', vat_rate: 7 },
});

test('loading until session and memberships are known', () => {
  assert.equal(resolveAccess(null, null, null, false, null).gate, 'loading');
  assert.equal(resolveAccess(true, null, null, false, null).gate, 'loading');
  assert.equal(resolveAccess(true, null, null, false, null, 'x').gate, 'error');
  assert.equal(resolveAccess(true, prof, null, false, null).gate, 'loading');
});
test('signed out', () => assert.equal(resolveAccess(false, null, null, false, null).gate, 'signed-out'));
test('no company -> onboarding', () => assert.equal(resolveAccess(true, prof, [], false, null).gate, 'no-org'));
test('ready picks the preferred company, else the first usable', () => {
  const ms = [mem('a'), mem('b', 'admin')];
  assert.equal(resolveAccess(true, prof, ms, false, 'b').current?.org_id, 'b');
  assert.equal(resolveAccess(true, prof, ms, false, 'zzz').current?.org_id, 'a');
  assert.equal(resolveAccess(true, prof, ms, false, null).gate, 'ready');
});
test('disabled membership and suspended company are not usable', () => {
  assert.equal(resolveAccess(true, prof, [mem('a', 'sales', 'disabled')], false, null).gate, 'no-org');
  assert.equal(resolveAccess(true, prof, [mem('a', 'sales', 'active', 'suspended')], false, null).gate, 'suspended');
  const ms = [mem('a', 'sales', 'active', 'suspended'), mem('b')];
  assert.equal(resolveAccess(true, prof, ms, false, 'a').current?.org_id, 'b');
});
test('platform admin without a company can still enter', () => {
  const r = resolveAccess(true, prof, [], true, null);
  assert.equal(r.gate, 'ready');
  assert.equal(r.current, null);
});
test('module access', () => {
  assert.equal(canOpen('members', 'admin'), true);
  assert.equal(canOpen('members', 'sales'), false);
  assert.equal(canOpen('dashboard', 'viewer'), true);
  assert.equal(canOpen('dashboard', undefined), false);
  assert.equal(canOpen('unknown', 'admin'), false);
  assert.equal(canEdit('settings', 'admin'), true);
  assert.equal(canEdit('settings', 'sales'), false);
});
test('owner and admin permissions', () => {
  assert.equal(canOpen('members', 'owner'), true);
  assert.equal(canEdit('settings', 'owner'), true);
  assert.deepEqual([...assignableRoles('owner')].includes('owner'), true);
  assert.equal(assignableRoles('admin').includes('owner'), false);
  assert.equal(assignableRoles('admin').includes('admin'), true);
  assert.equal(assignableRoles('sales').length, 0);
  assert.equal(canManageMember('owner', 'owner'), true);
  assert.equal(canManageMember('admin', 'owner'), false);
  assert.equal(canManageMember('admin', 'sales'), true);
  assert.equal(canManageMember('sales', 'viewer'), false);
});
test('validation', () => {
  assert.equal(validateEmail('x@y.com'), null);
  assert.notEqual(validateEmail('nope'), null);
  assert.notEqual(validatePassword('short'), null);
  assert.equal(validatePassword('longenough'), null);
  assert.notEqual(validateOrgName(' a '), null);
  assert.equal(validateOrgName('Alpha Co'), null);
});

test('new modules: invoices and delivery notes follow the database roles', () => {
  assert.equal(canEdit('invoices', 'admin'), true);
  assert.equal(canEdit('invoices', 'sales'), false);
  assert.equal(canEdit('notes', 'dispatcher'), true);
  assert.equal(canEdit('notes', 'warehouse'), true);
  assert.equal(canEdit('notes', 'sales'), false);
  assert.equal(canEdit('docs', 'owner'), true);
  assert.equal(canEdit('docs', 'warehouse'), false);
  assert.equal(canOpen('invoices', 'viewer'), true);
});
