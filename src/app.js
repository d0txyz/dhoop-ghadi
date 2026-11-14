import { CITIES } from './cities.js';
import { fetchForecast, fetchSample, searchPlace } from './data.js';
import { LANGS, t, sayHour } from './i18n.js';
import { planDay, assessShift } from './planner.js';
import { describe, shareText } from './summary.js';
import { WORK_TYPES } from './thresholds.js';

const $ = (id) => document.getElementById(id);
const SVG = 'http://www.w3.org/2000/svg';
const LEVEL_COLORS = ['var(--l0)', 'var(--l1)', 'var(--l2)', 'var(--l3)', 'var(--l4)'];
const EARLIEST = 5;
const LATEST = 20;

function load(key, fallback) {
  try {
    const raw = localStorage.getItem(`dg.${key}`);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}
function save(key, value) {
  try {
    localStorage.setItem(`dg.${key}`, JSON.stringify(value));
  } catch {
    /* storage is optional */
  }
}

function defaultLang() {
  const nav = (navigator.language || 'hi').slice(0, 2).toLowerCase();
  return LANGS.some(([code]) => code === nav) ? nav : 'hi';
}

const state = {
  lang: load('lang', defaultLang()),
  place: load('place', { id: 'delhi' }),
  work: load('work', 'construction'),
  newWorker: load('newWorker', false),
  day: 0,
  days: null,
  sample: null,
  error: false,
  loading: false,
};
if (!WORK_TYPES[state.work]) state.work = 'construction';
if (!LANGS.some(([code]) => code === state.lang)) state.lang = 'hi';

function placeInfo() {
  if (state.place.id) {
    const c = CITIES.find((row) => row[0] === state.place.id) || CITIES[0];
    return { name: state.lang === 'hi' || state.lang === 'mr' ? c[2] : c[1], lat: c[3], lon: c[4] };
  }
  return state.place;
}

// ---------- drawing ----------

function arcPath(cx, cy, r0, r1, a0, a1) {
  const pt = (r, a) => {
    const rad = ((a - 90) * Math.PI) / 180;
    return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
  };
  const [x0, y0] = pt(r1, a0);
  const [x1, y1] = pt(r1, a1);
  const [x2, y2] = pt(r0, a1);
  const [x3, y3] = pt(r0, a0);
  const large = a1 - a0 > 180 ? 1 : 0;
  const f = (n) => n.toFixed(2);
  return `M${f(x0)} ${f(y0)} A${r1} ${r1} 0 ${large} 1 ${f(x1)} ${f(y1)} L${f(x2)} ${f(y2)} A${r0} ${r0} 0 ${large} 0 ${f(x3)} ${f(y3)} Z`;
}

// Noon sits at the top of the dial, like the sun.
const angleOf = (hour) => ((hour - 12) / 24) * 360;

function drawDial(plan, label) {
  const svg = $('dial');
  svg.replaceChildren();
  const add = (tag, attrs, text) => {
    const el = document.createElementNS(SVG, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    if (text !== undefined) el.textContent = text;
    svg.appendChild(el);
    return el;
  };
  for (let hr = 0; hr < 24; hr++) {
    const h = plan.hours[hr];
    if (!h) continue;
    const inWindow = hr >= EARLIEST && hr < LATEST;
    add('path', {
      d: arcPath(160, 160, 92, 132, angleOf(hr) + 0.8, angleOf(hr + 1) - 0.8),
      fill: LEVEL_COLORS[h.level],
      opacity: inWindow ? 1 : 0.3,
    });
  }
  for (const [s, e] of plan.blocks) {
    add('path', { d: arcPath(160, 160, 138, 150, angleOf(s) + 0.8, angleOf(e) - 0.8), fill: 'var(--ink)' });
  }
  for (const hr of [0, 6, 12, 18]) {
    const rad = ((angleOf(hr) - 90) * Math.PI) / 180;
    add(
      'text',
      { x: 160 + 74 * Math.cos(rad), y: 160 + 74 * Math.sin(rad) + 5, 'text-anchor': 'middle', class: 'tick' },
      hr === 0 ? '24' : String(hr),
    );
  }
  add('text', { x: 160, y: 168, 'text-anchor': 'middle', class: 'center' }, label);
  svg.setAttribute('aria-label', label);
}

function drawUsualBar(usual) {
  const bar = $('usualBar');
  bar.replaceChildren();
  for (const h of usual.hours) {
    const cell = document.createElement('span');
    cell.style.background = LEVEL_COLORS[h.level];
    cell.textContent = String(h.hour > 12 ? h.hour - 12 : h.hour);
    cell.className = `cell lv${h.level}`;
    bar.appendChild(cell);
  }
}

// ---------- rendering ----------

function renderStatic() {
  const L = state.lang;
  document.documentElement.lang = L;
  $('appName').textContent = t(L, 'name');
  $('tagline').textContent = t(L, 'tagline');
  $('placeLabel').textContent = t(L, 'place');
  $('workLabel').textContent = t(L, 'work');
  $('placeQuery').placeholder = t(L, 'searchPlace');
  $('placeSearch').textContent = t(L, 'search');
  $('placeGps').textContent = t(L, 'myLocation');
  $('newWorkerLabel').textContent = t(L, 'newWorker');
  $('planTitle').textContent = t(L, 'planTitle');
  $('dialTitle').textContent = t(L, 'dialTitle');
  $('rulesTitle').textContent = t(L, 'rulesTitle');
  $('usualTitle').textContent = t(L, 'usualTitle');
  $('listen').textContent = t(L, 'listen');
  $('share').textContent = t(L, 'share');
  $('danger').textContent = t(L, 'danger');
  $('note').textContent = t(L, 'note');
  $('impactLink').textContent = t(L, 'impact');
  $('methodLink').textContent = t(L, 'method');
  $('sourceLink').textContent = t(L, 'source');

  const lang = $('lang');
  lang.replaceChildren(...LANGS.map(([code, label]) => new Option(label, code, false, code === L)));

  const place = $('place');
  const useHindi = L === 'hi' || L === 'mr';
  const options = CITIES.map((c) => new Option(useHindi ? c[2] : c[1], c[0], false, state.place.id === c[0]));
  if (!state.place.id) options.unshift(new Option(state.place.name, 'custom', true, true));
  place.replaceChildren(...options);

  const work = $('work');
  work.replaceChildren(
    ...Object.keys(WORK_TYPES).map((key) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip';
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(state.work === key));
      b.dataset.work = key;
      b.textContent = t(L, `work_${key}`);
      return b;
    }),
  );

  const day = $('day');
  day.replaceChildren(
    ...['today', 'tomorrow', 'sample'].map((key, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'day';
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', String(state.day === i));
      b.dataset.day = String(i);
      b.textContent = t(L, key);
      return b;
    }),
  );

  $('legend').replaceChildren(
    ...[0, 1, 2, 3, 4].map((lv) => {
      const li = document.createElement('li');
      const dot = document.createElement('i');
      dot.style.background = LEVEL_COLORS[lv];
      li.append(dot, t(L, `legend${lv}`));
      return li;
    }),
  );
  $('newWorker').checked = state.newWorker;
}

