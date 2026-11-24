import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { APP_VERSION, VERSION_LABEL, toSemver, toVersionCode } from '../version.ts';

const json = (p: string) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));

test('label looks like V1.00', () => assert.match(VERSION_LABEL, /^V\d+\.\d{2}$/));
test('semver and versionCode conversion', () => {
  assert.equal(toSemver('1.00'), '1.0.0');
  assert.equal(toSemver('1.05'), '1.5.0');
  assert.equal(toVersionCode('1.00'), 1000);
  assert.equal(toVersionCode('1.12'), 1012);
  assert.equal(toVersionCode('2.00'), 2000);
  assert.throws(() => toSemver('1.0'));
});
test('app.json and package.json follow src/version.ts', () => {
  const app = json('../../app.json').expo;
  assert.equal(app.version, toSemver(APP_VERSION));
  assert.equal(app.android.versionCode, toVersionCode(APP_VERSION));
  assert.equal(app.ios.buildNumber, String(toVersionCode(APP_VERSION)));
  assert.equal(json('../../package.json').version, toSemver(APP_VERSION));
});
