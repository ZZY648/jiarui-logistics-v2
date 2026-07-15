const assert = require('node:assert/strict');
const test = require('node:test');
const { validateOperationalIntegrity } = require('../src/domain/operations-integrity');

test('detects active resource conflicts and overloads', () => {
  const db = {
    waybills: [{ id: 1, waybill_no: 'YD1', status: 'in_transit', cargo_weight_kg: 2000 }, { id: 2, waybill_no: 'YD2', status: 'loaded', cargo_weight_kg: 500 }],
    waybillVehicles: [{ waybill_id: 1, vehicle_id: 1, driver_id: 1 }, { waybill_id: 2, vehicle_id: 1, driver_id: 1 }],
    vehicles: [{ id: 1, plate_number: '粤B00001', max_load_kg: 1000 }],
    drivers: [{ id: 1, name: '测试司机' }]
  };
  const types = validateOperationalIntegrity(db).map(issue => issue.type);
  assert.ok(types.includes('vehicle_overload'));
  assert.ok(types.includes('vehicle_conflict'));
  assert.ok(types.includes('driver_conflict'));
});

test('accepts a consistent active fleet allocation', () => {
  const db = {
    waybills: [{ id: 1, waybill_no: 'YD1', status: 'in_transit', cargo_weight_kg: 500 }],
    waybillVehicles: [{ waybill_id: 1, vehicle_id: 1, driver_id: 1 }],
    vehicles: [{ id: 1, plate_number: '粤B00001', max_load_kg: 1000 }],
    drivers: [{ id: 1, name: '测试司机' }]
  };
  assert.deepEqual(validateOperationalIntegrity(db), []);
});