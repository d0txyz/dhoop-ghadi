// Weather access. All sources are Open-Meteo: free, no key, no account.

import { wbgtFromWeather } from './wbgt.js';

export const HOURLY_VARS = [
  'temperature_2m',
  'relative_humidity_2m',
  'wind_speed_10m',
  'shortwave_radiation',
  'direct_radiation',
];

// Tried in order. The second host serves the same forecast and is a fallback
// for networks that cannot reach the first.
const FORECAST_HOSTS = [
  'https://api.open-meteo.com/v1/forecast',
  'https://historical-forecast-api.open-meteo.com/v1/forecast',
];

async function getJson(url, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Turns an Open-Meteo hourly block into days of { hour, wbgt, temp, rh }.
 * Row `hour` stands for the 60 minutes that start at that hour. Open-Meteo
 * gives temperature at the stamp and sunshine as the mean of the hour before
 * the stamp, so each row uses the next stamp's sunshine and the mean of the
 * two stamps for everything else.
 */
export function toDays(hourly, place, suffix = '') {
  const col = (name) => hourly[name + suffix] || [];
  const temp = col('temperature_2m');
  const rh = col('relative_humidity_2m');
  const wind = col('wind_speed_10m');
  const solar = col('shortwave_radiation');
  const direct = col('direct_radiation');
  const ok = (v) => v !== null && v !== undefined;
  const mid = (arr, i) => (ok(arr[i]) && ok(arr[i + 1]) ? (arr[i] + arr[i + 1]) / 2 : arr[i]);

  const days = new Map();
  hourly.time.forEach((stamp, i) => {
    if (!ok(temp[i]) || !ok(rh[i])) return;
    const date = stamp.slice(0, 10);
    const hour = Number(stamp.slice(11, 13));
    const next = ok(solar[i + 1]) ? i + 1 : i;
    const t = mid(temp, i);
    const h = mid(rh, i);
    const wbgt = wbgtFromWeather({
      temp: t,
      rh: h,
      wind: ok(wind[i]) ? mid(wind, i) : 1,
      solar: solar[next] ?? 0,
      direct: ok(direct[next]) ? direct[next] : null,
      elevation: place.elevation ?? 0,
      lat: place.lat,
      lon: place.lon,
      date,
      clockHour: hour + 0.5,
      utcOffset: place.utcOffset ?? 5.5,
    });
    if (!days.has(date)) days.set(date, []);
    days.get(date).push({ hour, temp: t, rh: h, wbgt });
  });
  return [...days.entries()].map(([date, hours]) => ({ date, hours }));
}

/** Today's and tomorrow's hours for a place, in that place's local time. */
export async function fetchForecast(lat, lon) {
  const query =
    `?latitude=${lat}&longitude=${lon}&hourly=${HOURLY_VARS.join(',')}` +
    '&wind_speed_unit=ms&timezone=auto&forecast_days=3';
  const place = (json) => ({ lat, lon, elevation: json.elevation, utcOffset: (json.utc_offset_seconds ?? 19800) / 3600 });
  const from = async (host, waitMs) => {
    if (waitMs) await new Promise((r) => setTimeout(r, waitMs));
    const json = await getJson(host + query, 12000);
    if (!json?.hourly?.time?.length) throw new Error('empty forecast');
    return toDays(json.hourly, place(json));
  };
  // Ask the main host first. If it has not answered in 2.5 s, ask the fallback
  // too and use whichever answers first.
  return Promise.any(FORECAST_HOSTS.map((host, i) => from(host, i * 2500)));
}

export const SAMPLE_DATE = '2026-05-20';

/** Real weather of one hot day (ERA5 reanalysis), so the tool can be tried out of season. */
export async function fetchSample(lat, lon) {
  const url =
    'https://archive-api.open-meteo.com/v1/archive' +
    `?latitude=${lat}&longitude=${lon}&hourly=${HOURLY_VARS.join(',')}` +
    `&wind_speed_unit=ms&timezone=auto&start_date=${SAMPLE_DATE}&end_date=2026-05-21`;
  const json = await getJson(url, 12000);
  const days = toDays(json.hourly, { lat, lon, elevation: json.elevation, utcOffset: (json.utc_offset_seconds ?? 19800) / 3600 });
  return days.find((d) => d.date === SAMPLE_DATE);
}

/** Looks up a place name inside India. Returns up to 5 matches. */
export async function searchPlace(name, lang = 'en') {
  const url =
    'https://geocoding-api.open-meteo.com/v1/search' +
    `?name=${encodeURIComponent(name)}&count=5&language=${lang}&countryCode=IN`;
  const json = await getJson(url, 9000);
  return (json.results || []).map((r) => ({
    name: r.name,
    region: [r.admin2, r.admin1].filter(Boolean).join(', '),
    lat: r.latitude,
    lon: r.longitude,
  }));
}
