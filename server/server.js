const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const path = require('path');
const https = require('https');
const { loadConfig, DEFAULT_JWT_SECRET, DEFAULT_SEED_PASSWORD } = require('./src/config');
const { createJsonStore } = require('./src/data/json-store');
const { createAuthMiddleware, hasRole, customerScope } = require('./src/middleware/auth');
const { createAuthRouter } = require('./src/routes/auth-routes');
const { createUserRouter } = require('./src/routes/user-routes');
const { createCustomerRouter, createAddressRouter } = require('./src/routes/customer-routes');
const { createVehicleRouter } = require('./src/routes/vehicle-routes');
const { createDriverRouter, createGpsRouter } = require('./src/routes/driver-routes');
const { validateOperationalIntegrity } = require('./src/domain/operations-integrity');
const { buildLinearRoute } = require('./src/geo/coordinates');

const app = express();
const config = loadConfig();
const { port: PORT, jwtSecret: JWT_SECRET, seedPassword: SEED_PASSWORD, dataFile: DATA_FILE, publicDir: PUBLIC_DIR } = config;

if (JWT_SECRET === DEFAULT_JWT_SECRET) {
  console.warn('警告: 当前使用默认 JWT_SECRET，生产环境请通过环境变量设置。');
}
if (process.env.NODE_ENV === 'production' && SEED_PASSWORD === DEFAULT_SEED_PASSWORD) {
  console.warn('警告: 当前使用默认演示密码，公开部署请通过 SEED_PASSWORD 环境变量设置。');
}

app.use(express.json());
app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.use(express.static(PUBLIC_DIR));
app.use('/client', express.static(path.join(PUBLIC_DIR, 'client')));
app.use('/driver', express.static(path.join(PUBLIC_DIR, 'driver')));

// ====================== JSON 文件数据存储 ======================
const store = createJsonStore(DATA_FILE);
const DB = store.db;
const { insert, findById, findByField, updateById, countByField, deleteById } = store;
const integrityIssues = validateOperationalIntegrity(DB);
if (integrityIssues.length > 0) {
  console.warn('警告: 检测到运营数据一致性问题，请及时处理:');
  integrityIssues.forEach(issue => console.warn(JSON.stringify(issue)));
}

// 从 OSRM 获取两点间真实公路路径，返回 [[lng,lat], ...] 数组
function fetchOSRMRoute(fromLng, fromLat, toLng, toLat) {
  return new Promise((resolve, reject) => {
    const url = `https://router.project-osrm.org/route/v1/driving/${fromLng},${fromLat};${toLng},${toLat}?overview=full&geometries=geojson`;
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.code !== 'Ok' || !json.routes?.length) return resolve(null);
          resolve(json.routes[0].geometry.coordinates); // [[lng,lat],...]
        } catch(e) { resolve(null); }
      });
    }).on('error', () => resolve(null));
  });
}

// 生成 GPS 轨迹点：优先用 OSRM 真实路径，回退到直线插值
async function generateGPSPoints(waybillId, vehicleId, fromLng, fromLat, toLng, toLat) {
  const points = [];
  // 尝试 OSRM
  const route = await fetchOSRMRoute(fromLng, fromLat, toLng, toLat);
  if (route && route.length >= 2) {
    // OSRM 返回数百个点，采样约 12-20 个
    const step = Math.max(1, Math.floor(route.length / 15));
    const now = Date.now();
    for (let i = 0; i < route.length; i += step) {
      const [lng, lat] = route[i];
      points.push({
        vehicle_id: vehicleId || null, waybill_id: waybillId,
        longitude: lng, latitude: lat,
        speed_kmh: 50 + Math.floor(Math.random() * 30),
        device_time: new Date(now - (route.length - i) * 20000).toISOString().slice(0, 19).replace('T', ' ')
      });
    }
    // 确保包含终点
    const last = route[route.length - 1];
    points.push({
      vehicle_id: vehicleId || null, waybill_id: waybillId,
      longitude: last[0], latitude: last[1],
      speed_kmh: 0,
      device_time: new Date(now).toISOString().slice(0, 19).replace('T', ' ')
    });
  } else {
    // 回退：直线插值
    const steps = 8;
    const now = new Date();
    for (let i = 0; i < steps; i++) {
      const t = i / (steps - 1);
      points.push({
        vehicle_id: vehicleId || null, waybill_id: waybillId,
        longitude: fromLng + (toLng - fromLng) * t + (Math.random() - 0.5) * 0.03,
        latitude: fromLat + (toLat - fromLat) * t + (Math.random() - 0.5) * 0.03,
        speed_kmh: 60 + Math.random() * 20,
        device_time: new Date(now.getTime() - (steps - i) * 1800000).toISOString().slice(0, 19).replace('T', ' ')
      });
    }
  }
  return points;
}


