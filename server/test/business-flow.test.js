const assert = require('node:assert/strict');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const test = require('node:test');

const serverDirectory = path.join(__dirname, '..');

async function waitForServer(port, process) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (process.exitCode !== null) throw new Error('测试服务器提前退出');
    try {
      await request(port, 'GET', '/');
      return;
    } catch (error) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  throw new Error('测试服务器启动超时');
}

function request(port, method, requestPath, token, body) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? null : JSON.stringify(body);
    const req = http.request({ hostname: '127.0.0.1', port, path: requestPath, method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}) } }, res => {
      let raw = '';
      res.on('data', chunk => { raw += chunk; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: raw ? JSON.parse(raw) : null }); }
        catch (error) { resolve({ status: res.statusCode, body: raw }); }
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function login(port, username) {
  const response = await request(port, 'POST', '/api/auth/login', null, { username, password: 'jiarui123' });
  assert.equal(response.body.code, 200, `${username} 登录失败`);
  return response.body.data.accessToken;
}

test('complete logistics lifecycle keeps state and resources consistent', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jiarui-e2e-'));
  const dataFile = path.join(directory, 'data.json');
  const port = 3200 + Math.floor(Math.random() * 500);
  const child = spawn(process.execPath, ['server.js'], { cwd: serverDirectory, env: { ...process.env, PORT: String(port), DATA_FILE: dataFile, JWT_SECRET: 'e2e_secret' }, stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', chunk => { stderr += chunk; });
  t.after(() => { if (child.exitCode === null) child.kill(); fs.rmSync(directory, { recursive: true, force: true }); });
  await waitForServer(port, child);

  const admin = await login(port, 'admin');
  const dispatcher = await login(port, 'dispatcher');
  const finance = await login(port, 'finance');
  const customer = await login(port, 'customer1');
  const driverUser = await login(port, 'driver1');

  const customers = await request(port, 'GET', '/api/customer?all=1', admin);
  const customerId = customers.body.data[0].id;
  const customerList = await request(port, 'GET', '/api/customer?all=1', customer);
  assert.equal(customerList.body.code, 200);
  assert.equal(customerList.body.data.length, 1, '客户账号只能看到自己的客户档案');
  const otherCustomer = customers.body.data.find(item => item.id !== customerId);
  assert.equal((await request(port, 'GET', `/api/customer/${otherCustomer.id}/address`, customer)).body.code, 403, '客户不能读取其他客户地址');
  assert.equal((await request(port, 'GET', '/api/customer', driverUser)).status, 403, '司机不能读取客户主数据');
  assert.equal((await request(port, 'GET', '/api/dispatch/vehicles', customer)).status, 403, '客户不能读取调度资源');
  assert.equal((await request(port, 'GET', '/api/dashboard', customer)).body.code, 200, '客户看板应可用');
  assert.equal((await request(port, 'GET', '/api/fleet/positions', customer)).body.code, 200, '客户车队位置应按客户范围可用');
  const missingCoordinate = await request(port, 'POST', '/api/waybill', dispatcher, { customerId, cargoName: '缺少坐标的运单', cargoWeightKg: 500, pickupStops: [{ province: '广东省', city: '深圳市', district: '宝安区', addressDetail: '测试起点' }], deliveryStops: [{ province: '广东省', city: '广州市', district: '黄埔区', addressDetail: '测试终点' }] });
  assert.equal(missingCoordinate.body.code, 400, '缺少精确起终点坐标时必须拒绝建单');
  const created = await request(port, 'POST', '/api/waybill', dispatcher, { customerId, cargoName: '端到端测试货物', cargoWeightKg: 500, cargoPieces: 5, pickupStops: [{ contactName: '发货人', contactPhone: '13800000001', province: '广东省', city: '深圳市', district: '宝安区', addressDetail: '测试起点', longitude: 113.9001, latitude: 22.5601 }], deliveryStops: [{ contactName: '收货人', contactPhone: '13800000002', province: '广东省', city: '广州市', district: '黄埔区', addressDetail: '测试终点', longitude: 113.4701, latitude: 23.1101 }] });
  assert.equal(created.body.code, 200);
  const waybillId = created.body.data.id;
  const initialTrack = await request(port, 'GET', `/api/waybill/track/${created.body.data.waybill_no}`, admin);
  assert.equal(initialTrack.body.data.stops[0].longitude, 113.9001, '轨迹起点必须使用运单提交的精确坐标');
  assert.equal(initialTrack.body.data.stops.at(-1).longitude, 113.4701, '轨迹终点必须使用运单提交的精确坐标');
  assert.ok(initialTrack.body.data.plannedRoute.length > 1, '建单后应生成计划路线');
  assert.equal(initialTrack.body.data.gpsRecords.length, 0, '未开始运输前不得伪造实际 GPS 轨迹');

  const createdVehicle = await request(port, 'POST', '/api/vehicle', admin, { plate_number: '粤B-E2E01', vehicle_type: 'medium_truck', max_load_kg: 5000, status: 'idle' });
  const createdDriver = await request(port, 'POST', '/api/driver', admin, { name: '端到端司机', phone: '13800000003', status: 'available' });
  const idleVehicle = createdVehicle.body.data;
  const availableDriver = createdDriver.body.data;
  const invalidSchedule = await request(port, 'POST', `/api/waybill/${waybillId}/transition`, dispatcher, { status: 'scheduled', vehicleId: 999999, driverId: availableDriver.id });
  assert.equal(invalidSchedule.body.code, 400);
  const afterInvalid = await request(port, 'GET', `/api/waybill/${waybillId}`, admin);
  assert.equal(afterInvalid.body.data.status, 'confirmed', '派车失败不得提前改变运单状态');


  const scheduled = await request(port, 'POST', `/api/waybill/${waybillId}/transition`, dispatcher, { status: 'scheduled', vehicleId: idleVehicle.id, driverId: availableDriver.id });
  assert.equal(scheduled.body.code, 200);

  for (const status of ['loaded', 'in_transit', 'arrived', 'signed', 'completed']) {
    const transitioned = await request(port, 'POST', `/api/waybill/${waybillId}/transition`, dispatcher, { status });
    assert.equal(transitioned.body.code, 200, `流转至 ${status} 失败`);
  }

  const vehicleAfterCompletion = await request(port, 'GET', `/api/vehicle/${idleVehicle.id}`, admin);
  const driverAfterCompletion = await request(port, 'GET', `/api/driver/${availableDriver.id}`, admin);
  assert.equal(vehicleAfterCompletion.body.data.status, 'idle', '完结后车辆必须释放');
  assert.equal(driverAfterCompletion.body.data.status, 'available', '完结后司机必须释放');

  const cost = await request(port, 'POST', '/api/cost/item', finance, { waybillId, costType: 'fuel', costAmount: 100, costDesc: '测试油费' });
  assert.equal(cost.body.code, 200);
  const snapshot = await request(port, 'POST', `/api/cost/snapshot/${waybillId}`, finance, {});
  assert.ok(Number(snapshot.body.data.directCost) >= 100, '已录入费用应计入成本快照');

  const completed = await request(port, 'GET', `/api/waybill/${waybillId}`, admin);
  const createdAt = new Date(completed.body.data.created_at.replace(' ', 'T'));
  const billing = await request(port, 'POST', '/api/billing/generate', finance, { customerId, year: createdAt.getFullYear(), month: createdAt.getMonth() + 1 });
  assert.equal(billing.body.code, 200);
  const statementId = billing.body.data.id;

  const prematureConfirm = await request(port, 'POST', `/api/billing/${statementId}/confirm`, finance, {});
  assert.equal(prematureConfirm.body.code, 400, '草稿对账单不能直接确认');
  assert.equal((await request(port, 'POST', `/api/billing/${statementId}/send`, finance, {})).body.code, 200);
  assert.equal((await request(port, 'POST', `/api/billing/${statementId}/confirm`, finance, {})).body.code, 200);

  const waybillDetail = await request(port, 'GET', `/api/waybill/${waybillId}`, admin);
  assert.equal(waybillDetail.body.data.signs.length, 1, '签收状态应生成签收记录');
  assert.ok(waybillDetail.body.data.stops.every(stop => stop.status === 'completed'), '完结运单站点应全部完成');
  assert.equal(waybillDetail.body.data.settlement_status, 'confirmed', '对账确认后运单结算状态应同步');

  const deleteVerifiedCost = await request(port, 'DELETE', `/api/cost/item/${cost.body.data.id}`, finance);
  assert.equal(deleteVerifiedCost.body.code, 400, '已进入对账的运单费用不可删除');

  assert.equal(stderr, '');
});