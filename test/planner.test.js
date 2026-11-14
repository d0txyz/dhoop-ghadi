import test from 'node:test';
import assert from 'node:assert/strict';
import { levelFor, planDay, assessShift, verifyPlan, fullDayMinutes } from '../src/planner.js';
import { describe } from '../src/summary.js';
import { sayHour, sayRange, t, LANGS } from '../src/i18n.js';

// A day shaped like a hot north Indian summer day: cool dawn, peak mid afternoon.
const day = (peak, low = peak - 9) =>
  Array.from({ length: 24 }, (_, hour) => ({
    hour,
    temp: 30,
    wbgt: Math.round((low + (peak - low) * Math.max(0, Math.cos(((hour - 14.5) / 24) * 2 * Math.PI))) * 10) / 10,
  }));
const flat = (wbgt) => Array.from({ length: 24 }, (_, hour) => ({ hour, temp: 30, wbgt }));

test('levelFor follows the limit table at the edges', () => {
  assert.equal(levelFor(28.0, 'moderate'), 0);
  assert.equal(levelFor(28.1, 'moderate'), 1);
  assert.equal(levelFor(29.0, 'moderate'), 1);
  assert.equal(levelFor(30.0, 'moderate'), 2);
  assert.equal(levelFor(31.5, 'moderate'), 3);
  assert.equal(levelFor(31.6, 'moderate'), 4);
  assert.equal(levelFor(20, 'heavy'), 1, 'heavy work always needs rest breaks');
  assert.equal(levelFor(20, 'veryHeavy'), 2);
  assert.ok(levelFor(27, 'moderate', false) > levelFor(27, 'moderate', true), 'new workers get stricter limits');
  assert.throws(() => levelFor(30, 'nope'));
  assert.throws(() => levelFor(NaN, 'light'));
});

test('a cool day gives one unbroken block that reaches the target', () => {
  const plan = planDay(flat(22), { load: 'moderate' });
  assert.equal(plan.reached, true);
  assert.equal(plan.blocks.length, 1);
  assert.equal(plan.workMin, 480);
  assert.equal(plan.blocks[0][1] - plan.blocks[0][0], 8);
});

test('a hot day splits the shift around the afternoon peak', () => {
  const hours = day(32, 24);
  const plan = planDay(hours, { load: 'moderate' });
  assert.equal(plan.blocks.length, 2);
  const [first, second] = plan.blocks;
  assert.ok(first[1] <= 13, 'morning block ends by early afternoon');
  assert.ok(second[0] >= 16, 'evening block starts after the peak');
  for (const [s, e] of plan.blocks) {
    for (let hr = s; hr < e; hr++) assert.ok(plan.hours[hr].level <= 2);
  }
  const usual = assessShift(hours, { load: 'moderate' });
  const planned = verifyPlan(plan, hours, { load: 'moderate' });
  assert.ok(usual.overLimitHours > planned.overLimitHours);
  assert.equal(planned.missedHours, 0, 'a plan checked against its own numbers has no misses');
});

test('never schedules a stop hour and reports a shortfall honestly', () => {
  const plan = planDay(flat(33), { load: 'heavy' });
  assert.deepEqual(plan.blocks, []);
  assert.equal(plan.reached, false);
  assert.equal(plan.workMin, 0);
  const severe = planDay(flat(30.2), { load: 'heavy' });
  assert.deepEqual(severe.blocks, [], 'hours with only 15 minutes of work are not scheduled');
  const warm = planDay(flat(29.5), { load: 'moderate' });
  assert.equal(warm.reached, false, 'only 30 minutes of work per hour is possible');
  assert.equal(warm.workMin, 30 * 15);
  assert.equal(warm.shortfall, 480 - 450);
});

test('a full day is what an eight-hour shift delivers on a cool day', () => {
  assert.equal(fullDayMinutes('light'), 480);
  assert.equal(fullDayMinutes('moderate'), 480);
  assert.equal(fullDayMinutes('heavy'), 360);
  assert.equal(fullDayMinutes('veryHeavy'), 240);
  const plan = planDay(flat(22), { load: 'heavy' });
  assert.equal(plan.reached, true);
  assert.equal(plan.workMin, 360);
  assert.deepEqual(plan.blocks, [[7, 15]], 'a cool day keeps normal hours');
});

test('a warm day keeps one block; only a severe afternoon splits the shift', () => {
  const warm = flat(27).map((h) => (h.hour >= 10 && h.hour < 14 ? { ...h, wbgt: 28.5 } : h));
  assert.equal(planDay(warm, { load: 'heavy' }).blocks.length, 1);
  const severe = flat(27).map((h) => (h.hour >= 10 && h.hour < 16 ? { ...h, wbgt: 31 } : h));
  const plan = planDay(severe, { load: 'heavy' });
  assert.equal(plan.blocks.length, 2);
  assert.ok(plan.blocks[0][1] <= 10 && plan.blocks[1][0] >= 16);
});

test('stays inside the allowed window', () => {
  const plan = planDay(day(31, 22), { load: 'heavy', earliest: 6, latest: 19 });
  assert.ok(plan.blocks[0][0] >= 6);
  assert.ok(plan.blocks.at(-1)[1] <= 19);
});

test('verifyPlan counts hours where reality was worse than the forecast', () => {
  const seen = flat(27);
  const plan = planDay(seen, { load: 'moderate' });
  const inside = plan.blocks[0][0];
  const real = flat(27).map((h) => (h.hour === inside ? { ...h, wbgt: 31 } : h));
  const check = verifyPlan(plan, real, { load: 'moderate' });
  assert.equal(check.missedHours, 1);
  assert.equal(check.severeHours, 1);
});

test('every language has its own text for every key', () => {
  const keys = ['name', 'workAt', 'restAt', 'water', 'danger', 'rule3', 'usualBad', 'work_brickKiln', 'short', 'stop'];
  for (const [code] of LANGS) {
    for (const key of keys) {
      const text = t(code, key);
      assert.notEqual(text, key, `${code}.${key} is missing`);
      if (code !== 'en') assert.notEqual(text, t('en', key), `${code}.${key} falls back to English`);
    }
    assert.ok(sayRange(code, 5, 10).length > 3);
  }
});

test('hours are said the way people say them', () => {
  assert.equal(sayHour('en', 5), '5 am');
  assert.equal(sayHour('en', 12), '12 noon');
  assert.equal(sayHour('en', 17), '5 pm');
  assert.equal(sayHour('hi', 5), 'सुबह 5 बजे');
  assert.equal(sayHour('hi', 17), 'शाम 5 बजे');
  assert.equal(sayHour('hi', 13), 'दोपहर 1 बजे');
});

test('summary sentences match the plan', () => {
  const hot = day(32, 24);
  const opts = { load: 'moderate' };
  const s = describe('en', planDay(hot, opts), assessShift(hot, opts));
  assert.equal(s.kind, 'plan');
  assert.match(s.headline, /^Work .+ and .+\.$/);
  assert.match(s.rest, /^Stop and rest in shade/);
  const cool = flat(22);
  assert.equal(describe('en', planDay(cool, opts), assessShift(cool, opts)).kind, 'safe');
  const lethal = flat(34);
  assert.equal(describe('hi', planDay(lethal, opts), assessShift(lethal, opts)).kind, 'stop');
  for (const line of s.lines) assert.ok(!line.includes('{'), 'no unfilled placeholder');
});