// ====================== 中国城市坐标库 (GCJ-02，适配高德地图瓦片) ======================
// 按城市名+区名做 key，支持省→市→区三级回退
const CITY_COORDS = {
  北京:{lat:39.9042,lng:116.4074},北京市:{lat:39.9042,lng:116.4074},朝阳区:{lat:39.9215,lng:116.4433},海淀区:{lat:39.9598,lng:116.2981},丰台区:{lat:39.8585,lng:116.2870},大兴区:{lat:39.7268,lng:116.3386},通州区:{lat:39.9093,lng:116.6592},顺义区:{lat:40.1292,lng:116.6540},
  上海:{lat:31.2304,lng:121.4737},上海市:{lat:31.2304,lng:121.4737},浦东新区:{lat:31.2213,lng:121.5449},徐汇区:{lat:31.1880,lng:121.4369},闵行区:{lat:31.1117,lng:121.3805},嘉定区:{lat:31.3756,lng:121.2660},松江区:{lat:31.0315,lng:121.2272},宝山区:{lat:31.4046,lng:121.4889},
  广州:{lat:23.1291,lng:113.2644},广州市:{lat:23.1291,lng:113.2644},天河区:{lat:23.1247,lng:113.3612},黄埔区:{lat:23.1065,lng:113.4593},白云区:{lat:23.1577,lng:113.2731},番禺区:{lat:22.9378,lng:113.3839},花都区:{lat:23.4042,lng:113.2203},增城区:{lat:23.2608,lng:113.8111},从化区:{lat:23.5484,lng:113.5864},南沙区:{lat:22.8017,lng:113.5252},
  深圳:{lat:22.5431,lng:114.0579},深圳市:{lat:22.5431,lng:114.0579},南山区:{lat:22.5333,lng:113.9305},福田区:{lat:22.5209,lng:114.0552},罗湖区:{lat:22.5482,lng:114.1315},宝安区:{lat:22.5568,lng:113.8840},龙岗区:{lat:22.7199,lng:114.2495},龙华区:{lat:22.6957,lng:114.0454},坪山区:{lat:22.6906,lng:114.3465},光明区:{lat:22.7479,lng:113.9358},
  东莞:{lat:23.0208,lng:113.7518},东莞市:{lat:23.0208,lng:113.7518},长安镇:{lat:22.8155,lng:113.8028},虎门镇:{lat:22.8147,lng:113.6728},厚街镇:{lat:22.9388,lng:113.6707},塘厦镇:{lat:22.8075,lng:114.1020},
  惠州:{lat:23.1118,lng:114.4158},惠州市:{lat:23.1118,lng:114.4158},惠城区:{lat:23.0841,lng:114.3826},惠阳区:{lat:22.7887,lng:114.4567},仲恺区:{lat:23.0350,lng:114.3927},
  佛山:{lat:23.0218,lng:113.1216},佛山市:{lat:23.0218,lng:113.1216},禅城区:{lat:23.0094,lng:113.1228},南海区:{lat:23.0286,lng:113.1440},顺德区:{lat:22.8053,lng:113.2933},
  珠海:{lat:22.2707,lng:113.5767},珠海市:{lat:22.2707,lng:113.5767},香洲区:{lat:22.2664,lng:113.5437},金湾区:{lat:22.0629,lng:113.3635},斗门区:{lat:22.2108,lng:113.2970},
  中山:{lat:22.5160,lng:113.3824},中山市:{lat:22.5160,lng:113.3824},
  江门:{lat:22.5787,lng:113.0819},江门市:{lat:22.5787,lng:113.0819},
  肇庆:{lat:23.0471,lng:112.4651},肇庆市:{lat:23.0471,lng:112.4651},
  汕头:{lat:23.3535,lng:116.6822},汕头市:{lat:23.3535,lng:116.6822},
  潮州:{lat:23.6570,lng:116.6220},潮州市:{lat:23.6570,lng:116.6220},
  揭阳:{lat:23.5497,lng:116.3727},揭阳市:{lat:23.5497,lng:116.3727},
  湛江:{lat:21.2710,lng:110.3589},湛江市:{lat:21.2710,lng:110.3589},
  茂名:{lat:21.6627,lng:110.9253},茂名市:{lat:21.6627,lng:110.9253},
  阳江:{lat:21.8582,lng:111.9828},阳江市:{lat:21.8582,lng:111.9828},
  韶关:{lat:24.8014,lng:113.5966},韶关市:{lat:24.8014,lng:113.5966},
  清远:{lat:23.6818,lng:113.0562},清远市:{lat:23.6818,lng:113.0562},
  河源:{lat:23.7437,lng:114.7004},河源市:{lat:23.7437,lng:114.7004},
  梅州:{lat:24.2886,lng:116.1225},梅州市:{lat:24.2886,lng:116.1225},
  汕尾:{lat:22.7865,lng:115.3753},汕尾市:{lat:22.7865,lng:115.3753},
  云浮:{lat:22.9153,lng:112.0443},云浮市:{lat:22.9153,lng:112.0443},
  杭州:{lat:30.2741,lng:120.1551},杭州市:{lat:30.2741,lng:120.1551},西湖区:{lat:30.2596,lng:120.1302},余杭区:{lat:30.4188,lng:120.2992},萧山区:{lat:30.1843,lng:120.2648},滨江区:{lat:30.2086,lng:120.2122},
  宁波:{lat:29.8683,lng:121.5440},宁波市:{lat:29.8683,lng:121.5440},鄞州区:{lat:29.8165,lng:121.5475},海曙区:{lat:29.8597,lng:121.5506},
  温州:{lat:28.0015,lng:120.6994},温州市:{lat:28.0015,lng:120.6994},
  嘉兴:{lat:30.7735,lng:120.7555},嘉兴市:{lat:30.7735,lng:120.7555},
  湖州:{lat:30.8930,lng:120.0868},湖州市:{lat:30.8930,lng:120.0868},
  绍兴:{lat:30.0297,lng:120.5862},绍兴市:{lat:30.0297,lng:120.5862},
  金华:{lat:29.0781,lng:119.6472},金华市:{lat:29.0781,lng:119.6472},义乌市:{lat:29.3068,lng:120.0750},
  台州:{lat:28.6560,lng:121.4208},台州市:{lat:28.6560,lng:121.4208},
  南京:{lat:32.0603,lng:118.7969},南京市:{lat:32.0603,lng:118.7969},江宁区:{lat:31.9537,lng:118.8468},浦口区:{lat:32.0588,lng:118.6275},栖霞区:{lat:32.0962,lng:118.9094},鼓楼区:{lat:32.0664,lng:118.7697},
  苏州:{lat:31.2990,lng:120.5853},苏州市:{lat:31.2990,lng:120.5853},工业园区:{lat:31.3194,lng:120.6735},吴中区:{lat:31.2621,lng:120.6329},昆山市:{lat:31.3856,lng:120.9812},常熟市:{lat:31.6544,lng:120.7526},
  无锡:{lat:31.4912,lng:120.3124},无锡市:{lat:31.4912,lng:120.3124},新吴区:{lat:31.5505,lng:120.3633},
  常州:{lat:31.8107,lng:119.9737},常州市:{lat:31.8107,lng:119.9737},
  南通:{lat:31.9796,lng:120.8943},南通市:{lat:31.9796,lng:120.8943},
  扬州:{lat:32.3936,lng:119.4129},扬州市:{lat:32.3936,lng:119.4129},
  镇江:{lat:32.1896,lng:119.4250},镇江市:{lat:32.1896,lng:119.4250},
  徐州:{lat:34.2058,lng:117.2842},徐州市:{lat:34.2058,lng:117.2842},
  盐城:{lat:33.3495,lng:120.1616},盐城市:{lat:33.3495,lng:120.1616},
  泰州:{lat:32.4555,lng:119.9245},泰州市:{lat:32.4555,lng:119.9245},
  淮安:{lat:33.6101,lng:119.0153},淮安市:{lat:33.6101,lng:119.0153},
  连云港:{lat:34.5967,lng:119.2229},连云港市:{lat:34.5967,lng:119.2229},
  宿迁:{lat:33.9620,lng:118.2755},宿迁市:{lat:33.9620,lng:118.2755},
  合肥:{lat:31.8206,lng:117.2272},合肥市:{lat:31.8206,lng:117.2272},蜀山区:{lat:31.8517,lng:117.2604},包河区:{lat:31.7943,lng:117.3092},庐阳区:{lat:31.8787,lng:117.2648},瑶海区:{lat:31.8580,lng:117.3096},肥西县:{lat:31.7219,lng:117.1680},肥东县:{lat:31.8879,lng:117.4693},
  芜湖:{lat:31.3527,lng:118.4329},芜湖市:{lat:31.3527,lng:118.4329},
  马鞍山:{lat:31.6705,lng:118.5064},马鞍山市:{lat:31.6705,lng:118.5064},
  安庆:{lat:30.5426,lng:117.0635},安庆市:{lat:30.5426,lng:117.0635},
  蚌埠:{lat:32.9163,lng:117.3890},蚌埠市:{lat:32.9163,lng:117.3890},
  阜阳:{lat:32.8896,lng:115.8149},阜阳市:{lat:32.8896,lng:115.8149},
  滁州:{lat:32.3021,lng:118.3170},滁州市:{lat:32.3021,lng:118.3170},
  武汉:{lat:30.5928,lng:114.3055},武汉市:{lat:30.5928,lng:114.3055},洪山区:{lat:30.4995,lng:114.3432},江夏区:{lat:30.3756,lng:114.3216},东西湖区:{lat:30.6222,lng:114.1362},蔡甸区:{lat:30.5823,lng:114.0293},黄陂区:{lat:30.8811,lng:114.3757},
  宜昌:{lat:30.6907,lng:111.2868},宜昌市:{lat:30.6907,lng:111.2868},
  襄阳:{lat:32.0090,lng:112.1224},襄阳市:{lat:32.0090,lng:112.1224},
  荆州:{lat:30.3352,lng:112.2407},荆州市:{lat:30.3352,lng:112.2407},
  黄石:{lat:30.1995,lng:115.0391},黄石市:{lat:30.1995,lng:115.0391},
  十堰:{lat:32.6512,lng:110.7979},十堰市:{lat:32.6512,lng:110.7979},
  长沙:{lat:28.2282,lng:112.9388},长沙市:{lat:28.2282,lng:112.9388},岳麓区:{lat:28.2353,lng:112.9317},雨花区:{lat:28.1383,lng:113.0386},芙蓉区:{lat:28.1865,lng:113.0331},开福区:{lat:28.2570,lng:112.9855},天心区:{lat:28.1134,lng:112.9900},长沙县:{lat:28.2466,lng:113.0806},
  株洲:{lat:27.8277,lng:113.1339},株洲市:{lat:27.8277,lng:113.1339},
  湘潭:{lat:27.8298,lng:112.9442},湘潭市:{lat:27.8298,lng:112.9442},
  衡阳:{lat:26.8932,lng:112.5720},衡阳市:{lat:26.8932,lng:112.5720},
  岳阳:{lat:29.3570,lng:113.1292},岳阳市:{lat:29.3570,lng:113.1292},
  常德:{lat:29.0315,lng:111.6985},常德市:{lat:29.0315,lng:111.6985},
  成都:{lat:30.5728,lng:104.0668},成都市:{lat:30.5728,lng:104.0668},高新区:{lat:30.5954,lng:104.0503},武侯区:{lat:30.6424,lng:104.0430},锦江区:{lat:30.6578,lng:104.0838},青羊区:{lat:30.6742,lng:104.0610},金牛区:{lat:30.6910,lng:104.0514},成华区:{lat:30.6598,lng:104.1019},双流区:{lat:30.5745,lng:103.9237},龙泉驿区:{lat:30.5563,lng:104.2747},郫都区:{lat:30.7956,lng:103.9019},
  绵阳:{lat:31.4675,lng:104.6791},绵阳市:{lat:31.4675,lng:104.6791},
  德阳:{lat:31.1268,lng:104.3979},德阳市:{lat:31.1268,lng:104.3979},
  宜宾:{lat:28.7513,lng:104.6433},宜宾市:{lat:28.7513,lng:104.6433},
  泸州:{lat:28.8717,lng:105.4424},泸州市:{lat:28.8717,lng:105.4424},
  南充:{lat:30.8378,lng:106.1107},南充市:{lat:30.8378,lng:106.1107},
  重庆:{lat:29.4316,lng:106.5475},重庆市:{lat:29.4316,lng:106.5475},渝北区:{lat:29.7182,lng:106.6304},江北区:{lat:29.6067,lng:106.5744},沙坪坝区:{lat:29.5410,lng:106.4569},九龙坡区:{lat:29.5020,lng:106.5107},南岸区:{lat:29.5217,lng:106.5625},巴南区:{lat:29.4026,lng:106.5404},
  昆明:{lat:25.0389,lng:102.7183},昆明市:{lat:25.0389,lng:102.7183},呈贡区:{lat:24.8856,lng:102.8220},
  贵阳:{lat:26.6470,lng:106.6302},贵阳市:{lat:26.6470,lng:106.6302},
  遵义:{lat:27.7255,lng:106.9274},遵义市:{lat:27.7255,lng:106.9274},
  南宁:{lat:22.8170,lng:108.3665},南宁市:{lat:22.8170,lng:108.3665},青秀区:{lat:22.7868,lng:108.4949},
  柳州:{lat:24.3264,lng:109.4155},柳州市:{lat:24.3264,lng:109.4155},
  桂林:{lat:25.2736,lng:110.2900},桂林市:{lat:25.2736,lng:110.2900},
  海口:{lat:20.0440,lng:110.1999},海口市:{lat:20.0440,lng:110.1999},
  三亚:{lat:18.2528,lng:109.5121},三亚市:{lat:18.2528,lng:109.5121},
  福州:{lat:26.0745,lng:119.2965},福州市:{lat:26.0745,lng:119.2965},鼓楼区:{lat:26.0823,lng:119.3039},仓山区:{lat:26.0387,lng:119.2732},晋安区:{lat:26.0817,lng:119.3285},
  厦门:{lat:24.4798,lng:118.0894},厦门市:{lat:24.4798,lng:118.0894},思明区:{lat:24.4458,lng:118.0826},湖里区:{lat:24.5103,lng:118.1473},集美区:{lat:24.5758,lng:118.0972},
  泉州:{lat:24.8741,lng:118.6758},泉州市:{lat:24.8741,lng:118.6758},晋江市:{lat:24.7817,lng:118.5519},
  漳州:{lat:24.5130,lng:117.6475},漳州市:{lat:24.5130,lng:117.6475},
  南昌:{lat:28.6820,lng:115.8582},南昌市:{lat:28.6820,lng:115.8582},红谷滩区:{lat:28.7042,lng:115.8391},
  赣州:{lat:25.8310,lng:114.9351},赣州市:{lat:25.8310,lng:114.9351},
  九江:{lat:29.7050,lng:116.0019},九江市:{lat:29.7050,lng:116.0019},
  济南:{lat:36.6512,lng:117.1201},济南市:{lat:36.6512,lng:117.1201},历下区:{lat:36.6663,lng:117.0765},市中区:{lat:36.6510,lng:116.9978},高新区:{lat:36.6830,lng:117.1279},
  青岛:{lat:36.0671,lng:120.3826},青岛市:{lat:36.0671,lng:120.3826},市北区:{lat:36.0875,lng:120.3747},崂山区:{lat:36.1088,lng:120.4688},黄岛区:{lat:35.9604,lng:120.1972},城阳区:{lat:36.3067,lng:120.3963},
  烟台:{lat:37.4640,lng:121.4480},烟台市:{lat:37.4640,lng:121.4480},
  潍坊:{lat:36.7068,lng:119.1619},潍坊市:{lat:36.7068,lng:119.1619},
  威海:{lat:37.5135,lng:122.1214},威海市:{lat:37.5135,lng:122.1214},
  临沂:{lat:35.1046,lng:118.3566},临沂市:{lat:35.1046,lng:118.3566},
  淄博:{lat:36.8132,lng:118.0549},淄博市:{lat:36.8132,lng:118.0549},
  济宁:{lat:35.4146,lng:116.5872},济宁市:{lat:35.4146,lng:116.5872},
  泰安:{lat:36.1999,lng:117.0884},泰安市:{lat:36.1999,lng:117.0884},
  郑州:{lat:34.7466,lng:113.6254},郑州市:{lat:34.7466,lng:113.6254},金水区:{lat:34.7800,lng:113.6609},郑东新区:{lat:34.7631,lng:113.7270},
  洛阳:{lat:34.6197,lng:112.4539},洛阳市:{lat:34.6197,lng:112.4539},
  开封:{lat:34.7977,lng:114.3146},开封市:{lat:34.7977,lng:114.3146},
  新乡:{lat:35.3038,lng:113.9268},新乡市:{lat:35.3038,lng:113.9268},
  南阳:{lat:32.9907,lng:112.5285},南阳市:{lat:32.9907,lng:112.5285},
  石家庄:{lat:38.0428,lng:114.5149},石家庄市:{lat:38.0428,lng:114.5149},长安区:{lat:38.0367,lng:114.5395},
  唐山:{lat:39.6305,lng:118.1802},唐山市:{lat:39.6305,lng:118.1802},
  保定:{lat:38.8738,lng:115.4648},保定市:{lat:38.8738,lng:115.4648},
  廊坊:{lat:39.5378,lng:116.6838},廊坊市:{lat:39.5378,lng:116.6838},
  沧州:{lat:38.3043,lng:116.8388},沧州市:{lat:38.3043,lng:116.8388},
  邯郸:{lat:36.6256,lng:114.5390},邯郸市:{lat:36.6256,lng:114.5390},
  太原:{lat:37.8706,lng:112.5489},太原市:{lat:37.8706,lng:112.5489},
  大同:{lat:40.0768,lng:113.3001},大同市:{lat:40.0768,lng:113.3001},
  西安:{lat:34.3416,lng:108.9398},西安市:{lat:34.3416,lng:108.9398},雁塔区:{lat:34.2144,lng:108.9383},未央区:{lat:34.2930,lng:108.9463},高新区:{lat:34.2333,lng:108.8868},
  咸阳:{lat:34.3296,lng:108.7091},咸阳市:{lat:34.3296,lng:108.7091},
  宝鸡:{lat:34.3618,lng:107.2379},宝鸡市:{lat:34.3618,lng:107.2379},
  兰州:{lat:36.0611,lng:103.8343},兰州市:{lat:36.0611,lng:103.8343},
  西宁:{lat:36.6171,lng:101.7785},西宁市:{lat:36.6171,lng:101.7785},
  银川:{lat:38.4872,lng:106.2309},银川市:{lat:38.4872,lng:106.2309},
  乌鲁木齐:{lat:43.8256,lng:87.6168},乌鲁木齐市:{lat:43.8256,lng:87.6168},
  拉萨:{lat:29.6500,lng:91.1000},拉萨市:{lat:29.6500,lng:91.1000},
  呼和浩特:{lat:40.8424,lng:111.7490},呼和浩特市:{lat:40.8424,lng:111.7490},
  包头:{lat:40.6582,lng:109.8404},包头市:{lat:40.6582,lng:109.8404},
  沈阳:{lat:41.8057,lng:123.4315},沈阳市:{lat:41.8057,lng:123.4315},铁西区:{lat:41.8029,lng:123.3758},
  大连:{lat:38.9140,lng:121.6147},大连市:{lat:38.9140,lng:121.6147},甘井子区:{lat:38.9514,lng:121.5556},
  鞍山:{lat:41.1078,lng:122.9946},鞍山市:{lat:41.1078,lng:122.9946},
  长春:{lat:43.8171,lng:125.3235},长春市:{lat:43.8171,lng:125.3235},
  吉林:{lat:43.8378,lng:126.5495},吉林市:{lat:43.8378,lng:126.5495},
  哈尔滨:{lat:45.8038,lng:126.5350},哈尔滨市:{lat:45.8038,lng:126.5350},南岗区:{lat:45.7604,lng:126.6685},
  大庆:{lat:46.5907,lng:125.0320},大庆市:{lat:46.5907,lng:125.0320},
  天津:{lat:39.1252,lng:117.1908},天津市:{lat:39.1252,lng:117.1908},滨海新区:{lat:39.0032,lng:117.7107},西青区:{lat:39.1418,lng:117.0087},东丽区:{lat:39.0868,lng:117.3140},
  香港:{lat:22.2793,lng:114.1628},
  澳门:{lat:22.1987,lng:113.5439}
};

