const assert = require('node:assert/strict');
const test = require('node:test');
const { wgs84ToGcj02, buildLinearRoute } = require('../src/geo/coordinates');

test('converts WGS84 coordinates for Amap display', () => {
  const converted = wgs84ToGcj02(116.397, 39.908);
  assert.ok(Math.abs(converted.longitude - 116.397) > 0.001);
  assert.ok(Math.abs(converted.latitude - 39.908) > 0.001);
});

test('planned route starts and ends at waybill stops', () => {
  const route = buildLinearRoute([{ stop_seq: 1, longitude: 113.9, latitude: 22.56 }, { stop_seq: 2, longitude: 113.47, latitude: 23.11 }]);
  assert.deepEqual(route[0], { longitude: 113.9, latitude: 22.56 });
  assert.deepEqual(route.at(-1), { longitude: 113.47, latitude: 23.11 });
});