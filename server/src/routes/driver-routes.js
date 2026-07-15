const express = require('express');
const { wgs84ToGcj02 } = require('../geo/coordinates');
const { formatLocalTimestamp } = require('../time');

function createDriverRouter({ db, store, auth, hasRole }) {
  const router = express.Router();
  const { insert, findById, findByField, updateById, deleteById } = store;
  const readRoles = hasRole('admin', 'ops_manager', 'dispatcher', 'finance_manager', 'finance', 'customer_service', 'boss');

  router.get('/me', auth, (req, res) => {
    if (req.user.role !== 'driver') return res.json({ code: 403, message: '仅限司机访问' });
    const driver = db.drivers.find(item => item.user_id === req.user.userId);
    if (!driver) return res.json({ code: 404, message: '司机档案不存在' });
    return res.json({ code: 200, data: driver });
  });

  router.get('/trips', auth, (req, res) => {
    if (req.user.role !== 'driver') return res.json({ code: 403, message: '仅限司机访问' });
    const driver = db.drivers.find(item => item.user_id === req.user.userId);
    if (!driver) return res.json({ code: 404, message: '司机档案不存在' });
    const waybillIds = findByField('waybillVehicles', 'driver_id', driver.id).map(relation => relation.waybill_id);
    const trips = db.waybills.filter(waybill => waybillIds.includes(waybill.id) && ['loaded', 'in_transit', 'arrived'].includes(waybill.status)).map(waybill => {
      const customer = findById('customers', waybill.customer_id);
      const stops = findByField('waybillStops', 'waybill_id', waybill.id);
      const recentGps = findByField('gpsRecords', 'waybill_id', waybill.id).filter(record=>record.driver_id===driver.id).sort((first,second)=>(first.device_time||'').localeCompare(second.device_time||'')).slice(-5);
      return { ...waybill, customer_name: customer ? customer.short_name : '', stops, recentGps };
    });
    return res.json({ code: 200, data: trips });
  });

  router.get('/', auth, readRoles, (req, res) => {
    const all = req.query.all === '1';
    res.json({ code: 200, data: all ? db.drivers : db.drivers.filter(driver => driver.status === 'available') });
  });

  router.get('/:id', auth, readRoles, (req, res) => {
    const driver = findById('drivers', parseInt(req.params.id));
    if (!driver) return res.json({ code: 404, message: '司机不存在' });
    return res.json({ code: 200, data: driver });
  });

  router.post('/', auth, hasRole('admin', 'ops_manager', 'dispatcher'), (req, res) => {
    const maxCode = db.drivers.reduce((max, driver) => {
      const number = parseInt(driver.driver_code?.replace('D', ''));
      return number > max ? number : max;
    }, 0);
    const driver = insert('drivers', { driver_code: `D${String(maxCode + 1).padStart(3, '0')}`, name: req.body.name, phone: req.body.phone || '', license_type: req.body.license_type || 'B2', status: req.body.status || 'available' });
    res.json({ code: 200, data: driver });
  });

  router.put('/:id', auth, hasRole('admin', 'ops_manager', 'dispatcher'), (req, res) => {
    const updates = {};
    ['name', 'phone', 'license_type', 'status'].forEach(key => { if (req.body[key] !== undefined) updates[key] = req.body[key]; });
    const driver = updateById('drivers', parseInt(req.params.id), updates);
    if (!driver) return res.json({ code: 404, message: '司机不存在' });
    return res.json({ code: 200, data: driver });
  });

  router.delete('/:id', auth, hasRole('admin', 'ops_manager'), (req, res) => {
    const id = parseInt(req.params.id);
    if (db.waybillVehicles.some(relation => relation.driver_id === id)) return res.json({ code: 400, message: '该司机有关联运单记录,无法删除' });
    if (!deleteById('drivers', id)) return res.json({ code: 404, message: '司机不存在' });
    return res.json({ code: 200, message: '已删除' });
  });

  return router;
}

function createGpsRouter({ db, store, auth }) {
  const router = express.Router();
  const { insert, findById } = store;

  router.post('/report', auth, (req, res) => {
    if (req.user.role !== 'driver') return res.json({ code: 403, message: '仅限司机访问' });
    const { waybillId, longitude, latitude, speedKmh, accuracyM, deviceTimestamp } = req.body;
    const driver = db.drivers.find(item => item.user_id === req.user.userId);
    if (!driver) return res.json({ code: 404, message: '司机档案不存在' });
    const parsedWaybillId = parseInt(waybillId);
    const waybill = findById('waybills', parsedWaybillId);
    if (!waybill) return res.json({ code: 400, message: '运单不存在' });
    if (!['loaded', 'in_transit'].includes(waybill.status)) return res.json({ code: 400, message: '当前运单状态不允许上报定位' });
    const relation = db.waybillVehicles.find(item => item.waybill_id === parsedWaybillId && item.driver_id === driver.id);
    if (!relation) return res.json({ code: 403, message: '你没有该运单的运输权限' });
    const parsedLatitude = Number(latitude);
    const parsedLongitude = Number(longitude);
    const parsedAccuracy = Number(accuracyM);
    const parsedDeviceTimestamp = Number(deviceTimestamp);
    if (!Number.isFinite(parsedLatitude) || !Number.isFinite(parsedLongitude) || parsedLatitude < -90 || parsedLatitude > 90 || parsedLongitude < -180 || parsedLongitude > 180) return res.json({ code: 400, message: '坐标无效' });
    if (Number.isFinite(parsedAccuracy) && parsedAccuracy > 1000) return res.json({ code: 400, message: '当前定位精度过低，请移动到开阔位置后重试' });
    if (Number.isFinite(parsedDeviceTimestamp) && Math.abs(Date.now() - parsedDeviceTimestamp) > 120000) return res.json({ code: 400, message: '定位数据已过期，请重新获取当前位置' });
    const converted = wgs84ToGcj02(parsedLongitude, parsedLatitude);
    const record = insert('gpsRecords', { vehicle_id: relation.vehicle_id, waybill_id: parsedWaybillId, driver_id: driver.id, longitude: converted.longitude, latitude: converted.latitude, coordinate_system: 'gcj02', accuracy_m: Number.isFinite(parsedAccuracy) ? parsedAccuracy : null, speed_kmh: Number.isFinite(Number(speedKmh)) ? Math.max(0, Number(speedKmh)) : 0, device_time: formatLocalTimestamp(Number.isFinite(parsedDeviceTimestamp) ? new Date(parsedDeviceTimestamp) : new Date()) });
    return res.json({ code: 200, data: record });
  });

  return router;
}

module.exports = { createDriverRouter, createGpsRouter };