// 省级范围坐标（用于省名模糊匹配时给出省会坐标）
const PROVINCE_COORDS = {
  北京:CITY_COORDS.北京,北京市:CITY_COORDS.北京,
  上海:CITY_COORDS.上海,上海市:CITY_COORDS.上海,
  天津:CITY_COORDS.天津,天津市:CITY_COORDS.天津,
  重庆:CITY_COORDS.重庆,重庆市:CITY_COORDS.重庆,
  广东:CITY_COORDS.广州,广东省:CITY_COORDS.广州,
  浙江:CITY_COORDS.杭州,浙江省:CITY_COORDS.杭州,
  江苏:CITY_COORDS.南京,江苏省:CITY_COORDS.南京,
  安徽:CITY_COORDS.合肥,安徽省:CITY_COORDS.合肥,
  湖北:CITY_COORDS.武汉,湖北省:CITY_COORDS.武汉,
  湖南:CITY_COORDS.长沙,湖南省:CITY_COORDS.长沙,
  四川:CITY_COORDS.成都,四川省:CITY_COORDS.成都,
  福建:CITY_COORDS.福州,福建省:CITY_COORDS.福州,
  江西:CITY_COORDS.南昌,江西省:CITY_COORDS.南昌,
  山东:CITY_COORDS.济南,山东省:CITY_COORDS.济南,
  河南:CITY_COORDS.郑州,河南省:CITY_COORDS.郑州,
  河北:CITY_COORDS.石家庄,河北省:CITY_COORDS.石家庄,
  山西:CITY_COORDS.太原,山西省:CITY_COORDS.太原,
  陕西:CITY_COORDS.西安,陕西省:CITY_COORDS.西安,
  甘肃:CITY_COORDS.兰州,甘肃省:CITY_COORDS.兰州,
  青海:CITY_COORDS.西宁,青海省:CITY_COORDS.西宁,
  宁夏:CITY_COORDS.银川,宁夏回族自治区:CITY_COORDS.银川,
  新疆:CITY_COORDS.乌鲁木齐,新疆维吾尔自治区:CITY_COORDS.乌鲁木齐,
  西藏:CITY_COORDS.拉萨,西藏自治区:CITY_COORDS.拉萨,
  内蒙古:CITY_COORDS.呼和浩特,内蒙古自治区:CITY_COORDS.呼和浩特,
  辽宁:CITY_COORDS.沈阳,辽宁省:CITY_COORDS.沈阳,
  吉林:CITY_COORDS.长春,吉林省:CITY_COORDS.长春,
  黑龙江:CITY_COORDS.哈尔滨,黑龙江省:CITY_COORDS.哈尔滨,
  广西:CITY_COORDS.南宁,广西壮族自治区:CITY_COORDS.南宁,
  贵州:CITY_COORDS.贵阳,贵州省:CITY_COORDS.贵阳,
  云南:CITY_COORDS.昆明,云南省:CITY_COORDS.昆明,
  海南:CITY_COORDS.海口,海南省:CITY_COORDS.海口
};
Object.assign(CITY_COORDS, PROVINCE_COORDS);

