const PI = Math.PI;
const AXIS = 6378245.0;
const OFFSET = 0.00669342162296594323;

function outsideChina(longitude, latitude) {
  return longitude < 72.004 || longitude > 137.8347 || latitude < 0.8293 || latitude > 55.8271;
}

function transformLatitude(longitude, latitude) {
  let value = -100 + 2 * longitude + 3 * latitude + 0.2 * latitude * latitude + 0.1 * longitude * latitude + 0.2 * Math.sqrt(Math.abs(longitude));
  value += (20 * Math.sin(6 * longitude * PI) + 20 * Math.sin(2 * longitude * PI)) * 2 / 3;
  value += (20 * Math.sin(latitude * PI) + 40 * Math.sin(latitude / 3 * PI)) * 2 / 3;
  value += (160 * Math.sin(latitude / 12 * PI) + 320 * Math.sin(latitude * PI / 30)) * 2 / 3;
  return value;
}

function transformLongitude(longitude, latitude) {
  let value = 300 + longitude + 2 * latitude + 0.1 * longitude * longitude + 0.1 * longitude * latitude + 0.1 * Math.sqrt(Math.abs(longitude));
  value += (20 * Math.sin(6 * longitude * PI) + 20 * Math.sin(2 * longitude * PI)) * 2 / 3;
  value += (20 * Math.sin(longitude * PI) + 40 * Math.sin(longitude / 3 * PI)) * 2 / 3;
  value += (150 * Math.sin(longitude / 12 * PI) + 300 * Math.sin(longitude / 30 * PI)) * 2 / 3;
  return value;
}

function wgs84ToGcj02(longitude, latitude) {
  if (outsideChina(longitude, latitude)) return { longitude, latitude };
  let latitudeOffset = transformLatitude(longitude - 105, latitude - 35);
  let longitudeOffset = transformLongitude(longitude - 105, latitude - 35);
  const radianLatitude = latitude / 180 * PI;
  let magic = Math.sin(radianLatitude);
  magic = 1 - OFFSET * magic * magic;
  const sqrtMagic = Math.sqrt(magic);
  latitudeOffset = latitudeOffset * 180 / ((AXIS * (1 - OFFSET)) / (magic * sqrtMagic) * PI);
  longitudeOffset = longitudeOffset * 180 / (AXIS / sqrtMagic * Math.cos(radianLatitude) * PI);
  return { longitude: longitude + longitudeOffset, latitude: latitude + latitudeOffset };
}

function buildLinearRoute(stops, pointCount = 24) {
  const validStops = stops.filter(stop => Number.isFinite(Number(stop.longitude)) && Number.isFinite(Number(stop.latitude))).sort((first, second) => first.stop_seq - second.stop_seq);
  if (validStops.length < 2) return [];
  const route = [];
  for (let index = 0; index < validStops.length - 1; index += 1) {
    const start = validStops[index];
    const end = validStops[index + 1];
    const segmentPoints = Math.max(2, Math.ceil(pointCount / (validStops.length - 1)));
    for (let step = 0; step < segmentPoints; step += 1) {
      if (index > 0 && step === 0) continue;
      const ratio = step / (segmentPoints - 1);
      route.push({ longitude: Number(start.longitude) + (Number(end.longitude) - Number(start.longitude)) * ratio, latitude: Number(start.latitude) + (Number(end.latitude) - Number(start.latitude)) * ratio });
    }
  }
  return route;
}

module.exports = { wgs84ToGcj02, buildLinearRoute };