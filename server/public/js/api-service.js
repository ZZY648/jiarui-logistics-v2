/**
 * 物流管理平台 — 统一 API 服务层
 * =================================
 * 所有后端接口通过此模块访问。
 * 未来接入外部 API 时，只需修改此文件。
 *
 * 当前模式: local (调用 Express 后端)
 * 切换方式: 修改下方 API_MODE 与 API_BASE
 */

// ==================== 配置 ====================
const API_MODE = 'local';           // 'local' | 'external'
const API_BASE = '/api';            // 外部 API 示例: 'https://your-api.example.com/v1'

// ==================== 底层 HTTP 传输 ====================
function _getToken() {
  // 主应用 token
  let t = localStorage.getItem('token');
  if (t) return t;
  // 客户门户 token（存储了整个 user 对象）
  const clientData = localStorage.getItem('client_token');
  if (clientData) {
    try { const u = JSON.parse(clientData); return u.accessToken; } catch (e) { /* ignore */ }
  }
  return null;
}

const API_CACHE_TTL = 10000;
const _apiCache = new Map();

function _clearApiCache() {
  _apiCache.clear();
}

function _apiFetch(url, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };
  const token = _getToken();
  if (token) headers['Authorization'] = 'Bearer ' + token;
  const method = (options.method || 'GET').toUpperCase();
  const cacheKey = token + ':' + url;
  if (method === 'GET') {
    const cached = _apiCache.get(cacheKey);
    if (cached?.data && cached.expiresAt > Date.now()) return Promise.resolve(cached.data);
    if (cached?.promise) return cached.promise;
  }
  const opts = { ...options, headers };
  if (options.body && typeof options.body === 'object') {
    opts.body = JSON.stringify(options.body);
  }
  const request = fetch(API_BASE + url, opts).then(r => r.json()).then(data => {
    if (method === 'GET') _apiCache.set(cacheKey, { data, expiresAt: Date.now() + API_CACHE_TTL });
    else _clearApiCache();
    return data;
  }).catch(error => {
    if (method === 'GET') _apiCache.delete(cacheKey);
    throw error;
  });
  if (method === 'GET') _apiCache.set(cacheKey, { promise: request, expiresAt: 0 });
  return request;
}

