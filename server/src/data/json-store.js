const fs = require('fs');
const path = require('path');

const DEFAULT_TABLES = [
  'users',
  'customers',
  'vehicles',
  'drivers',
  'waybills',
  'waybillStops',
  'waybillVehicles',
  'costItems',
  'signRecords',
  'exceptionRecords',
  'billingStatements',
  'billingItems',
  'gpsRecords',
  'addressBook'
];

function createEmptyDatabase() {
  return Object.fromEntries(DEFAULT_TABLES.map(table => [table, []]));
}

function timestamp() {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

function createJsonStore(dataFile, logger = console) {
  const db = createEmptyDatabase();
  const nextIds = {};

  function ensureTable(table) {
    if (!Array.isArray(db[table])) throw new Error(`未知数据表: ${table}`);
    return db[table];
  }

  function refreshNextIds() {
    for (const [table, rows] of Object.entries(db)) {
      nextIds[table] = rows.reduce((max, row) => Math.max(max, Number(row.id) || 0), 0) + 1;
    }
  }

  function load() {
    if (fs.existsSync(dataFile)) {
      try {
        const stored = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
        for (const table of DEFAULT_TABLES) {
          db[table] = Array.isArray(stored[table]) ? stored[table] : [];
        }
        for (const [table, rows] of Object.entries(stored)) {
          if (!(table in db) && Array.isArray(rows)) db[table] = rows;
        }
      } catch (error) {
        logger.warn(`数据文件读取失败，使用空数据库: ${error.message}`);
      }
    }
    refreshNextIds();
    return db;
  }

  function save() {
    fs.mkdirSync(path.dirname(dataFile), { recursive: true });
    const tempFile = `${dataFile}.tmp`;
    fs.writeFileSync(tempFile, JSON.stringify(db, null, 2));
    fs.renameSync(tempFile, dataFile);
  }

  function replaceData(snapshot = {}) {
    for (const table of Object.keys(db)) {
      db[table] = Array.isArray(snapshot[table]) ? snapshot[table] : [];
    }
    for (const [table, rows] of Object.entries(snapshot)) {
      if (!(table in db) && Array.isArray(rows)) db[table] = rows;
    }
    refreshNextIds();
    return db;
  }

  function insert(table, record) {
    const rows = ensureTable(table);
    const savedRecord = { ...record, id: nextIds[table]++ };
    if (!savedRecord.created_at) savedRecord.created_at = timestamp();
    rows.push(savedRecord);
    save();
    return savedRecord;
  }

  function findById(table, id) {
    return ensureTable(table).find(record => record.id === id);
  }

  function findByField(table, field, value) {
    return ensureTable(table).filter(record => record[field] === value);
  }

  function updateById(table, id, updates) {
    const record = findById(table, id);
    if (!record) return null;
    Object.assign(record, updates, { updated_at: timestamp() });
    save();
    return record;
  }

  function countByField(table, field, value) {
    return findByField(table, field, value).length;
  }

  function deleteById(table, id) {
    const rows = ensureTable(table);
    const index = rows.findIndex(record => record.id === id);
    if (index < 0) return false;
    rows.splice(index, 1);
    save();
    return true;
  }

  load();

  return { db, save, replaceData, insert, findById, findByField, updateById, countByField, deleteById };
}

module.exports = { createJsonStore, createEmptyDatabase, DEFAULT_TABLES };