// 地址→经纬度：先用市/区精确匹配，再模糊包含匹配，再回退到省
function geocodeAddress(province, city, district) {
  const clean = (s) => (s||'').replace(/市$|区$|县$|自治州$|自治县$|地区$|盟$|镇$|街道$|乡$/g,'').trim();
  // 1) 精确匹配区名
  if (district) {
    const d = clean(district);
    if (CITY_COORDS[d]) return CITY_COORDS[d];
    if (CITY_COORDS[district]) return CITY_COORDS[district];
  }
  // 2) 精确匹配市名
  if (city) {
    const c = clean(city);
    if (CITY_COORDS[c]) return CITY_COORDS[c];
    if (CITY_COORDS[city]) return CITY_COORDS[city];
    // 3) 包含匹配（如"合肥市包河区"→"合肥"）
    for (const [k, v] of Object.entries(CITY_COORDS)) {
      if (c.includes(k) || k.includes(c)) return v;
    }
  }
  // 4) 回退到省
  if (province) {
    const p = clean(province);
    if (CITY_COORDS[p]) return CITY_COORDS[p];
    for (const [k, v] of Object.entries(CITY_COORDS)) {
      if (p.includes(k) || k.includes(p)) return v;
    }
  }
  return null;
}

// ====================== 种子数据 ======================
if (DB.users.length === 0) {
    const hash = bcrypt.hashSync(SEED_PASSWORD, 10);
    insert('users', {username:'admin',password_hash:hash,display_name:'系统管理员',role:'admin',status:1});
    insert('users', {username:'dispatcher',password_hash:hash,display_name:'调度员张三',role:'dispatcher',status:1});
    insert('users', {username:'finance',password_hash:hash,display_name:'财务李四',role:'finance',status:1});
    insert('users', {username:'ops_manager',password_hash:hash,display_name:'运营主管王五',role:'ops_manager',status:1});
    insert('users', {username:'finance_manager',password_hash:hash,display_name:'财务主管赵六',role:'finance_manager',status:1});
    insert('users', {username:'cs',password_hash:hash,display_name:'客服小刘',role:'customer_service',status:1});
    insert('users', {username:'boss',password_hash:hash,display_name:'陈总',role:'boss',status:1});

    insert('customers', {customer_code:'KH001',company_name:'深圳速达电子科技有限公司',short_name:'速达电子',contact_name:'王经理',contact_phone:'13900000001',province:'广东省',city:'深圳市',district:'宝安区',address_detail:'西乡固戍工业区A栋',settlement_type:'monthly',credit_limit:50000,discount_rate:0.90,status:1});
    insert('customers', {customer_code:'KH002',company_name:'广州明辉食品有限公司',short_name:'明辉食品',contact_name:'陈总',contact_phone:'13900000002',province:'广东省',city:'广州市',district:'黄埔区',address_detail:'科学城科林路18号',settlement_type:'monthly',credit_limit:80000,discount_rate:0.85,status:1});
    insert('customers', {customer_code:'KH003',company_name:'东莞鑫源机械制造有限公司',short_name:'鑫源机械',contact_name:'赵厂长',contact_phone:'13900000003',province:'广东省',city:'东莞市',district:'长安镇',address_detail:'振安中路228号',settlement_type:'per_trip',discount_rate:1.0,status:1});
    insert('customers', {customer_code:'KH004',company_name:'惠州华强建材有限公司',short_name:'华强建材',contact_name:'刘总',contact_phone:'13900000004',province:'广东省',city:'惠州市',district:'惠城区',address_detail:'仲恺惠风路55号',settlement_type:'monthly',credit_limit:30000,discount_rate:0.95,status:1});
    insert('customers', {customer_code:'KH005',company_name:'长沙博达商贸有限公司',short_name:'博达商贸',contact_name:'孙经理',contact_phone:'13900000005',province:'湖南省',city:'长沙市',district:'岳麓区',address_detail:'麓谷大道662号',settlement_type:'prepaid',discount_rate:1.0,status:1});

    const custIds = DB.customers.map(c=>c.id);
    insert('users', {username:'customer1',password_hash:hash,display_name:'速达电子-王经理',role:'customer',status:1,user_type:'customer',customer_id:custIds[0],is_primary_contact:true});
    insert('addressBook', {customer_id:custIds[0],address_name:'速达电子工厂',contact_name:'王经理',contact_phone:'13900000001',province:'广东省',city:'深圳市',district:'宝安区',address_detail:'西乡固戍工业区A栋',is_default:1});
    insert('addressBook', {customer_id:custIds[1],address_name:'明辉食品总仓',contact_name:'陈总',contact_phone:'13900000002',province:'广东省',city:'广州市',district:'黄埔区',address_detail:'科学城科林路18号',is_default:1});
    insert('addressBook', {customer_id:custIds[2],address_name:'鑫源机械工厂',contact_name:'赵厂长',contact_phone:'13900000003',province:'广东省',city:'东莞市',district:'长安镇',address_detail:'振安中路228号',is_default:1});
    insert('addressBook', {customer_id:custIds[3],address_name:'华强建材仓库',contact_name:'刘总',contact_phone:'13900000004',province:'广东省',city:'惠州市',district:'惠城区',address_detail:'仲恺惠风路55号',is_default:1});
    insert('addressBook', {customer_id:custIds[4],address_name:'博达商贸长沙仓',contact_name:'孙经理',contact_phone:'13900000005',province:'湖南省',city:'长沙市',district:'岳麓区',address_detail:'麓谷大道662号',is_default:1});

    ['V001|粤B12345|small_truck|五菱荣光|1200|6.5|3.2|GPS-001|gas|1500|400',
     'V002|粤B23456|medium_truck|福田奥铃|4000|18|4.2|GPS-002|diesel|2800|650',
     'V003|粤B34567|medium_truck|江淮骏铃|5000|20|4.2|GPS-003|diesel|3000|700',
     'V004|粤B45678|heavy_truck|解放J6P|8000|35|6.8|GPS-004|diesel|5000|950',
     'V005|粤B56789|heavy_truck|东风天龙|10000|40|6.8|GPS-005|diesel|5500|1000',
     'V006|粤B67890|small_truck|长安之星|800|4.5|2.8|GPS-006|gas|1200|350'].forEach((row,i) => {
        const [code,plate,type,brand,load,vol,len,gps,fuel,dep,ins] = row.split('|');
        insert('vehicles', {vehicle_code:code,plate_number:plate,vehicle_type:type,brand_model:brand,max_load_kg:parseFloat(load),max_volume_m3:parseFloat(vol),length_m:parseFloat(len),gps_device_id:gps,fuel_type:fuel,monthly_depreciation:parseFloat(dep),monthly_insurance:parseFloat(ins),status:i===5?'maintenance':'idle'});
    });
    [['D001','刘师傅','13600000001'],['D002','黄师傅','13600000002'],['D003','周师傅','13600000003'],['D004','吴师傅','13600000004'],['D005','何师傅','13600000005']].forEach(d => {
        const drv = insert('drivers', {driver_code:d[0],name:d[1],phone:d[2],license_type:'B2',status:'available'});
        // 为每个司机创建登录账号
        const driverUser = insert('users', {username:'driver'+(DB.drivers.length),password_hash:hash,display_name:d[1],role:'driver',status:1,user_type:'driver'});
        updateById('drivers', drv.id, {user_id: driverUser.id});
    });
    // ==================== 演示运单数据 ====================
    const custIds2 = DB.customers.map(c=>c.id);
    const vehIds = DB.vehicles.map(v=>v.id);
    const drvIds = DB.drivers.map(d=>d.id);
    const now = new Date();
    const dateStr = () => new Date().toISOString().slice(0,10).replace(/-/g,'');
    const nowStr = () => new Date().toISOString().slice(0,19).replace('T',' ');

    // 创建运单的辅助函数
    function createWaybill(custIdx, cargo, weight, fee, status, daysAgo, vehicleIdx, driverIdx) {
      const d = new Date(now);
      d.setDate(d.getDate() - daysAgo);
      const ds = d.toISOString().slice(0,10).replace(/-/g,'');
      const cnt = DB.waybills.filter(w=>w.created_at&&w.created_at.startsWith(d.toISOString().slice(0,10))).length;
      const no = 'YD'+ds+String(cnt+1).padStart(4,'0');
      const wb = insert('waybills', {
        waybill_no:no, customer_id:custIds2[custIdx], cargo_name:cargo, cargo_type:'general',
        cargo_weight_kg:weight, cargo_volume_m3:weight/200, cargo_pieces:Math.ceil(weight/50),
        time_requirement:status==='urgent'?'urgent':'normal', quoted_fee:fee, status:status,
        dispatch_type:'full_load', settlement_status:'pending', signed_status:status==='signed'||status==='completed'?'signed':'unsigned',
        created_at: new Date(d.getTime()+600000).toISOString().slice(0,19).replace('T',' '),
        actual_depart_time:['loaded','in_transit','arrived','signed','completed'].includes(status)?new Date(d.getTime()+3600000).toISOString().slice(0,19).replace('T',' '):null,
        actual_arrive_time:['arrived','signed','completed'].includes(status)?new Date(d.getTime()+7200000).toISOString().slice(0,19).replace('T',' '):null
      });
      // 添加站点
      insert('waybillStops',{waybill_id:wb.id,stop_seq:1,stop_type:'pickup',contact_name:'发货人',contact_phone:'13900000001',province:'广东省',city:'深圳市',district:'宝安区',address_detail:'西乡固戍工业区A栋',status:'completed'});
      insert('waybillStops',{waybill_id:wb.id,stop_seq:2,stop_type:'delivery',contact_name:'收货人',contact_phone:'13900000002',province:'广东省',city:'广州市',district:'黄埔区',address_detail:'科学城科林路18号',status:['arrived','signed','completed'].includes(status)?'arrived':'pending'});
      // 关联车辆和司机 (已调度以上的状态)
      if (['scheduled','loaded','in_transit','arrived','signed','completed'].includes(status)) {
        insert('waybillVehicles',{waybill_id:wb.id,vehicle_id:vehIds[vehicleIdx],driver_id:drvIds[driverIdx],is_primary:true});
        const isActive = ['scheduled','loaded','in_transit','arrived','signed'].includes(status);
        updateById('vehicles', vehIds[vehicleIdx], {status: isActive ? 'en_route' : 'idle'});
        updateById('drivers', drvIds[driverIdx], {status: isActive ? 'on_trip' : 'available'});
      }
      // GPS轨迹 — 异步获取 OSRM 真实路径
      const cityCoords = {
        shenzhen: {lat:22.5431, lng:114.0579}, guangzhou: {lat:23.1291, lng:113.2644},
        dongguan: {lat:23.0208, lng:113.7518}, huizhou: {lat:23.1118, lng:114.4158},
        changsha: {lat:28.2282, lng:112.9388}
      };
      const custIdxMap = {
        0: {from:cityCoords.shenzhen, to:cityCoords.guangzhou},
        1: {from:cityCoords.guangzhou, to:cityCoords.shenzhen},
        2: {from:cityCoords.dongguan, to:cityCoords.shenzhen},
        3: {from:cityCoords.huizhou, to:cityCoords.guangzhou},
        4: {from:cityCoords.changsha, to:cityCoords.guangzhou}
      };
      const route = custIdxMap[custIdx] || {from:cityCoords.shenzhen, to:cityCoords.guangzhou};
      generateGPSPoints(wb.id, vehIds[vehicleIdx] || null, route.from.lng, route.from.lat, route.to.lng, route.to.lat).then(points => {
        points.forEach(p => insert('gpsRecords', p));
      });
      // 费用记录 (运输中及以上)
      if (['in_transit','arrived','signed','completed'].includes(status)) {
        insert('costItems',{waybill_id:wb.id,cost_type:'fuel',cost_amount:Math.floor(fee*0.18),cost_desc:'柴油费',verify_status:'verified'});
        insert('costItems',{waybill_id:wb.id,cost_type:'toll',cost_amount:Math.floor(fee*0.08),cost_desc:'高速公路过路费',verify_status:'verified'});
        insert('costItems',{waybill_id:wb.id,cost_type:'driver_pay',cost_amount:Math.floor(fee*0.12),cost_desc:'司机提成',verify_status:'pending'});
      }
      // 签收记录
      if (['signed','completed'].includes(status)) {
        insert('signRecords',{waybill_id:wb.id,sign_type:'electronic',signer_name:'收货人',sign_photo_url:'/signs/'+no+'.png',sign_time:new Date(d.getTime()+7500000).toISOString().slice(0,19).replace('T',' ')});
      }
      return wb;
    }

    // 不同状态的演示运单
    createWaybill(0, '电子元件 20箱', 800, 1200, 'completed', 1, 0, 0);    // 已完成 - 速达电子
    createWaybill(0, 'PCB电路板 15箱', 500, 950, 'completed', 2, 1, 1);    // 已完成
    createWaybill(1, '冷冻食品 30箱', 1200, 1800, 'in_transit', 0, 2, 2);  // 运输中 - 明辉食品 (今天)
    createWaybill(2, '机械配件 8托', 2500, 2800, 'in_transit', 1, 3, 3);   // 运输中 - 鑫源机械
    createWaybill(1, '调味品 50箱', 600, 1100, 'arrived', 3, 4, 4);        // 已到达
    createWaybill(3, '水泥 20吨', 20000, 3500, 'loaded', 5, 1, 1);          // 已装车 - 华强建材
    createWaybill(0, '电子元器件 10箱', 400, 850, 'scheduled', 0, 0, 0);    // 已调度 (今天)
    createWaybill(4, '日用百货 100箱', 1500, 2200, 'confirmed', 0, 1, 2);   // 已确认 (待调度,今天)
    createWaybill(2, '轴承配件 5托', 1800, 2000, 'confirmed', 6, null, null); // 已确认 - 鑫源机械
    createWaybill(3, '钢管 一批', 3500, 3200, 'draft', 0, null, null);       // 草稿
    createWaybill(0, 'LED屏幕 5台', 300, 700, 'exception', 4, 3, 3);        // 异常

    console.log('种子数据初始化完成 (含'+DB.waybills.length+'条演示运单)');
}

