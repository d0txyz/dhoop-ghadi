// Outdoor heat stress index: Wet Bulb Globe Temperature (WBGT), in deg C.
//
//   WBGT = 0.7 * Tnwb + 0.2 * Tg + 0.1 * Ta        (ISO 7243, outdoors with sun)
//
// Ta: air temperature. Tnwb: natural wet-bulb temperature. Tg: black globe
// temperature. Tnwb and Tg are solved from the energy balance of each sensor
// with the model of Liljegren et al. (2008), the reference method for deriving
// WBGT from ordinary weather variables.
//
// The solver below is a JavaScript port of the Liljegren implementation in
// ECMWF thermofeel (thermofeel/liljegren.py, (C) Copyright 1996- ECMWF,
// Apache Licence 2.0, http://www.apache.org/licenses/LICENSE-2.0), which was
// itself transcribed from Liljegren's reference C code. Changes: translated to
// JavaScript and scalar inputs. The port is checked against thermofeel's
// published test values in test/wbgt.test.js.
//
// Liljegren, J. C. et al. (2008). Modeling the wet bulb globe temperature using
// standard meteorological measurements. https://doi.org/10.1080/15459620802310770

const DEG = Math.PI / 180;

// Physical constants (Liljegren et al. 2008).
const STEFANB = 5.6696e-8; // Stefan-Boltzmann constant, W m-2 K-4
const CP = 1003.5; // specific heat of dry air, J kg-1 K-1
const M_AIR = 28.97; // molar mass of dry air, g mol-1
const M_H2O = 18.015; // molar mass of water, g mol-1
const R_GAS = 8314.34; // universal gas constant, J kmol-1 K-1
const R_AIR = R_GAS / M_AIR;
const PR = CP / (CP + 1.25 * R_AIR); // Prandtl number
const RATIO = (CP * M_AIR) / M_H2O;
const EMIS_WICK = 0.95;
const ALB_WICK = 0.4;
const D_WICK = 0.007; // m
const L_WICK = 0.0254; // m
const EMIS_GLOBE = 0.95;
const ALB_GLOBE = 0.05;
const D_GLOBE = 0.0508; // m
const EMIS_SFC = 0.999;
const ALB_SFC = 0.45;
const CZA_MIN = 0.00873; // cos(89.5 deg): below this the sun is treated as down
const MIN_SPEED = 0.13; // m/s
const MIN_WIND_10M = 0.62; // m/s, KNMI operational floor
const CONVERGENCE = 0.02; // K
const MAX_ITER = 500;

// Pasquill-Gifford stability classes for the 10 m to 2 m wind profile.
const LSRDT = [
  [1, 1, 2, 4, 0, 5, 6, 0],
  [1, 2, 3, 4, 0, 5, 6, 0],
  [2, 2, 3, 4, 0, 4, 4, 0],
  [3, 3, 4, 4, 0, 0, 0, 0],
  [3, 4, 4, 4, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0],
];
const URBAN_EXP = [0.15, 0.15, 0.2, 0.25, 0.3, 0.3];

/** Saturation vapour pressure over water in hPa, temperature in K (Buck, 1981). */
function esat(tk) {
  return 1.004 * 6.1121 * Math.exp((17.502 * (tk - 273.15)) / (tk - 32.18));
}

function dewPoint(e) {
  const z = Math.log(e / (6.1121 * 1.004));
  return 273.15 + (240.97 * z) / (17.502 - z);
}

function viscosity(tk) {
  const omega = ((tk / 97.0 - 2.9) / 0.4) * -0.034 + 1.048;
  return (2.6693e-6 * Math.sqrt(M_AIR * tk)) / (3.617 * 3.617 * omega);
}

function thermalCond(tk) {
  return (CP + 1.25 * R_AIR) * viscosity(tk);
}

function diffusivity(tk, pair) {
  const pcrit13 = Math.pow(36.4 * 218.0, 1 / 3);
  const tcrit512 = Math.pow(132.0 * 647.3, 5 / 12);
  const tcrit12 = Math.sqrt(132.0 * 647.3);
  const mmix = Math.sqrt(1 / M_AIR + 1 / M_H2O);
  return ((3.64e-4 * Math.pow(tk / tcrit12, 2.334) * pcrit13 * tcrit512 * mmix) / (pair / 1013.25)) * 1e-4;
}

