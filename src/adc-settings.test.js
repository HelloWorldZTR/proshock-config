import test from 'node:test';
import assert from 'node:assert/strict';
import { adcDepthFlags, parseConfigInfo, ADC_DEPTH_CODES } from './protocol.js';

test('all internal depth codes round-trip through unchanged global flags and config metadata', () => {
  for (const bits of ADC_DEPTH_CODES) {
    const flags = adcDepthFlags(0x80000001, bits);
    assert.equal(flags & 0x80000001, 0x80000001 | 0);
    const payload = new Uint8Array(56);
    new DataView(payload.buffer).setUint32(24, flags, true);
    payload[55] = 3;
    const info = parseConfigInfo(payload);
    assert.equal(info.adc_bits, bits);
    assert.equal(info.adc_source, 'internal');
    assert.equal(info.adc_depth_supported, true);
  }
  assert.throws(() => adcDepthFlags(0,16), /Unsupported/);
  assert.throws(() => adcDepthFlags(0,18), /Unsupported/);
  assert.equal(parseConfigInfo(new Uint8Array(52)).adc_depth_supported, false);
  assert.equal(parseConfigInfo(new Uint8Array(56)).adc_bits, 12);
});
