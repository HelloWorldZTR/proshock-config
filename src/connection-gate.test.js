import test from 'node:test';
import assert from 'node:assert/strict';
import { isConnectionBlocked } from './connection-gate.js';

/** Verify no release build page can use the development dismissal flag. */
test('Home and firmware are offline-accessible in production, even with dismissal set', () => {
  for (const page of ['home', 'configurator', 'calibration', 'diagnostics', 'firmware']) {
    assert.equal(isConnectionBlocked({ page, connected: false, iapReady: false, development: false, dismissed: true }), !['home', 'firmware'].includes(page));
  }
});
test('development dismissal allows preview but defaults to the same gate', () => {
  for (const dismissed of [false, true]) {
    assert.equal(isConnectionBlocked({ page: 'calibration', connected: false, development: true, dismissed }), !dismissed);
  }
});
test('firmware entry stays accessible without IAP; configuration still needs connection', () => {
  assert.equal(isConnectionBlocked({ page: 'firmware', iapReady: true }), false);
  assert.equal(isConnectionBlocked({ page: 'configurator', iapReady: true }), true);
  assert.equal(isConnectionBlocked({ page: 'firmware', iapReady: false }), false);
});
