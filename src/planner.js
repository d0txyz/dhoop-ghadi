// Dhoop Ghadi planner: turns hourly heat stress (WBGT, in deg C) into a work and rest plan.
// Pure functions, no I/O. The same file runs in the browser and in the backtest.

import { LIMITS, WORK_MINUTES } from './thresholds.js';

/**
 * Level of one hour for a given workload.
 * 0: work as usual, 1: 45 min work per hour, 2: 30 min, 3: 15 min, 4: stop.
 */
export function levelFor(wbgt, load, acclimatized = true) {
  const row = (acclimatized ? LIMITS.acclimatized : LIMITS.unacclimatized)[load];
  if (!row) throw new Error(`unknown workload: ${load}`);
  if (!Number.isFinite(wbgt)) throw new Error('wbgt must be a number');
  for (let level = 0; level < row.length; level++) {
    const limit = row[level];
    if (limit !== null && wbgt <= limit) return level;
  }
  return 4;
}

/** Adds level and allowed work minutes to each hour. */
export function classify(hours, load, acclimatized = true) {
  return hours.map((h) => {
    const level = levelFor(h.wbgt, load, acclimatized);
    return { ...h, level, workMin: WORK_MINUTES[level] };
  });
}

/**
 * A full day's work for a workload: what an eight-hour shift delivers on a
 * cool day. Heavy work always needs rest breaks, so its full day is six hours
 * of actual work, not eight.
 */
export function fullDayMinutes(load, acclimatized = true) {
  const row = (acclimatized ? LIMITS.acclimatized : LIMITS.unacclimatized)[load];
  if (!row) throw new Error(`unknown workload: ${load}`);
  const best = row.findIndex((limit) => limit !== null);
  return 8 * WORK_MINUTES[best];
}

// What the planner trades off, in "hours of bother".
const COST = {
  shortfallPerHour: 3, // an hour of work that could not be fitted in
  hotHour: 0.3, // an hour on site that needs 30 minutes of rest
  oddHour: 0.25, // an hour before 7 am or after 6 pm
  split: 1, // going home and coming back
  spanPerHour: 0.05, // a longer day on site
};
const USUAL_START = 7;
const USUAL_END = 18;

function scoreBlocks(day, blocks, targetMin, maxLevel) {
  let workMin = 0;
  let hot = 0;
  let odd = 0;
  for (const [s, e] of blocks) {
    for (let hr = s; hr < e; hr++) {
      const h = day[hr];
      if (!h || h.level > maxLevel) return null; // too hot to be worth being on site
      workMin += h.workMin;
      if (h.level >= 2) hot++;
      if (hr < USUAL_START || hr >= USUAL_END) odd++;
    }
  }
  const first = blocks[0][0];
  const span = blocks[blocks.length - 1][1] - first;
  const shortfall = Math.max(0, targetMin - workMin);
  const cost =
    (shortfall / 60) * COST.shortfallPerHour +
    hot * COST.hotHour +
    odd * COST.oddHour +
    (blocks.length - 1) * COST.split +
    span * COST.spanPerHour;
  return { blocks, workMin, shortfall, cost, span, start: first };
}

function better(a, b) {
  if (!b) return true;
  if (Math.abs(a.cost - b.cost) > 1e-9) return a.cost < b.cost;
  if (a.span !== b.span) return a.span < b.span;
  return a.start < b.start;
}

/**
 * Plans one day.
 * hours: 24 entries for one local day, each { hour: 0..23, wbgt }.
 * Returns the one or two work blocks between `earliest` and `latest` with the
 * lowest cost: as close as possible to a full day's work, with as little time
 * in heat, at hours as close to a normal working day as the heat allows.
 * Hours above `maxLevel` are never scheduled: when only 15 minutes of work
 * per hour is allowed, the hour is better spent resting out of the sun.
 */
export function planDay(hours, opts = {}) {
  const { load = 'heavy', acclimatized = true, earliest = 5, latest = 20, minGap = 1, maxLevel = 2 } = opts;
  const targetMin = opts.targetMin ?? fullDayMinutes(load, acclimatized);

  const day = new Array(24).fill(null);
  for (const h of classify(hours, load, acclimatized)) day[h.hour] = h;

  let best = null;
  for (let s1 = earliest; s1 < latest; s1++) {
    for (let e1 = s1 + 1; e1 <= latest; e1++) {
      const one = scoreBlocks(day, [[s1, e1]], targetMin, maxLevel);
      if (!one) break; // a too-hot hour entered the block; longer blocks also fail
      if (better(one, best)) best = one;
      for (let s2 = e1 + minGap; s2 < latest; s2++) {
        for (let e2 = s2 + 1; e2 <= latest; e2++) {
          const two = scoreBlocks(day, [[s1, e1], [s2, e2]], targetMin, maxLevel);
          if (!two) break;
          if (better(two, best)) best = two;
        }
      }
    }
  }

  const window = day.slice(earliest, latest).filter(Boolean);
  const peak = window.reduce((m, h) => (m === null || h.wbgt > m.wbgt ? h : m), null);

  if (!best) {
    return { blocks: [], workMin: 0, shortfall: targetMin, targetMin, cost: Infinity, span: 0, hours: day, peak, reached: false };
  }
  return { ...best, targetMin, hours: day, peak, reached: best.shortfall === 0 };
}

/**
 * What a fixed shift looks like on the same day (default 9:00 to 17:00).
 * overLimitHours: hours too hot for normal work with regular breaks
 *   (at least half of the hour must be rest, or work must stop).
 * severeHours: hours where at most 15 minutes of work is advised, or none.
 */
export function assessShift(hours, opts = {}) {
  const { load = 'heavy', acclimatized = true, start = 9, end = 17 } = opts;
  const day = classify(hours, load, acclimatized).filter((h) => h.hour >= start && h.hour < end);
  return {
    hours: day,
    overLimitHours: day.filter((h) => h.level >= 2).length,
    severeHours: day.filter((h) => h.level >= 3).length,
    stopHours: day.filter((h) => h.level === 4).length,
    workMin: day.reduce((sum, h) => sum + h.workMin, 0),
  };
}

/**
 * Scores a plan made from one set of numbers (a forecast) against another
 * (what actually happened). An hour is a miss when the real level was worse
 * than the level the worker was told to follow. The other counts use the
 * same definitions as assessShift, so the two can be compared directly.
 */
export function verifyPlan(plan, actualHours, opts = {}) {
  const { load = 'heavy', acclimatized = true } = opts;
  const actual = new Array(24).fill(null);
  for (const h of classify(actualHours, load, acclimatized)) actual[h.hour] = h;
  const out = { plannedHours: 0, missedHours: 0, overLimitHours: 0, severeHours: 0, stopHours: 0, workMin: 0 };
  for (const [s, e] of plan.blocks) {
    for (let hr = s; hr < e; hr++) {
      const a = actual[hr];
      const p = plan.hours[hr];
      if (!a || !p) continue;
      out.plannedHours++;
      out.workMin += Math.min(a.workMin, p.workMin);
      if (a.level > p.level) out.missedHours++;
      if (a.level >= 2) out.overLimitHours++;
      if (a.level >= 3) out.severeHours++;
      if (a.level === 4) out.stopHours++;
    }
  }
  return out;
}
