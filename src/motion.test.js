import test from 'node:test';
import assert from 'node:assert/strict';
import { MOTION_MIN_BUILD, encodeMotion, parseMotion, validMotion, motionChanged } from './motion.js';
import { firmwareBuildAtLeast } from './protocol.js';
const base = () => ({version:1, enabled:1, dlpf:3, gyro_cutoff_hz:80, accel_cutoff_hz:40, gyro_bias:[-128,0,32767], raw:Array(16).fill(0)});
test('motion is gated by build and unknown old firmware cannot enable it', () => {
  for (const build of [null, undefined, 0, MOTION_MIN_BUILD - 1]) assert.equal(firmwareBuildAtLeast(build,MOTION_MIN_BUILD),false);
  assert.equal(firmwareBuildAtLeast(MOTION_MIN_BUILD,MOTION_MIN_BUILD),true);
});
test('motion preserves reserved bytes and decodes signed telemetry at physical units', () => {
  const config=base(); config.raw[14]=0xa5; config.raw[15]=0x5a;
  const payload=new Uint8Array(40); payload.set(encodeMotion(config));
  const v=new DataView(payload.buffer); payload[16]=2; v.setInt16(28,-1600,true); v.setInt16(36,8192,true);
  const result=parseMotion(payload);
  assert.equal(result.config.raw[14],0xa5); assert.equal(result.config.gyro_bias[0],-128);
  assert.equal(result.gyro[0],-100); assert.equal(result.accel[1],1);
  assert.equal(motionChanged(config,result.config),false);
});
test('invalid motion bounds never enter a SET packet', () => {
  for (const update of [{enabled:2},{dlpf:0},{dlpf:7},{gyro_cutoff_hz:251},{accel_cutoff_hz:NaN},{gyro_bias:[0,0,32768]}]) {
    assert.equal(validMotion({...base(),...update}),false);
    assert.throws(()=>encodeMotion({...base(),...update}));
  }
  assert.throws(()=>parseMotion(new Uint8Array(39)));
});