// ====================== JWT 中间件 ======================
const auth = createAuthMiddleware(JWT_SECRET);


// ==================== 认证 ====================
app.use('/api/auth', createAuthRouter({ db: DB, auth, jwtSecret: JWT_SECRET }));
// ==================== 运单 ====================
app.post('/api/waybill', auth, hasRole('admin','ops_manager','dispatcher'), (req,res) => {
    const {cargoName,cargoType,cargoWeightKg,cargoVolumeM3,cargoPieces,cargoRemark,timeRequirement,customerId,pickupStops,deliveryStops} = req.body;
    const now = new Date();
    const dateStr = now.toISOString().slice(0,10).replace(/-/g,'');
    const todayPrefix = 'YD' + dateStr;
    const maxSequence = DB.waybills.reduce((max, item) => {
      if (!item.waybill_no?.startsWith(todayPrefix)) return max;
      const sequence = parseInt(item.waybill_no.slice(todayPrefix.length));
      return Number.isFinite(sequence) ? Math.max(max, sequence) : max;
    }, 0);
    const waybillNo = todayPrefix + String(maxSequence + 1).padStart(4,'0');
    const weight = Number(cargoWeightKg) || 0;
    const pieces = Number(cargoPieces) || 1;
    const quotedFee = Math.max(120 + 5*pieces + 0.15*weight, 200);

    const cid = parseInt(customerId);
    const cust = findById('customers',cid);
    if(!cid || !cust || cust.status !== 1) return res.json({code:400,message:'请选择有效且正常的客户'});
    if(!cargoName || !cargoName.trim()) return res.json({code:400,message:'请输入货物名称'});
    if(weight <= 0) return res.json({code:400,message:'货物重量必须大于0'});
    if(!Array.isArray(pickupStops) || pickupStops.length === 0) return res.json({code:400,message:'至少需要一个提货站点'});
    if(!Array.isArray(deliveryStops) || deliveryStops.length === 0) return res.json({code:400,message:'至少需要一个送货站点'});
    const hasExactCoordinate = stop => stop && stop.longitude !== null && stop.longitude !== '' && stop.latitude !== null && stop.latitude !== '' && Number.isFinite(Number(stop.longitude)) && Number.isFinite(Number(stop.latitude)) && Number(stop.longitude) >= -180 && Number(stop.longitude) <= 180 && Number(stop.latitude) >= -90 && Number(stop.latitude) <= 90;
    if(!pickupStops.every(hasExactCoordinate)) return res.json({code:400,message:'提货站点必须在地图上设置精确坐标'});
    if(!deliveryStops.every(hasExactCoordinate)) return res.json({code:400,message:'送货站点必须在地图上设置精确坐标'});
    const wb = insert('waybills', {waybill_no:waybillNo,customer_id:cid,cargo_name:cargoName.trim(),cargo_type:cargoType||'general',cargo_weight_kg:cargoWeightKg,cargo_volume_m3:cargoVolumeM3,cargo_pieces:cargoPieces,cargo_remark:cargoRemark,time_requirement:timeRequirement||'normal',quoted_fee:quotedFee,status:'confirmed',dispatch_type:'full_load',settlement_status:'pending',signed_status:'unsigned'});

    // 解析地址：前端传了就用前端的，没传就用客户档案地址
    const resolveAddr = (stop) => {
      const p = stop.province || cust.province || '广东省';
      const c = stop.city || cust.city || '深圳市';
      const d = stop.district || cust.district || '';
      const detail = stop.addressDetail || cust.address_detail || '';
      return { province:p, city:c, district:d, address_detail:detail };
    };

    let seq=1;
    const allStops = [];
    if(pickupStops) pickupStops.forEach(s=>{
      const ra = resolveAddr(s);
      const exactLongitude = Number(s.longitude), exactLatitude = Number(s.latitude);
      const hasExactCoordinate = s.longitude !== null && s.longitude !== '' && s.latitude !== null && s.latitude !== '' && Number.isFinite(exactLongitude) && Number.isFinite(exactLatitude) && exactLongitude >= -180 && exactLongitude <= 180 && exactLatitude >= -90 && exactLatitude <= 90;
      const addr = hasExactCoordinate ? {lng:exactLongitude,lat:exactLatitude} : geocodeAddress(ra.province, ra.city, ra.district);
      const stop = {waybill_id:wb.id,stop_seq:seq++,stop_type:'pickup',contact_name:s.contactName,contact_phone:s.contactPhone,province:ra.province,city:ra.city,district:ra.district,address_detail:ra.address_detail, longitude: addr?addr.lng:null, latitude: addr?addr.lat:null, coordinate_source:hasExactCoordinate?'manual_exact':'district_estimate', status:'pending'};
      allStops.push(stop);
      insert('waybillStops', stop);
    });
    if(deliveryStops) deliveryStops.forEach(s=>{
      const ra = resolveAddr(s);
      const exactLongitude = Number(s.longitude), exactLatitude = Number(s.latitude);
      const hasExactCoordinate = s.longitude !== null && s.longitude !== '' && s.latitude !== null && s.latitude !== '' && Number.isFinite(exactLongitude) && Number.isFinite(exactLatitude) && exactLongitude >= -180 && exactLongitude <= 180 && exactLatitude >= -90 && exactLatitude <= 90;
      const addr = hasExactCoordinate ? {lng:exactLongitude,lat:exactLatitude} : geocodeAddress(ra.province, ra.city, ra.district);
      const stop = {waybill_id:wb.id,stop_seq:seq++,stop_type:'delivery',contact_name:s.contactName,contact_phone:s.contactPhone,province:ra.province,city:ra.city,district:ra.district,address_detail:ra.address_detail, longitude: addr?addr.lng:null, latitude: addr?addr.lat:null, coordinate_source:hasExactCoordinate?'manual_exact':'district_estimate', status:'pending'};
      allStops.push(stop);
      insert('waybillStops', stop);
    });

    const plannedRoute = buildLinearRoute(allStops);
    updateById('waybills', wb.id, {planned_route: plannedRoute, route_source:'exact_coordinates'});

    const stops = findByField('waybillStops','waybill_id',wb.id);
    res.json({code:200,data:{...wb,stops}});
});

