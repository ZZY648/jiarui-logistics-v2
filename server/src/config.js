const path = require('path');

const DEFAULT_JWT_SECRET = 'jiarui_logistics_jwt_secret_2024';
const DEFAULT_SEED_PASSWORD = 'wuliu123';

function loadConfig(env = process.env) {
  const defaultDataFile = env.NODE_ENV === 'production'
    ? path.join(__dirname, '..', '.data', 'data.json')
    : path.join(__dirname, '..', 'data.json');

  return {
    port: Number(env.PORT) || 3000,
    jwtSecret: env.JWT_SECRET || DEFAULT_JWT_SECRET,
    seedPassword: env.SEED_PASSWORD || DEFAULT_SEED_PASSWORD,
    dataFile: env.DATA_FILE ? path.resolve(env.DATA_FILE) : defaultDataFile,
    publicDir: path.join(__dirname, '..', 'public')
  };
}

module.exports = { loadConfig, DEFAULT_JWT_SECRET, DEFAULT_SEED_PASSWORD };