let lastSpeech = '';

function renderResult() {
  const L = state.lang;
  const status = $('status');
  const result = $('result');
  status.replaceChildren();

  if (state.loading) {
    status.textContent = t(L, 'loading');
    result.hidden = true;
    return;
  }
  if (state.error || !state.days) {
    const p = document.createElement('p');
    p.textContent = t(L, 'error');
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn';
    b.textContent = t(L, 'retry');
    b.addEventListener('click', refresh);
    status.append(p, b);
    result.hidden = true;
    return;
  }

  const isSample = state.day === 2;
  const day = isSample ? state.sample : state.days[Math.min(state.day, state.days.length - 1)];
  $('sampleNote').hidden = !isSample;
  $('sampleNote').textContent = t(L, 'sampleNote');
  if (!day) {
    status.textContent = t(L, 'error');
    result.hidden = true;
    return;
  }
  const opts = { load: WORK_TYPES[state.work], acclimatized: !state.newWorker, earliest: EARLIEST, latest: LATEST };
  const plan = planDay(day.hours, opts);
  const usual = assessShift(day.hours, opts);
  const summary = describe(L, plan, usual);
  const place = placeInfo();
  const dayLabel = t(L, ['today', 'tomorrow', 'sample'][state.day]);

  $('planWhere').textContent = `· ${place.name} · ${dayLabel}`;
  $('headline').textContent = summary.headline;
  $('rest').textContent = summary.rest;
  $('rest').hidden = !summary.rest;
  $('short').textContent = summary.short || '';
  $('short').hidden = !summary.short;
  $('planCard').dataset.kind = summary.kind;

  $('rule').textContent = summary.rule || t(L, 'rule4');
  $('water').textContent = t(L, 'water');
  $('usual').textContent = summary.usual;
  drawUsualBar(usual);

  const hoursWorked = Math.round((plan.workMin / 60) * 2) / 2;
  drawDial(plan, t(L, 'hoursUnit', { h: hoursWorked }));

  if (plan.peak) {
    $('peak').textContent = t(L, 'peak', {
      time: sayHour(L, plan.peak.hour),
      w: plan.peak.wbgt.toFixed(1),
      t: Math.round(plan.peak.temp),
    });
  }

  const url = location.origin + location.pathname;
  const text = shareText(L, place.name, dayLabel, t(L, `work_${state.work}`), summary, url);
  $('share').href = `https://wa.me/?text=${encodeURIComponent(text)}`;
  lastSpeech = [`${place.name}, ${dayLabel}.`, ...summary.lines, t(L, 'danger')].join(' ');
  $('listen').hidden = !('speechSynthesis' in window);

  result.hidden = false;
}