app.get('/api/waybill', auth, customerScope, hasRole('admin','ops_manager','dispatcher','finance_manager','finance','customer_service','boss','customer'), (req,res) => {
    let list = DB.waybills.slice().reverse();
    if (req.customerScope) list = list.filter(w => w.customer_id === req.customerScope);
    // 多条件筛选
    const {status, customer_id, keyword, date_from, date_to} = req.query;
    if (status) list = list.filter(w => w.status === status);
    if (customer_id) list = list.filter(w => w.customer_id === parseInt(customer_id));
    if (keyword) {
      const kw = keyword.toLowerCase();
      list = list.filter(w => w.waybill_no.toLowerCase().includes(kw) || w.cargo_name.toLowerCase().includes(kw));
    }
    if (date_from) list = list.filter(w => w.created_at >= date_from);
    if (date_to) list = list.filter(w => w.created_at <= date_to + ' 23:59:59');
    list = list.slice(0, 50).map(w => {
        const cust = findById('customers',w.customer_id);
        return {...w, customer_name: cust?cust.short_name:''};
    });
    res.json({code:200,data:list});
});

app.get('/api/waybill/:id', auth, customerScope, hasRole('admin','ops_manager','dispatcher','finance_manager','finance','customer_service','boss','customer'), (req,res) => {
    const w = findById('waybills',parseInt(req.params.id));
    if(!w) return res.json({code:404,message:'运单不存在'});
    if(req.customerScope && w.customer_id !== req.customerScope) return res.json({code:403,message:'无权限'});
    const cust = findById('customers',w.customer_id);
    res.json({code:200,data:{...w, customer_name:cust?cust.short_name:'', stops:findByField('waybillStops','waybill_id',w.id), costs:findByField('costItems','waybill_id',w.id), signs:findByField('signRecords','waybill_id',w.id)}});
});

app.get('/api/waybill/track/:no', auth, customerScope, hasRole('admin','ops_manager','dispatcher','finance_manager','finance','customer_service','boss','customer'), (req,res) => {
    const w = DB.waybills.find(w=>w.waybill_no===req.params.no);
    if(!w) return res.json({code:404,message:'运单不存在'});
    if(req.customerScope && w.customer_id !== req.customerScope) return res.json({code:403,message:'无权限'});
    const stops = findByField('waybillStops','waybill_id',w.id).sort((first,second)=>first.stop_seq-second.stop_seq).map(stop => {
      if(Number.isFinite(Number(stop.longitude)) && Number.isFinite(Number(stop.latitude))) return stop;
      const estimated = geocodeAddress(stop.province,stop.city,stop.district);
      return {...stop,longitude:estimated?estimated.lng:null,latitude:estimated?estimated.lat:null,coordinate_source:estimated?'district_estimate':'missing'};
    });
    const plannedRoute = Array.isArray(w.planned_route) && w.planned_route.length ? w.planned_route : buildLinearRoute(stops);
    const gpsRecords = findByField('gpsRecords','waybill_id',w.id).filter(record=>record.driver_id).sort((first,second)=>(first.device_time||'').localeCompare(second.device_time||'')).map(record=>{
      const driver = findById('drivers',record.driver_id);
      return {...record,driver_name:driver?driver.name:null};
    });
    res.json({code:200,data:{waybill:{...w,planned_route:plannedRoute},stops,gpsRecords,plannedRoute}});
});

// 状态流转
const TRANSITIONS = {
    draft:['confirmed','cancelled'], confirmed:['scheduled','cancelled'], scheduled:['loaded','cancelled','exception'],
    loaded:['in_transit','exception'], in_transit:['arrived','exception'], arrived:['signed','exception'],
    signed:['completed'], exception:['scheduled','loaded','in_transit','cancelled']
};

function currentTimestamp() {
    return new Date().toISOString().slice(0,19).replace('T',' ');
}

function getWaybillAssignments(waybillId) {
    return DB.waybillVehicles.filter(item => item.waybill_id === waybillId);
}

function releaseWaybillResources(waybillId, removeAssignments = false) {
    getWaybillAssignments(waybillId).forEach(assignment => {
        if (assignment.vehicle_id) updateById('vehicles', assignment.vehicle_id, {status:'idle'});
        if (assignment.driver_id) updateById('drivers', assignment.driver_id, {status:'available'});
        if (removeAssignments) deleteById('waybillVehicles', assignment.id);
    });
}

