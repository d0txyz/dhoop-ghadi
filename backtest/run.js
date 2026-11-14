// Backtest: would Dhoop Ghadi's advice have held up in a real summer?
//
// For each place and each day of the season:
//   1. Plan the day from the forecast as it was issued one day ahead
//      (Open-Meteo Previous Runs API). This is what a worker would have seen.
//   2. Score that plan against what actually happened (ERA5 reanalysis,
//      Open-Meteo Archive API).
//   3. Score a fixed 9:00 to 17:00 shift against the same actual weather.
//
// The planner and the heat index are the same files the web app runs.
//
// Usage: node backtest/run.js [--start 2026-04-01] [--end 2026-06-30] [--refresh]

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { CITIES, BACKTEST_IDS } from '../src/cities.js';
import { HOURLY_VARS, toDays } from '../src/data.js';
import { planDay, assessShift, verifyPlan } from '../src/planner.js';

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const START = arg('start', '2026-04-01');
const END = arg('end', '2026-06-30');
const REFRESH = args.includes('--refresh');
const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const LOADS = ['veryHeavy', 'heavy', 'moderate', 'light'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function cached(name, url) {
  const file = here(`./cache/${name}.json`);
  if (!REFRESH) {
    try {
      return JSON.parse(await readFile(file, 'utf8'));
    } catch {
      /* not cached yet */
    }
  }
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (!json.hourly) throw new Error('no hourly data');
      await writeFile(file, JSON.stringify(json));
      await sleep(400);
      return json;
    } catch (err) {
      if (attempt >= 4) throw err;
      await sleep(3000 * attempt);
    }
  }
}

function blank() {
  return {
    days: 0,
    hotDays: 0, // days where the fixed shift had at least one over-limit hour
    fixed: { hours: 0, overLimit: 0, severe: 0, stop: 0, workMin: 0 },
    plan: { hours: 0, overLimit: 0, severe: 0, stop: 0, workMin: 0, missed: 0, splitDays: 0, shortDays: 0 },
  };
}

function addInto(total, part) {
  total.days += part.days;
  total.hotDays += part.hotDays;
  for (const side of ['fixed', 'plan']) {
    for (const key of Object.keys(part[side])) total[side][key] += part[side][key];
  }
}

const common = `&wind_speed_unit=ms&timezone=Asia%2FKolkata&start_date=${START}&end_date=${END}`;
const results = { generated: new Date().toISOString(), start: START, end: END, loads: {}, cities: [] };
for (const load of LOADS) results.loads[load] = blank();

await mkdir(here('./cache'), { recursive: true });

for (const id of BACKTEST_IDS) {
  const [, name, , lat, lon] = CITIES.find((c) => c[0] === id);
  const where = `?latitude=${lat}&longitude=${lon}`;
  const forecastVars = HOURLY_VARS.map((v) => `${v}_previous_day1`).join(',');
  const forecast = await cached(
    `${id}-forecast-${START}-${END}`,
    `https://previous-runs-api.open-meteo.com/v1/forecast${where}&hourly=${forecastVars}${common}`,
  );
  const actual = await cached(
    `${id}-actual-${START}-${END}`,
    `https://archive-api.open-meteo.com/v1/archive${where}&hourly=${HOURLY_VARS.join(',')}${common}`,
  );

  const forecastDays = new Map(toDays(forecast.hourly, { lat, lon, elevation: actual.elevation }, '_previous_day1').map((d) => [d.date, d.hours]));
  const actualDays = toDays(actual.hourly, { lat, lon, elevation: actual.elevation });
  const city = { id, name, lat, lon, loads: {} };

  for (const load of LOADS) {
    const sum = blank();
    for (const { date, hours: real } of actualDays) {
      const seen = forecastDays.get(date);
      if (!seen || seen.length < 24 || real.length < 24) continue;
      const opts = { load, acclimatized: true };

      const fixed = assessShift(real, opts);
      const plan = planDay(seen, opts);
      const check = verifyPlan(plan, real, opts);

      sum.days++;
      if (fixed.overLimitHours > 0) sum.hotDays++;
      sum.fixed.hours += fixed.hours.length;
      sum.fixed.overLimit += fixed.overLimitHours;
      sum.fixed.severe += fixed.severeHours;
      sum.fixed.stop += fixed.stopHours;
      sum.fixed.workMin += fixed.workMin;
      sum.plan.hours += check.plannedHours;
      sum.plan.overLimit += check.overLimitHours;
      sum.plan.severe += check.severeHours;
      sum.plan.stop += check.stopHours;
      sum.plan.workMin += check.workMin;
      sum.plan.missed += check.missedHours;
      if (plan.blocks.length === 2) sum.plan.splitDays++;
      if (!plan.reached) sum.plan.shortDays++;
    }
    city.loads[load] = sum;
    addInto(results.loads[load], sum);
  }
  results.cities.push(city);
  const h = city.loads.heavy;
  console.log(
    `${name.padEnd(12)} days ${h.days}  9-to-5 over-limit hours ${String(h.fixed.overLimit).padStart(4)}  ` +
      `Dhoop Ghadi ${String(h.plan.overLimit).padStart(4)}`,
  );
}

await writeFile(here('./results.json'), JSON.stringify(results, null, 2) + '\n');

const pct = (a, b) => (b ? ((100 * a) / b).toFixed(1) + '%' : 'n/a');
console.log(`\nSeason ${START} to ${END}, ${results.cities.length} places`);
for (const load of LOADS) {
  const r = results.loads[load];
  console.log(
    `\n${load}: ${r.days} place-days, ${r.hotDays} with a too-hot hour in the 9-to-5 shift\n` +
      `  9 to 5:      over-limit ${r.fixed.overLimit} h (${pct(r.fixed.overLimit, r.fixed.hours)} of shift hours), ` +
      `severe ${r.fixed.severe} h, safe work ${(r.fixed.workMin / 60 / r.days).toFixed(2)} h/day\n` +
      `  Dhoop Ghadi: over-limit ${r.plan.overLimit} h (${pct(r.plan.overLimit, r.plan.hours)} of planned hours), ` +
      `severe ${r.plan.severe} h, safe work ${(r.plan.workMin / 60 / r.days).toFixed(2)} h/day, ` +
      `forecast misses ${pct(r.plan.missed, r.plan.hours)}, split days ${r.plan.splitDays}, short days ${r.plan.shortDays}`,
  );
}
