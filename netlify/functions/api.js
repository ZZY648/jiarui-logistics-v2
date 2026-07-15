const path = require('path');
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

  try {
    connectLambda(event);
    blobStore = getStore('jiarui-logistics-data');
    const snapshot = await blobStore.get('database', { type: 'json' });
    if (snapshot) store.replaceData(snapshot);
  } catch (error) {
    console.warn(`Netlify Blobs read unavailable: ${error.message}`);
  }

  const response = await expressHandler(event, context);

  if (blobStore && !READ_ONLY_METHODS.has(event.httpMethod || 'GET')) {
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