function evap(tk) {
  return ((313.15 - tk) / 30.0) * -71100.0 + 2.4073e6;
}

function emisAtm(tk, rh) {
  return 0.575 * Math.pow(rh * esat(tk), 0.143);
}

function hSphere(tk, pair, speed) {
  const density = (pair * 100) / (R_AIR * tk);
  const re = (Math.max(speed, MIN_SPEED) * density * D_GLOBE) / viscosity(tk);
  const nu = 2.0 + 0.6 * Math.sqrt(re) * Math.pow(PR, 0.3333);
  return (nu * thermalCond(tk)) / D_GLOBE;
}

function hCylinder(tk, pair, speed) {
  const density = (pair * 100) / (R_AIR * tk);
  const re = (Math.max(speed, MIN_SPEED) * density * D_WICK) / viscosity(tk);
  const nu = 0.281 * Math.pow(re, 0.6) * Math.pow(PR, 0.44);
  return (nu * thermalCond(tk)) / D_WICK;
}

/** Globe temperature in deg C. ta in K, rh as a fraction, pair in hPa. */
function solveGlobe(ta, rh, pair, speed, solar, fdir, cza) {
  const emis = emisAtm(ta, rh);
  const czaSafe = cza > CZA_MIN ? cza : 1.0;
  const beam = fdir > 0 ? fdir * (1 / (2 * czaSafe) - 1) : 0;
  let prev = ta;
  for (let i = 0; i < MAX_ITER; i++) {
    const h = hSphere(0.5 * (prev + ta), pair, speed);
    const next = Math.pow(
      0.5 * (emis * ta ** 4 + EMIS_SFC * ta ** 4) -
        (h / (STEFANB * EMIS_GLOBE)) * (prev - ta) +
        (solar / (2 * STEFANB * EMIS_GLOBE)) * (1 - ALB_GLOBE) * (beam + 1 + ALB_SFC),
      0.25,
    );
    if (Math.abs(next - prev) < CONVERGENCE) return next - 273.15;
    prev = 0.9 * prev + 0.1 * next;
  }
  return NaN;
}

/** Natural wet-bulb temperature in deg C. ta in K, rh as a fraction, pair in hPa. */
function solveWetBulb(ta, rh, pair, speed, solar, fdir, cza) {
  const czaSafe = cza > CZA_MIN ? cza : 1.0;
  const sza = Math.acos(Math.min(1, Math.max(-1, czaSafe)));
  const emis = emisAtm(ta, rh);
  const eair = rh * esat(ta);
  let prev = dewPoint(eair);
  for (let i = 0; i < MAX_ITER; i++) {
    const tref = 0.5 * (prev + ta);
    const h = hCylinder(tref, pair, speed);
    const fatm =
      STEFANB * EMIS_WICK * (0.5 * (emis * ta ** 4 + EMIS_SFC * ta ** 4) - prev ** 4) +
      (1 - ALB_WICK) *
        solar *
        ((1 - fdir) * (1 + (0.25 * D_WICK) / L_WICK) +
          fdir * (Math.tan(sza) / Math.PI + (0.25 * D_WICK) / L_WICK) +
          ALB_SFC);
    const ewick = esat(prev);
    const density = (pair * 100) / (R_AIR * tref);
    const sc = viscosity(tref) / (density * diffusivity(tref, pair));
    const next =
      ta - ((evap(tref) / RATIO) * (ewick - eair)) / (pair - ewick) * Math.pow(PR / sc, 0.56) + fatm / h;
    if (Math.abs(next - prev) < CONVERGENCE) return next - 273.15;
    prev = 0.9 * prev + 0.1 * next;
  }
  return NaN;
}