function render() {
  renderStatic();
  renderResult();
}

// ---------- data ----------

let requestId = 0;
async function refresh() {
  const id = ++requestId;
  const place = placeInfo();
  state.loading = true;
  state.error = false;
  renderResult();
  try {
    const [days, sample] = await Promise.all([
      fetchForecast(place.lat, place.lon),
      fetchSample(place.lat, place.lon).catch(() => null),
    ]);
    if (id !== requestId) return;
    state.days = days;
    state.sample = sample;
  } catch {
    if (id !== requestId) return;
    state.days = null;
    state.error = true;
  }
  state.loading = false;
  renderResult();
}

function setPlace(place) {
  state.place = place;
  save('place', place);
  $('placeResults').hidden = true;
  $('placeMsg').hidden = true;
  renderStatic();
  refresh();
}

// ---------- events ----------

$('lang').addEventListener('change', (e) => {
  state.lang = e.target.value;
  save('lang', state.lang);
  render();
});

$('place').addEventListener('change', (e) => {
  if (e.target.value !== 'custom') setPlace({ id: e.target.value });
});

$('work').addEventListener('click', (e) => {
  const key = e.target.dataset?.work;
  if (!key) return;
  state.work = key;
  save('work', key);
  render();
});

$('day').addEventListener('click', (e) => {
  const day = e.target.dataset?.day;
  if (day === undefined) return;
  state.day = Number(day);
  render();
});

$('newWorker').addEventListener('change', (e) => {
  state.newWorker = e.target.checked;
  save('newWorker', state.newWorker);
  renderResult();
});

async function runSearch() {
  const query = $('placeQuery').value.trim();
  if (query.length < 2) return;
  const list = $('placeResults');
  const msg = $('placeMsg');
  list.hidden = true;
  msg.hidden = true;
  try {
    const found = await searchPlace(query, state.lang === 'en' ? 'en' : 'hi');
    if (!found.length) throw new Error('none');
    list.replaceChildren(
      ...found.map((p) => {
        const li = document.createElement('li');
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = p.region ? `${p.name} (${p.region})` : p.name;
        b.addEventListener('click', () => setPlace({ name: p.name, lat: p.lat, lon: p.lon }));
        li.appendChild(b);
        return li;
      }),
    );
    list.hidden = false;
  } catch {
    msg.textContent = t(state.lang, 'noPlace');
    msg.hidden = false;
  }
}
$('placeSearch').addEventListener('click', runSearch);
$('placeQuery').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') runSearch();
});

$('placeGps').addEventListener('click', () => {
  if (!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const lat = Math.round(pos.coords.latitude * 100) / 100;
      const lon = Math.round(pos.coords.longitude * 100) / 100;
      setPlace({ name: `${lat}, ${lon}`, lat, lon });
    },
    () => {
      $('placeMsg').textContent = t(state.lang, 'noPlace');
      $('placeMsg').hidden = false;
    },
    { timeout: 10000 },
  );
});

$('listen').addEventListener('click', () => {
  if (!('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const voice = new SpeechSynthesisUtterance(lastSpeech);
  voice.lang = LANGS.find(([code]) => code === state.lang)[2];
  voice.rate = 0.9;
  speechSynthesis.speak(voice);
});

render();
refresh();
