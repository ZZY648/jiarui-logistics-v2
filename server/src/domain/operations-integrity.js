const ACTIVE_WAYBILL_STATUSES = new Set(['scheduled', 'loaded', 'in_transit', 'arrived', 'signed']);

function validateOperationalIntegrity(db) {
  const issues = [];
  const activeAssignments = db.waybillVehicles.map(assignment => ({ assignment, waybill: db.waybills.find(item => item.id === assignment.waybill_id) })).filter(item => item.waybill && ACTIVE_WAYBILL_STATUSES.has(item.waybill.status));
  const vehicleUsage = new Map();
  const driverUsage = new Map();

  for (const item of activeAssignments) {
    const { assignment, waybill } = item;
    const vehicle = db.vehicles.find(candidate => candidate.id === assignment.vehicle_id);
    const driver = assignment.driver_id ? db.drivers.find(candidate => candidate.id === assignment.driver_id) : null;

    if (!vehicle) issues.push({ type: 'missing_vehicle', waybillNo: waybill.waybill_no, vehicleId: assignment.vehicle_id });
    if (!driver) issues.push({ type: 'missing_driver', waybillNo: waybill.waybill_no, driverId: assignment.driver_id || null });
    if (vehicle && (vehicle.max_load_kg || 0) < (waybill.cargo_weight_kg || 0)) issues.push({ type: 'vehicle_overload', waybillNo: waybill.waybill_no, plateNumber: vehicle.plate_number, cargoWeightKg: waybill.cargo_weight_kg, maxLoadKg: vehicle.max_load_kg });

    if (assignment.vehicle_id) {
      const list = vehicleUsage.get(assignment.vehicle_id) || [];
      list.push(waybill.waybill_no);
      vehicleUsage.set(assignment.vehicle_id, list);
    }
    if (assignment.driver_id) {
      const list = driverUsage.get(assignment.driver_id) || [];
      list.push(waybill.waybill_no);
      driverUsage.set(assignment.driver_id, list);
    }
  }

  for (const [vehicleId, waybillNos] of vehicleUsage) {
    if (waybillNos.length > 1) issues.push({ type: 'vehicle_conflict', vehicleId, waybillNos });
  }
  for (const [driverId, waybillNos] of driverUsage) {
    if (waybillNos.length > 1) issues.push({ type: 'driver_conflict', driverId, waybillNos });
  }

  return issues;
}

module.exports = { validateOperationalIntegrity, ACTIVE_WAYBILL_STATUSES };