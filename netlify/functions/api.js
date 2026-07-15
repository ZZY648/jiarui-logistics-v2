const path = require('path');
const bcrypt = require('bcryptjs');
const serverless = require('serverless-http');
const { connectLambda, getStore } = require('@netlify/blobs');

process.env.NODE_ENV = 'production';
process.env.DATA_FILE ||= path.join('/tmp', 'jiarui-logistics', 'data.json');

const { app, store } = require('../../server/server');
const expressHandler = serverless(app);
const READ_ONLY_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
let requestQueue = Promise.resolve();

async function handleRequest(event, context) {
  let blobStore;
  let snapshotDataChanged = false;

  try {
    connectLambda(event);
    blobStore = getStore('jiarui-logistics-data');
    const snapshot = await blobStore.get('database', { type: 'json' });
    if (snapshot) store.replaceData(snapshot);
    store.db._migrations ||= [];
    if (!store.db._migrations.includes('driver-gps-shanghai-time-v1')) {
      store.db.gpsRecords.filter(record => record.driver_id && record.device_time).forEach(record => {
        const timestamp = Date.parse(`${record.device_time.replace(' ', 'T')}Z`);
        if (Number.isFinite(timestamp)) record.device_time = new Date(timestamp + 8 * 60 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' ');
      });
      store.db._migrations.push('driver-gps-shanghai-time-v1');
      store.save();
      snapshotDataChanged = true;
    }
    const demoPassword = process.env.SEED_PASSWORD;
    const passwordMigration = demoPassword ? `demo-password-${demoPassword}-v1` : null;
    if (passwordMigration && !store.db._migrations.includes(passwordMigration)) {
      const passwordHash = bcrypt.hashSync(demoPassword, 10);
      store.db.users.forEach(user => { user.password_hash = passwordHash; });
      store.db._migrations.push(passwordMigration);
      store.save();
      snapshotDataChanged = true;
    }
  } catch (error) {
    console.warn(`Netlify Blobs read unavailable: ${error.message}`);
  }

  const response = await expressHandler(event, context);

  if (blobStore && (snapshotDataChanged || !READ_ONLY_METHODS.has(event.httpMethod || 'GET'))) {
    try {
      await blobStore.setJSON('database', store.db);
    } catch (error) {
      console.error(`Netlify Blobs write failed: ${error.message}`);
      return {
        statusCode: 503,
        headers: { 'content-type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ code: 503, message: '数据保存失败，请稍后重试' })
      };
    }
  }

  return response;
}

exports.handler = (event, context) => {
  const currentRequest = requestQueue.then(() => handleRequest(event, context));
  requestQueue = currentRequest.catch(() => undefined);
  return currentRequest;
};