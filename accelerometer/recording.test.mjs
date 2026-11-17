import test from 'node:test';
import assert from 'node:assert/strict';
import { readAxes, csvBlob, csvName } from './recording.js';
test('requires all three finite axes, preserves zero, and does not switch measurement modes', () => {
  const event = { acceleration: {x: 0, y: -2.5, z: 3}, accelerationIncludingGravity: {x: 1, y: 2, z: 9.81} };
  assert.deepEqual(readAxes(event, 'linear'), [0, -2.5, 3]);
  assert.deepEqual(readAxes(event, 'gravity'), [1, 2, 9.81]);
  assert.equal(readAxes({...event, acceleration: {x: null, y: 1, z: 2}}, 'linear'), null);
  assert.equal(readAxes({...event, acceleration: {x: NaN, y: 1, z: 2}}, 'linear'), null);
  assert.equal(readAxes({accelerationIncludingGravity: event.accelerationIncludingGravity}, 'linear'), null);
});
test('CSV preserves signed axes and elapsed time with explicit units and gravity flag', async () => {
  const csv = await csvBlob([[12.5, 0, -1.234567, 9.81], [25, 1, 2, 3]], Date.UTC(2026, 0, 1), 'gravity').text();
  assert.equal(csv, 'timestamp_utc,elapsed_s,x_m_s2,y_m_s2,z_m_s2,includes_gravity\r\n2026-01-01T00:00:00.012Z,0.012500,0,-1.234567,9.81,true\r\n2026-01-01T00:00:00.025Z,0.025000,1,2,3,true\r\n');
  assert.match(await csvBlob([[0, 0, 0, 0]], 0, 'linear').text(), /,false\r\n$/);
});
test('file names are safe and use a single CSV suffix', () => {
  assert.equal(csvName('test.CSV'), 'test.csv');
  assert.equal(csvName(''), 'accelerometer.csv');
  assert.equal(csvName('../test / data.csv'), '_test_data.csv');
});