/** Wind at 2 m from wind at 10 m, by time of day, sunshine and wind strength. */
export function windSpeed2m(wind10, cosZ, solar) {
  const daytime = cosZ > 0;
  const col = !daytime ? 5 : solar >= 925 ? 0 : solar >= 675 ? 1 : solar >= 175 ? 2 : 3;
  const row = daytime
    ? wind10 >= 6 ? 4 : wind10 >= 5 ? 3 : wind10 >= 3 ? 2 : wind10 >= 2 ? 1 : 0
    : wind10 >= 2.5 ? 2 : wind10 >= 2 ? 1 : 0;
  const exponent = URBAN_EXP[LSRDT[row][col] - 1];
  return Math.max(wind10 * Math.pow(0.2, exponent), MIN_SPEED);
}

/**
 * Liljegren WBGT in deg C.
 * temp: air deg C. rh: percent. pressure: hPa. wind10: m/s at 10 m.
 * solar: sunshine on flat ground, W/m2. directShare: part of it that comes
 * straight from the sun, 0 to 1. cosZ: cosine of the solar zenith angle.
 * Returns NaN if the energy balance does not converge.
 */
export function wbgtLiljegren({ temp, rh, pressure = 1000, wind10, solar, directShare, cosZ }) {
  const ta = temp + 273.15;
  const rhFrac = Math.min(Math.max(rh, 1), 100) / 100;
  const s = Math.max(0, solar || 0);
  const speed = windSpeed2m(Math.max(wind10, MIN_WIND_10M), cosZ, s);
  let fdir = Math.min(Math.max(directShare || 0, 0), 0.9);
  if (cosZ < CZA_MIN) fdir = 0;
  const globe = solveGlobe(ta, rhFrac, pressure, speed, s, fdir, cosZ);
  const natural = solveWetBulb(ta, rhFrac, pressure, speed, s, fdir, cosZ);
  return 0.1 * temp + 0.2 * globe + 0.7 * natural;
}

/** Air pressure in hPa at a height above sea level (standard atmosphere). */
export function pressureAt(elevationM = 0) {
  return 1013.25 * Math.pow(1 - 2.25577e-5 * Math.max(0, elevationM), 5.25588);
}

function dayOfYear(dateIso) {
  const [y, m, d] = dateIso.split('-').map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 0)) / 86400000);
}

/**
 * Cosine of the solar zenith angle.
 * clockHour: local clock time in hours (13.5 is 1:30 pm).
 * utcOffset: hours ahead of UTC (5.5 for India).
 */
export function cosZenith(lat, lon, dateIso, clockHour, utcOffset = 5.5) {
  const n = dayOfYear(dateIso);
  const decl = 23.44 * DEG * Math.sin((2 * Math.PI * (284 + n)) / 365);
  const b = (2 * Math.PI * (n - 81)) / 364;
  const eqTime = 9.87 * Math.sin(2 * b) - 7.53 * Math.cos(b) - 1.5 * Math.sin(b); // minutes
  const solarHour = clockHour + ((lon - 15 * utcOffset) * 4 + eqTime) / 60;
  const hourAngle = 15 * DEG * (solarHour - 12);
  return (
    Math.sin(lat * DEG) * Math.sin(decl) + Math.cos(lat * DEG) * Math.cos(decl) * Math.cos(hourAngle)
  );
}

/**
 * WBGT for one hour, rounded to 0.1 deg C.
 * Input: { temp, rh, wind (m/s at 10 m), solar, direct, pressure or elevation,
 *          lat, lon, date, clockHour, utcOffset }.
 * Pass cosZ directly to skip the sun position calculation.
 */
export function wbgtFromWeather(w) {
  const cosZ = Number.isFinite(w.cosZ)
    ? w.cosZ
    : cosZenith(w.lat, w.lon, w.date, w.clockHour, w.utcOffset ?? 5.5);
  const solar = Math.max(0, w.solar || 0);
  const directShare = solar > 0 && Number.isFinite(w.direct) ? w.direct / solar : solar > 0 ? 0.6 : 0;
  const pressure = Number.isFinite(w.pressure) ? w.pressure : pressureAt(w.elevation ?? 0);
  const value = wbgtLiljegren({ temp: w.temp, rh: w.rh, pressure, wind10: w.wind ?? 1, solar, directShare, cosZ });
  if (!Number.isFinite(value)) throw new Error('heat index did not converge');
  return Math.round(value * 10) / 10;
}
