import test from 'node:test';
import assert from 'node:assert/strict';
import { cosZenith, pressureAt, wbgtFromWeather, wbgtLiljegren, windSpeed2m } from '../src/wbgt.js';

const near = (actual, expected, tolerance, label) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: got ${actual}, expected ${expected} +/- ${tolerance}`);

// Published test values of the Liljegren model in ECMWF thermofeel
// (tests/test_scalars.py). Inputs: air K, RH %, pressure hPa, 10 m wind m/s,
// sunshine W/m2, direct share, cos(zenith). Expected WBGT in K.
test('the Liljegren port reproduces the reference test values', () => {
  const cases = [
    [308.15, 40, 1013, 1.0, 800, 0.7, 0.9, 306.559802],
    [303.15, 70, 1010, 3.0, 500, 0.5, 0.7, 302.954374],
    [298.15, 85, 1008, 2.0, 0, 0, 0.05, 296.597705],
  ];
  for (const [tk, rh, pressure, wind10, solar, directShare, cosZ, expectedK] of cases) {
    const w = wbgtLiljegren({ temp: tk - 273.15, rh, pressure, wind10, solar, directShare, cosZ });
    near(w + 273.15, expectedK, 0.001, `reference case ${tk} K`);
  }
});

test('wind at 2 m is slower than at 10 m and never below the floor', () => {
  assert.ok(windSpeed2m(4, 0.8, 800) < 4);
  assert.ok(windSpeed2m(4, 0.8, 800) > 2);
  assert.equal(windSpeed2m(0.01, 0.8, 800), 0.13);
  assert.ok(windSpeed2m(4, -0.2, 0) < windSpeed2m(4, 0.8, 950), 'stable night air slows the wind near the ground more');
});

test('pressure falls with height', () => {
  near(pressureAt(0), 1013.25, 0.01, 'sea level');
  near(pressureAt(920), 907, 3, 'Bengaluru');
});

test('sun is high at Delhi solar noon in May and below the horizon at midnight', () => {
  assert.ok(cosZenith(28.61, 77.21, '2026-05-20', 12.3) > 0.97);
  assert.ok(cosZenith(28.61, 77.21, '2026-05-20', 0) < 0);
  assert.ok(cosZenith(28.61, 77.21, '2026-12-21', 12.3) < 0.65, 'low winter sun');
});

test('sun, humidity and still air each raise the heat index', () => {
  const base = { temp: 35, rh: 40, wind: 2, solar: 700, direct: 450, lat: 22.57, lon: 88.36, date: '2026-05-20', clockHour: 12.5 };
  const w = wbgtFromWeather(base);
  assert.ok(w > 28 && w < 36, `midday ${w}`);
  assert.ok(wbgtFromWeather({ ...base, rh: 75 }) > w + 3, 'humid air');
  assert.ok(wbgtFromWeather({ ...base, wind: 0.5 }) > w, 'still air');
  assert.ok(wbgtFromWeather({ ...base, solar: 0, direct: 0, clockHour: 23 }) < w - 2, 'night');
});

test('a 43.6 C dry Delhi afternoon is in the severe range for heavy work', () => {
  const w = wbgtFromWeather({
    temp: 43.6, rh: 14, wind: 3.02, solar: 756, direct: 506, elevation: 216,
    lat: 28.61, lon: 77.21, date: '2026-05-20', clockHour: 13.5,
  });
  assert.ok(w > 29 && w < 34, `wbgt ${w}`);
});