app.post('/api/waybill/:id/transition', auth, hasRole('admin','ops_manager','dispatcher'), (req,res) => {
    const waybill = findById('waybills',parseInt(req.params.id));
    if(!waybill) return res.json({code:404,message:'运单不存在'});
    const targetStatus = req.body.status;
    if(!TRANSITIONS[waybill.status]?.includes(targetStatus)) return res.json({code:400,message:`不允许从 ${waybill.status} 变更为 ${targetStatus}`});

    let schedule = null;
    if(targetStatus === 'scheduled') {
        const vehicleId = parseInt(req.body.vehicleId);
        const driverId = parseInt(req.body.driverId);
        if(!vehicleId || !driverId) return res.json({code:400,message:'派车必须同时选择车辆和司机'});
        const vehicle = findById('vehicles', vehicleId);
        const driver = findById('drivers', driverId);
        if(!vehicle) return res.json({code:400,message:'车辆不存在'});
        if(!driver) return res.json({code:400,message:'司机不存在'});
        const assignments = getWaybillAssignments(waybill.id);
        if(vehicle.status !== 'idle' && !assignments.some(item => item.vehicle_id === vehicleId)) return res.json({code:400,message:'车辆不空闲'});
        if(driver.status !== 'available' && !assignments.some(item => item.driver_id === driverId)) return res.json({code:400,message:'司机不在岗'});
        if((vehicle.max_load_kg || 0) < (waybill.cargo_weight_kg || 0)) return res.json({code:400,message:'车辆额定载重不足'});
        schedule = {vehicleId, driverId};
    }

    if(schedule) {
        releaseWaybillResources(waybill.id, true);
        insert('waybillVehicles',{waybill_id:waybill.id,vehicle_id:schedule.vehicleId,driver_id:schedule.driverId,is_primary:true});
        updateById('vehicles',schedule.vehicleId,{status:'en_route'});
        updateById('drivers',schedule.driverId,{status:'on_trip'});
    }

    const updates = {status:targetStatus};
    if(targetStatus === 'loaded') {
        findByField('waybillStops','waybill_id',waybill.id).filter(stop => stop.stop_type === 'pickup').forEach(stop => updateById('waybillStops',stop.id,{status:'completed'}));
    }
    if(targetStatus === 'in_transit') updates.actual_depart_time = currentTimestamp();
    if(targetStatus === 'arrived') {
        updates.actual_arrive_time = currentTimestamp();
        findByField('waybillStops','waybill_id',waybill.id).filter(stop => stop.stop_type === 'delivery').forEach(stop => updateById('waybillStops',stop.id,{status:'arrived'}));
    }
    if(targetStatus === 'signed') {
        updates.signed_at = currentTimestamp();
        updates.signed_status = 'signed';
        findByField('waybillStops','waybill_id',waybill.id).filter(stop => stop.stop_type === 'delivery').forEach(stop => updateById('waybillStops',stop.id,{status:'completed'}));
        if(findByField('signRecords','waybill_id',waybill.id).length === 0) insert('signRecords',{waybill_id:waybill.id,signer_name:req.body.signerName||'现场签收',sign_time:updates.signed_at,sign_remark:req.body.signRemark||'',created_by:req.user.userId});
    }
    if(targetStatus === 'completed') {
        updates.completed_at = currentTimestamp();
        releaseWaybillResources(waybill.id, false);
    }
    if(targetStatus === 'exception') insert('exceptionRecords',{waybill_id:waybill.id,exception_type:'manual',severity:req.body.severity||'normal',description:req.body.description||'人工标记异常',reported_by:req.user.userId,status:'open',created_at:currentTimestamp()});
    if(targetStatus === 'cancelled') releaseWaybillResources(waybill.id, true);

    updateById('waybills',waybill.id,updates);
    res.json({code:200,message:'状态已更新'});
});
app.delete('/api/waybill/:id', auth, hasRole('admin','ops_manager'), (req,res) => {
    const w = findById('waybills',parseInt(req.params.id));
    if(!w) return res.json({code:404,message:'运单不存在'});
    if(!['draft','cancelled'].includes(w.status)) return res.json({code:400,message:'只能删除草稿或已取消的运单'});
    if(DB.costItems.some(c=>c.waybill_id===w.id)) return res.json({code:400,message:'该运单已有费用记录,无法删除'});
    const gpsIds = DB.gpsRecords.filter(g=>g.waybill_id===w.id).map(g=>g.id);
    gpsIds.forEach(gid => deleteById('gpsRecords',gid));
    const stopIds = DB.waybillStops.filter(s=>s.waybill_id===w.id).map(s=>s.id);
    stopIds.forEach(sid => deleteById('waybillStops',sid));
    const wvIds = DB.waybillVehicles.filter(wv=>wv.waybill_id===w.id).map(wv=>wv.id);
    wvIds.forEach(wvid => deleteById('waybillVehicles',wvid));
    const signIds = DB.signRecords.filter(sr=>sr.waybill_id===w.id).map(sr=>sr.id);
    signIds.forEach(srid => deleteById('signRecords',srid));
    deleteById('waybills',w.id);
    res.json({code:200,message:'运单已删除'});
});

// ==================== 调度 ====================
app.get('/api/dispatch/recommend/:waybillId', auth, hasRole('admin','ops_manager','dispatcher'), (req,res) => {
    const w = findById('waybills',parseInt(req.params.waybillId));
    if(!w) return res.json({code:404,message:'运单不存在'});
    const weight = w.cargo_weight_kg||0;
    let reqType = 'small_truck';
    if(weight>4000) reqType='heavy_truck';
    else if(weight>1200) reqType='medium_truck';
    const order = ['small_truck','medium_truck','heavy_truck'];

    const scored = DB.vehicles.filter(v=>v.status==='idle' && (v.max_load_kg||0) >= weight).map(v => {
        let s=0;
        if(v.vehicle_type===reqType) s+=40;
        else if(order.indexOf(v.vehicle_type)>order.indexOf(reqType)) s+=25; else s+=10;
        s+=30;
        return {vehicleId:v.id,plateNumber:v.plate_number,vehicleType:v.vehicle_type,maxLoadKg:v.max_load_kg,score:Math.round(s*10)/10};
    });
    scored.sort((a,b)=>b.score-a.score);
    res.json({code:200,data:scored.slice(0,3)});
});

app.get('/api/dispatch/vehicles', auth, hasRole('admin','ops_manager','dispatcher'), (req,res) => res.json({code:200,data:DB.vehicles}));
app.get('/api/dispatch/drivers', auth, hasRole('admin','ops_manager','dispatcher'), (req,res) => res.json({code:200,data:DB.drivers.filter(d=>d.status==='available')}));

// ==================== 费用 ====================
app.post('/api/cost/item', auth, hasRole('admin','ops_manager','dispatcher','finance_manager','finance'), (req,res) => {
    const {waybillId,costType,costAmount,costDesc} = req.body;
    const wbId = parseInt(waybillId);
    if (!wbId || !findById('waybills', wbId)) return res.json({code:400, message: '运单不存在'});
    const validTypes = ['fuel','toll','driver_pay','loading','penalty','other'];
    if (!validTypes.includes(costType)) return res.json({code:400, message: '无效的费用类型'});
    const amt = parseFloat(costAmount);
    if (isNaN(amt) || amt <= 0) return res.json({code:400, message: '金额必须大于0'});
    const item = insert('costItems',{waybill_id:wbId,cost_type:costType,cost_amount:amt,cost_desc:costDesc||'',recorded_by:req.user.userId,verify_status:req.user.role==='finance'||req.user.role==='finance_manager'?'verified':'pending',verified_by:req.user.role==='finance'||req.user.role==='finance_manager'?req.user.userId:null,verified_at:req.user.role==='finance'||req.user.role==='finance_manager'?currentTimestamp():null});
    res.json({code:200,data:item});
});

app.post('/api/cost/snapshot/:waybillId', auth, hasRole('admin','ops_manager','dispatcher','finance_manager','finance'), (req,res) => {
    const w = findById('waybills',parseInt(req.params.waybillId));
    if(!w) return res.json({code:404,message:'运单不存在'});
    const costs = findByField('costItems','waybill_id',w.id).filter(c=>c.verify_status==='verified');
    const direct = costs.reduce((s,c)=>s+(c.cost_amount||0),0);
    const wv = DB.waybillVehicles.find(x=>x.waybill_id===w.id);
    let dep=0,ins=0;
    if(wv) {
        const v = findById('vehicles',wv.vehicle_id);
        const monthTrips = DB.waybillVehicles.filter(x=>x.vehicle_id===wv.vehicle_id).length || 1;
        if(v) { dep=(v.monthly_depreciation||0)/monthTrips; ins=(v.monthly_insurance||0)/monthTrips; }
    }
    const total = direct+dep+ins;
    const profit = (w.quoted_fee||0)-total;
    const margin = (w.quoted_fee||0)>0 ? (profit/w.quoted_fee*100) : 0;
    res.json({code:200,data:{waybillNo:w.waybill_no,quotedFee:w.quoted_fee,directCost:direct.toFixed(2),indirectCost:(dep+ins).toFixed(2),totalCost:total.toFixed(2),profit:profit.toFixed(2),profitMargin:margin.toFixed(1)+'%'}});
});

app.post('/api/cost/item/:id/verify', auth, hasRole('admin','finance_manager','finance'), (req,res) => {
    const item = updateById('costItems',parseInt(req.params.id),{verify_status:'verified',verified_by:req.user.userId,verified_at:currentTimestamp()});
    if(!item) return res.json({code:404,message:'费用记录不存在'});
    res.json({code:200,message:'费用已审核',data:item});
});

app.delete('/api/cost/item/:id', auth, hasRole('admin','ops_manager','finance_manager','finance'), (req,res) => {
    const item = findById('costItems',parseInt(req.params.id));
    if(!item) return res.json({code:404,message:'费用记录不存在'});
    const waybill = findById('waybills',item.waybill_id);
    if(waybill && waybill.settlement_status !== 'pending') return res.json({code:400,message:'运单已进入对账流程，费用不可删除'});
    deleteById('costItems',item.id);
    res.json({code:200,message:'费用记录已删除'});
});

