const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const test = require('node:test');

const { createJsonStore } = require('../src/data/json-store');

function createTestStore(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jiarui-store-'));
  const dataFile = path.join(directory, 'data.json');
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return { dataFile, store: createJsonStore(dataFile) };
}

test('persists inserted and updated records', t => {
  const { dataFile, store } = createTestStore(t);
  const inserted = store.insert('customers', { company_name: '测试客户' });

  assert.equal(inserted.id, 1);
  assert.equal(store.findById('customers', 1).company_name, '测试客户');

  store.updateById('customers', 1, { company_name: '更新客户' });
  const reloaded = createJsonStore(dataFile);
  assert.equal(reloaded.findById('customers', 1).company_name, '更新客户');
});

test('continues ids after reload and supports deletion', t => {
  const { dataFile, store } = createTestStore(t);
  store.insert('vehicles', { plate_number: '粤B00001' });

  const reloaded = createJsonStore(dataFile);
  const second = reloaded.insert('vehicles', { plate_number: '粤B00002' });

  assert.equal(second.id, 2);
  assert.equal(reloaded.countByField('vehicles', 'plate_number', '粤B00002'), 1);
  assert.equal(reloaded.deleteById('vehicles', 1), true);
  assert.equal(reloaded.findById('vehicles', 1), undefined);
});