// ==================== API 分组 ====================
const JiaruiAPI = {

  // ---------- 认证 ----------
  auth: {
    /** 登录 @returns {{code,data:{accessToken,userId,username,displayName,role,userType,customerId}}} */
    login(username, password) {
      return _apiFetch('/auth/login', { method: 'POST', body: { username, password } });
    },
    /** 获取当前用户信息 */
    me() {
      return _apiFetch('/auth/me');
    }
  },

  // ---------- 数据看板 ----------
  dashboard: {
    /** 获取看板统计数据 */
    getStats() {
      return _apiFetch('/dashboard');
    }
  },

  // ---------- 运单 ----------
  waybill: {
    /** 运单列表 @param {Object} filters - 可选 {status, customer_id, keyword, date_from, date_to} */
    list(filters) {
      const qs = filters ? '?' + Object.entries(filters).filter(([_,v])=>v).map(([k,v])=>k+'='+encodeURIComponent(v)).join('&') : '';
      return _apiFetch('/waybill' + qs);
    },
    /** 获取单条运单详情（含站点、费用、签收记录） */
    get(id) {
      return _apiFetch('/waybill/' + id);
    },
    /** 新建运单 @param {Object} data - {customerId, cargoName, cargoType, cargoWeightKg, ...} */
    create(data) {
      return _apiFetch('/waybill', { method: 'POST', body: data });
    },
    /** 删除运单（仅草稿/已取消） */
    delete(id) {
      return _apiFetch('/waybill/' + id, { method: 'DELETE' });
    },
    /** 状态流转 @param {Object} extra - 可选 {vehicleId, driverId, exceptionDesc, ...} */
    transition(id, status, extra = {}) {
      return _apiFetch('/waybill/' + id + '/transition', {
        method: 'POST',
        body: { status, ...extra }
      });
    },
    /** 物流追踪（含 GPS 轨迹、站点） */
    track(waybillNo) {
      return _apiFetch('/waybill/track/' + waybillNo);
    }
  },

  // ---------- 调度 ----------
  dispatch: {
    /** 车辆列表 */
    getVehicles() {
      return _apiFetch('/dispatch/vehicles');
    },
    /** 司机列表（仅空闲） */
    getDrivers() {
      return _apiFetch('/dispatch/drivers');
    },
    /** 智能推荐车辆（基于载重匹配） */
    recommend(waybillId) {
      return _apiFetch('/dispatch/recommend/' + waybillId);
    }
  },

  // ---------- 费用 ----------
  cost: {
    /** 记录费用 @param {Object} data - {waybillId, costType, costAmount, costDesc} */
    create(data) {
      return _apiFetch('/cost/item', { method: 'POST', body: data });
    },
    /** 费用利润快照 */
    snapshot(waybillId) {
      return _apiFetch('/cost/snapshot/' + waybillId, { method: 'POST' });
    },
    /** 审核费用记录 */
    verify(id) {
      return _apiFetch('/cost/item/' + id + '/verify', { method: 'POST' });
    },
    /** 删除费用记录 */
    deleteItem(id) {
      return _apiFetch('/cost/item/' + id, { method: 'DELETE' });
    }
  },

  // ---------- 对账 ----------
  billing: {
    /** 对账单列表（最近20条） */
    list() {
      return _apiFetch('/billing');
    },
    /** 对账单详情（含明细行） */
    get(id) {
      return _apiFetch('/billing/' + id);
    },
    /** 生成对账单 @param {Object} data - {customerId, year, month} */
    generate(data) {
      return _apiFetch('/billing/generate', { method: 'POST', body: data });
    },
    /** 发送给客户 */
    send(id) {
      return _apiFetch('/billing/' + id + '/send', { method: 'POST' });
    },
    /** 确认对账 */
    confirm(id) {
      return _apiFetch('/billing/' + id + '/confirm', { method: 'POST' });
    },
    /** 删除对账单（仅草稿） */
    delete(id) {
      return _apiFetch('/billing/' + id, { method: 'DELETE' });
    }
  },

  // ---------- 客户 ----------
  customer: {
    /** 客户列表 @param {boolean} all - 传 true 包含停用的 */
    list(all) {
      return _apiFetch('/customer' + (all ? '?all=1' : ''));
    },
    /** 获取客户详情（含地址簿） */
    get(id) {
      return _apiFetch('/customer/' + id);
    },
    /** 新建客户 */
    create(data) {
      return _apiFetch('/customer', { method: 'POST', body: data });
    },
    /** 更新客户 */
    update(id, data) {
      return _apiFetch('/customer/' + id, { method: 'PUT', body: data });
    },
    /** 删除客户 @param {boolean} hard - true=硬删除, false=软删除(status=0) */
    delete(id, hard) {
      return _apiFetch('/customer/' + id + (hard ? '?hard=1' : ''), { method: 'DELETE' });
    },
    /** 获取客户地址簿 */
    getAddresses(customerId) {
      return _apiFetch('/customer/' + customerId + '/address');
    }
  },

  // ---------- 地址簿 ----------
  address: {
    /** 新建地址 */
    create(data) {
      return _apiFetch('/address', { method: 'POST', body: data });
    },
    /** 更新地址 */
    update(id, data) {
      return _apiFetch('/address/' + id, { method: 'PUT', body: data });
    },
    /** 删除地址 */
    delete(id) {
      return _apiFetch('/address/' + id, { method: 'DELETE' });
    }
  },

  // ---------- 车辆 ----------
  vehicle: {
    /** 车辆列表 */
    list() {
      return _apiFetch('/vehicle');
    },
    /** 获取单辆车 */
    get(id) {
      return _apiFetch('/vehicle/' + id);
    },
    /** 新建车辆 */
    create(data) {
      return _apiFetch('/vehicle', { method: 'POST', body: data });
    },
    /** 更新车辆 */
    update(id, data) {
      return _apiFetch('/vehicle/' + id, { method: 'PUT', body: data });
    },
    /** 删除车辆 */
    delete(id) {
      return _apiFetch('/vehicle/' + id, { method: 'DELETE' });
    }
  },

  // ---------- 司机 ----------
  driver: {
    /** 司机列表 @param {boolean} all - 传 true 包含非空闲司机 */
    list(all) {
      return _apiFetch('/driver' + (all ? '?all=1' : ''));
    },
    /** 获取单个司机 */
    get(id) {
      return _apiFetch('/driver/' + id);
    },
    /** 新建司机 */
    create(data) {
      return _apiFetch('/driver', { method: 'POST', body: data });
    },
    /** 更新司机 */
    update(id, data) {
      return _apiFetch('/driver/' + id, { method: 'PUT', body: data });
    },
    /** 删除司机 */
    delete(id) {
      return _apiFetch('/driver/' + id, { method: 'DELETE' });
    },
    /** [司机端] 获取自己的档案 */
    me() {
      return _apiFetch('/driver/me');
    },
    /** [司机端] 获取自己的在途运单 */
    trips() {
      return _apiFetch('/driver/trips');
    },
    /** [司机端] GPS 位置上报 */
    reportGps(data) {
      return _apiFetch('/gps/report', { method: 'POST', body: data });
    }
  },

  // ---------- 用户管理 ----------
  user: {
    /** 用户列表 */
    list() {
      return _apiFetch('/user');
    },
    /** 新建用户 */
    create(data) {
      return _apiFetch('/user', { method: 'POST', body: data });
    },
    /** 更新用户（可选改密码） */
    update(id, data) {
      return _apiFetch('/user/' + id, { method: 'PUT', body: data });
    },
    /** 重置密码 */
    resetPassword(id, password) {
      return _apiFetch('/user/' + id + '/password', { method: 'PUT', body: { password } });
    },
    /** 删除用户 @param {boolean} hard - true=硬删除, false=软禁用(status=0) */
    delete(id, hard) {
      return _apiFetch('/user/' + id + (hard ? '?hard=1' : ''), { method: 'DELETE' });
    },
    /** 启用用户 */
    enable(id) {
      return _apiFetch('/user/' + id, { method: 'PUT', body: { status: 1 } });
    }
  },

  // ---------- 车队 GPS 位置 ----------
  fleet: {
    /** 获取所有在途车辆 GPS 位置 */
    getPositions() {
      return _apiFetch('/fleet/positions');
    }
  }

};
