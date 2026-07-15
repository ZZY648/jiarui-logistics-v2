const express = require('express');

function createVehicleRouter({ db, store, auth, hasRole }) {
  const router = express.Router();
  const { insert, findById, updateById, deleteById } = store;
  const readRoles = hasRole('admin', 'ops_manager', 'dispatcher', 'finance_manager', 'finance', 'customer_service', 'boss');

  router.get('/', auth, readRoles, (req, res) => res.json({ code: 200, data: db.vehicles }));

  router.get('/:id', auth, readRoles, (req, res) => {
    const vehicle = findById('vehicles', parseInt(req.params.id));
    if (!vehicle) return res.json({ code: 404, message: '车辆不存在' });
    return res.json({ code: 200, data: vehicle });
  });

  router.post('/', auth, hasRole('admin', 'ops_manager', 'dispatcher'), (req, res) => {
    const maxCode = db.vehicles.reduce((max, vehicle) => {
      const number = parseInt(vehicle.vehicle_code?.replace('V', ''));
      return number > max ? number : max;
    }, 0);
    const body = req.body;
    const vehicle = insert('vehicles', {
      vehicle_code: `V${String(maxCode + 1).padStart(3, '0')}`,
      plate_number: body.plate_number,
      vehicle_type: body.vehicle_type || 'medium_truck',
      brand_model: body.brand_model || '',
      max_load_kg: parseFloat(body.max_load_kg) || 0,
      max_volume_m3: parseFloat(body.max_volume_m3) || 0,
      length_m: parseFloat(body.length_m) || 0,
      gps_device_id: body.gps_device_id || '',
      fuel_type: body.fuel_type || 'diesel',
      monthly_depreciation: parseFloat(body.monthly_depreciation) || 0,
      monthly_insurance: parseFloat(body.monthly_insurance) || 0,
      status: body.status || 'idle'
    });
    res.json({ code: 200, data: vehicle });
  });

  router.put('/:id', auth, hasRole('admin', 'ops_manager', 'dispatcher'), (req, res) => {
    const updates = {};
    ['plate_number', 'vehicle_type', 'brand_model', 'max_load_kg', 'max_volume_m3', 'length_m', 'gps_device_id', 'fuel_type', 'monthly_depreciation', 'monthly_insurance', 'status'].forEach(key => { if (req.body[key] !== undefined) updates[key] = req.body[key]; });
    const vehicle = updateById('vehicles', parseInt(req.params.id), updates);
    if (!vehicle) return res.json({ code: 404, message: '车辆不存在' });
    return res.json({ code: 200, data: vehicle });
  });

  router.delete('/:id', auth, hasRole('admin', 'ops_manager'), (req, res) => {
    const id = parseInt(req.params.id);
    if (db.waybillVehicles.some(relation => relation.vehicle_id === id)) return res.json({ code: 400, message: '该车辆有关联运单记录,无法删除' });
    if (!deleteById('vehicles', id)) return res.json({ code: 404, message: '车辆不存在' });
    return res.json({ code: 200, message: '已删除' });
  });

  return router;
}

module.exports = { createVehicleRouter };