// ==================== 对账 ====================
app.post('/api/billing/generate', auth, hasRole('admin','finance_manager','finance'), (req,res) => {
    const customerId = parseInt(req.body.customerId);
    const year = parseInt(req.body.year);
    const month = parseInt(req.body.month);
    if(!findById('customers',customerId)) return res.json({code:400,message:'客户不存在'});
    if(!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return res.json({code:400,message:'账期无效'});
    const periodStart = `${year}-${String(month).padStart(2,'0')}-01`;
    const lastDay = new Date(year,month,0).getDate();
    const periodEnd = `${year}-${String(month).padStart(2,'0')}-${String(lastDay).padStart(2,'0')}`;

    const waybills = DB.waybills.filter(w => {
        const settlementDate = w.completed_at || w.created_at;
        return w.customer_id===customerId && w.status==='completed' && w.settlement_status==='pending' && settlementDate >= periodStart && settlementDate <= periodEnd+' 23:59:59';
    });
    if(waybills.length===0) return res.json({code:400,message:'该账期内没有待入账运单'});

    const total = waybills.reduce((s,w)=>s+(w.quoted_fee||0),0);
    const statementNo = 'ZD'+year+String(month).padStart(2,'0')+String(Date.now()).slice(-4);
    const stmt = insert('billingStatements',{statement_no:statementNo,customer_id:customerId,period_start:periodStart,period_end:periodEnd,total_amount:total,waybill_count:waybills.length,status:'draft'});

    waybills.forEach(w => {
        insert('billingItems',{statement_id:stmt.id,waybill_id:w.id,waybill_no:w.waybill_no,amount:w.quoted_fee});
        updateById('waybills',w.id,{settlement_status:'invoiced'});
    });

    const items = findByField('billingItems','statement_id',stmt.id);
    res.json({code:200,data:{...stmt,items}});
});

app.get('/api/billing', auth, customerScope, hasRole('admin','finance_manager','finance','customer_service','boss','customer'), (req,res) => {
    const list = DB.billingStatements.slice().reverse().slice(0,20).map(b => {
        const cust = findById('customers',b.customer_id);
        return {...b, customer_name:cust?cust.short_name:''};
    }).filter(b => !req.customerScope || b.customer_id === req.customerScope);
    res.json({code:200,data:list});
});
app.get('/api/billing/:id', auth, customerScope, hasRole('admin','finance_manager','finance','customer_service','boss','customer'), (req,res) => {
    const b = findById('billingStatements',parseInt(req.params.id));
    if(!b) return res.json({code:404,message:'对账单不存在'});
    if(req.customerScope && b.customer_id !== req.customerScope) return res.json({code:403,message:'无权限'});
    const cust = findById('customers',b.customer_id);
    const items = findByField('billingItems','statement_id',b.id).map(bi => {
        const w = findById('waybills',bi.waybill_id);
        return {...bi, customer_name:cust?cust.short_name:'', cargo_name:w?w.cargo_name:''};
    });
    res.json({code:200,data:{...b, customer_name:cust?cust.short_name:'', items}});
});
app.post('/api/billing/:id/send', auth, hasRole('admin','finance_manager','finance'), (req,res) => {
    const statement = findById('billingStatements',parseInt(req.params.id));
    if(!statement) return res.json({code:404,message:'对账单不存在'});
    if(statement.status !== 'draft') return res.json({code:400,message:'只能发送草稿状态的对账单'});
    updateById('billingStatements',statement.id,{status:'sent',sent_at:currentTimestamp()});
    res.json({code:200,message:'已发送'});
});
app.post('/api/billing/:id/confirm', auth, hasRole('admin','finance_manager','finance'), (req,res) => {
    const statement = findById('billingStatements',parseInt(req.params.id));
    if(!statement) return res.json({code:404,message:'对账单不存在'});
    if(statement.status !== 'sent') return res.json({code:400,message:'只能确认已发送的对账单'});
    updateById('billingStatements',statement.id,{status:'confirmed',confirmed_at:currentTimestamp()});
    findByField('billingItems','statement_id',statement.id).forEach(item => updateById('waybills',item.waybill_id,{settlement_status:'confirmed'}));
    res.json({code:200,message:'已确认'});
});

app.delete('/api/billing/:id', auth, hasRole('admin','finance_manager','finance'), (req,res) => {
    const b = findById('billingStatements',parseInt(req.params.id));
    if(!b) return res.json({code:404,message:'对账单不存在'});
    if(b.status!=='draft') return res.json({code:400,message:'只能删除草稿状态的对账单'});
    const items = DB.billingItems.filter(bi=>bi.statement_id===b.id);
    const itemIds = items.map(bi=>bi.id);
    // 回滚运单 settlement_status，使其可重新入账
    items.forEach(bi => updateById('waybills', bi.waybill_id, {settlement_status:'pending'}));
    itemIds.forEach(bid => deleteById('billingItems',bid));
    deleteById('billingStatements',b.id);
    res.json({code:200,message:'对账单已删除'});
});

// ==================== 客户、车辆、司机和用户 ====================
const routeDependencies = { db: DB, store, auth, hasRole, customerScope };
app.use('/api/customer', createCustomerRouter(routeDependencies));
app.use('/api/address', createAddressRouter(routeDependencies));
app.use('/api/vehicle', createVehicleRouter(routeDependencies));
app.use('/api/driver', createDriverRouter(routeDependencies));
app.use('/api/gps', createGpsRouter(routeDependencies));
app.use('/api/user', createUserRouter(routeDependencies));
// ==================== 看板 ====================
app.get('/api/dashboard', auth, customerScope, (req,res) => {
    const today = new Date().toISOString().slice(0,10);
    const visibleWaybills = req.customerScope ? DB.waybills.filter(w=>w.customer_id===req.customerScope) : DB.waybills;
    const todayCount = visibleWaybills.filter(w=>w.created_at&&w.created_at.startsWith(today)).length;
    const inTransit = visibleWaybills.filter(w=>w.status==='in_transit').length;
    const idleVehicles = req.customerScope ? 0 : DB.vehicles.filter(v=>v.status==='idle').length;
    const monthStart = today.slice(0,8)+'01';
    const monthCompleted = visibleWaybills.filter(w=>w.status==='completed'&&w.created_at>=monthStart).length;

    const weekData = [];
    for(let i=6;i>=0;i--) {
        const d = new Date(); d.setDate(d.getDate()-i);
        const ds = d.toISOString().slice(0,10);
        weekData.push({day:ds, cnt:visibleWaybills.filter(w=>w.created_at&&w.created_at.startsWith(ds)).length});
    }

    const byStatus = {};
    visibleWaybills.forEach(w => { byStatus[w.status] = (byStatus[w.status]||0)+1; });
    const byCustomer = {};
    visibleWaybills.filter(w=>w.created_at>=new Date(Date.now()-30*86400000).toISOString().slice(0,10)).forEach(w => {
        const cust = findById('customers',w.customer_id);
        const name = cust?cust.short_name:'未知';
        byCustomer[name] = (byCustomer[name]||0)+1;
    });
    const customerStats = Object.entries(byCustomer).map(([k,v])=>({short_name:k,cnt:v})).sort((a,b)=>b.cnt-a.cnt);

    res.json({code:200,data:{todayCount,inTransit,idleVehicles,totalVehicles:req.customerScope?0:DB.vehicles.length,monthCompleted,weekData,byStatus:Object.entries(byStatus).map(([k,v])=>({status:k,cnt:v})),byCustomer:customerStats}});
});

// 车队实时位置（看板地图用）
app.get('/api/fleet/positions', auth, customerScope, (req, res) => {
    const activeStatuses = ['loaded','in_transit','arrived'];
    const waybills = DB.waybills.filter(w => activeStatuses.includes(w.status) && (!req.customerScope || w.customer_id===req.customerScope));
    const positions = waybills.map(w => {
        const gpsRecords = findByField('gpsRecords', 'waybill_id', w.id).sort((a,b) => (a.device_time||'') > (b.device_time||'') ? -1 : 1);
        const latest = gpsRecords[0] || null;
        const cust = findById('customers', w.customer_id);
        const vehRel = findByField('waybillVehicles', 'waybill_id', w.id)[0];
        const vehicle = vehRel ? findById('vehicles', vehRel.vehicle_id) : null;
        return {
            waybillId: w.id, waybillNo: w.waybill_no, cargoName: w.cargo_name,
            status: w.status, customerName: cust ? cust.short_name : '',
            plateNumber: vehicle ? vehicle.plate_number : '',
            longitude: latest ? latest.longitude : null,
            latitude: latest ? latest.latitude : null,
            speedKmh: latest ? latest.speed_kmh : null,
            deviceTime: latest ? latest.device_time : null
        };
    }).filter(p => p.latitude && p.longitude);
    res.json({code:200, data: positions});
});

// 前端页面
app.get('*', (req,res) => res.sendFile(path.join(PUBLIC_DIR,'index.html')));

app.listen(PORT, () => {
    console.log(`\n========================================`);
    console.log(`  佳瑞物流管理系统 V2.0 已启动`);
    console.log(`  端口: ${PORT}`);
    console.log(`  演示账号: admin / dispatcher / finance`);
    console.log(`========================================\n`);
});


