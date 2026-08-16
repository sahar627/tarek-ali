/* سَحَر — المصحف والأذكار ومواقيت الصلاة
   يعمل بالكامل داخل الجهاز: لا شبكة، لا خوادم، لا تتبّع. */
(() => {
'use strict';

const $ = (s, r = document) => r.querySelector(s);
const AR = n => String(n).replace(/\d/g, d => '٠١٢٣٤٥٦٧٨٩'[d]);
const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const today = () => new Date().toISOString().slice(0, 10);
const mq = q => (window.matchMedia ? matchMedia(q) : { matches: false, addEventListener() {} });

/* ---------- التخزين ---------- */
const mem = {};
let persists = true;
try { localStorage.setItem('sahar.probe', '1'); localStorage.removeItem('sahar.probe'); }
catch { persists = false; }
const store = {
  get(k, d) {
    if (!persists) return k in mem ? mem[k] : d;
    try { const v = localStorage.getItem('sahar.' + k); return v ? JSON.parse(v) : d; } catch { return d; }
  },
  set(k, v) {
    mem[k] = v;
    if (persists) { try { localStorage.setItem('sahar.' + k, JSON.stringify(v)); } catch { persists = false; } }
  }
};

const prefs = Object.assign(
  { theme: 'night', q: 1.45, lh: 2.35, snd: true, city: null, method: 'makkah', asr: 1,
    alert: true, before: 15, chime: 'takbir', vib: true },
  store.get('prefs', {}));
let marks = store.get('marks', []);
let last = store.get('last', null);
let counters = store.get('counters', { d: today(), v: {} });
if (counters.d !== today()) counters = { d: today(), v: {} };

/* ---------- المظهر ---------- */
function applyTheme() {
  const night = prefs.theme === 'night' ||
    (prefs.theme === 'auto' && mq('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = night ? 'night' : 'day';
}
function applyType() {
  document.documentElement.style.setProperty('--q', prefs.q + 'rem');
  document.documentElement.style.setProperty('--lh', prefs.lh);
}
applyTheme(); applyType();
mq('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);

/* ---------- أصوات مُولَّدة داخل الجهاز (بلا ملفات صوتية) ---------- */
const snd = {
  ctx: null,
  ready() {
    if (!prefs.snd) return null;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    if (!this.ctx) { try { this.ctx = new AC(); } catch { return null; } }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  },
  tone(f, dur, type = 'sine', vol = .05, delay = 0) {
    const c = this.ready(); if (!c) return;
    const t = c.currentTime + delay, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + .012);
    g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    o.connect(g).connect(c.destination); o.start(t); o.stop(t + dur + .02);
  },
  page() {                       /* حفيف ورق */
    const c = this.ready(); if (!c) return;
    const n = Math.floor(c.sampleRate * .16);
    const buf = c.createBuffer(1, n, c.sampleRate), ch = buf.getChannelData(0);
    for (let i = 0; i < n; i++) {
      const k = i / n;
      ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - k, 2.2) * Math.min(1, k * 14);
    }
    const src = c.createBufferSource(); src.buffer = buf;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2300; bp.Q.value = .7;
    const g = c.createGain(); g.gain.value = .16;
    src.connect(bp).connect(g).connect(c.destination); src.start();
  },
  open() { this.tone(587.33, .22, 'sine', .045); this.tone(880, .26, 'sine', .03, .055); },

  /* نغمة وقورة من عبارتين متماثلتين، كل عبارة نغمتان صاعدتان */
  takbir(force) {
    const on = force || prefs.snd;
    if (!on) return;
    const saved = prefs.snd; prefs.snd = true;
    const P = (d) => {
      this.tone(293.66, 1.5, 'sine', .075, d);        /* رِي — القرار */
      this.tone(440.00, 1.7, 'sine', .055, d + .42);  /* لا — الجواب */
      this.tone(587.33, 2.0, 'sine', .035, d + .42);  /* طبقة علوية خفيفة */
    };
    P(0); P(2.6);
    prefs.snd = saved;
  },
  /* تنبيه لطيف قبل دخول الوقت */
  alert(force) {
    const saved = prefs.snd; if (force) prefs.snd = true;
    this.tone(659.25, .5, 'sine', .05);
    this.tone(880.00, .6, 'sine', .04, .22);
    this.tone(659.25, .8, 'sine', .03, .48);
    prefs.snd = saved;
  },
  /* عند إتمام قسم كامل من الأذكار أو ختم سورة */
  khatma() {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
      this.tone(f, 1.1 - i * .12, 'sine', .04, i * .17));
  },
  tick() { this.tone(1180, .05, 'triangle', .035); },
  done() { this.tone(659.25, .16, 'sine', .04); this.tone(987.77, .3, 'sine', .035, .09); }
};
addEventListener('pointerdown', () => snd.ready(), { once: true });

/* ---------- الأيقونات ---------- */
const I = {
  home: '<path d="M4 11l8-6 8 6v8a1 1 0 01-1 1h-4v-6H9v6H5a1 1 0 01-1-1z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>',
  book: '<path d="M12 6c-2-1.6-4.3-2.2-7-2v13c2.7-.2 5 .4 7 2 2-1.6 4.3-2.2 7-2V4c-2.7-.2-5 .4-7 2zm0 0v13" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>',
  beads: '<circle cx="12" cy="4.6" r="1.9"/><circle cx="17.5" cy="8.2" r="1.9"/><circle cx="19" cy="14.6" r="1.9"/><circle cx="12" cy="19" r="1.9"/><circle cx="5" cy="14.6" r="1.9"/><circle cx="6.5" cy="8.2" r="1.9"/>',
  clock: '<circle cx="12" cy="12" r="8.4" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M12 7.4V12l3 1.9" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>',
  gear: '<path d="M4 7h9m4 0h3M4 12h3m4 0h9M4 17h9m4 0h3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="15" cy="7" r="2.2" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="9" cy="12" r="2.2" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="15" cy="17" r="2.2" fill="none" stroke="currentColor" stroke-width="1.8"/>',
  moon: '<path d="M20 14.5A8 8 0 019.5 4 8.2 8.2 0 1020 14.5z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>',
  sun: '<circle cx="12" cy="12" r="4.2" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M12 3v2M12 19v2M21 12h-2M5 12H3m13.9-6.9l-1.4 1.4M8.5 15.5l-1.4 1.4m0-11.8l1.4 1.4m7 7l1.4 1.4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
  dawn: '<path d="M3 18h18M6.5 18a5.5 5.5 0 0111 0M12 4.5v3M5.6 8.1l2 2m10.8-2l-2 2" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>',
  dusk: '<path d="M3 18h18M6.5 18a5.5 5.5 0 0111 0M12 10.5v-3m-6.4 4.6l2-2m10.8 2l-2-2" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>',
  heart: '<path d="M12 20s-7-4.4-7-9.2A3.9 3.9 0 0112 8a3.9 3.9 0 017 2.8C19 15.6 12 20 12 20z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>',
  shield: '<path d="M12 3.5l7 2.6v5.3c0 4-3 7.3-7 9.1-4-1.8-7-5.1-7-9.1V6.1z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>',
  mosque: '<path d="M12 3.2c2.2 1.7 3.4 3 3.4 4.4H8.6c0-1.4 1.2-2.7 3.4-4.4zM6 20V9.6h12V20M4 20h16M10 20v-4a2 2 0 014 0v4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>',
  bed: '<path d="M4 18v-9m0 5h16v4m0-4a3 3 0 00-3-3h-6v3" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><circle cx="7.5" cy="11.5" r="1.7" fill="none" stroke="currentColor" stroke-width="1.7"/>',
  pin: '<path d="M12 21s6-5.6 6-10a6 6 0 10-12 0c0 4.4 6 10 6 10z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><circle cx="12" cy="11" r="2.2" fill="none" stroke="currentColor" stroke-width="1.7"/>'
};
const svg = (k, fill) => `<svg viewBox="0 0 24 24" aria-hidden="true"${fill ? ' fill="currentColor"' : ''}>${I[k]}</svg>`;
const beadsSvg = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6">' + I.beads + '</svg>';

/* أيقونة لكل قسم من الأذكار، بترتيب الأقسام في ملف البيانات */
const GROUP_ICONS = ['mosque', 'dawn', 'dusk', 'beads', 'beads', 'heart', 'heart', 'bed', 'sun', 'shield', 'shield'];

/* ================= مواقيت الصلاة ================= */
const D2R = Math.PI / 180, R2D = 180 / Math.PI;
const sinD = d => Math.sin(d * D2R), cosD = d => Math.cos(d * D2R), tanD = d => Math.tan(d * D2R);
const asinD = x => Math.asin(x) * R2D, acosD = x => Math.acos(x) * R2D;
const atan2D = (y, x) => Math.atan2(y, x) * R2D, acotD = x => Math.atan(1 / x) * R2D;
const fixN = (a, b) => { a -= b * Math.floor(a / b); return a < 0 ? a + b : a; };
const fix360 = a => fixN(a, 360), fix24 = a => fixN(a, 24);

const METHODS = {
  makkah:  { n: 'أم القرى (السعودية)', fajr: 18.5, isha: 90, min: true },
  egypt:   { n: 'الهيئة المصرية العامة للمساحة', fajr: 19.5, isha: 17.5 },
  mwl:     { n: 'رابطة العالم الإسلامي', fajr: 18, isha: 17 },
  karachi: { n: 'جامعة العلوم الإسلامية — كراتشي', fajr: 18, isha: 18 },
  isna:    { n: 'الجمعية الإسلامية بأمريكا الشمالية', fajr: 15, isha: 15 },
  dubai:   { n: 'الإمارات', fajr: 18.2, isha: 18.2 },
  qatar:   { n: 'قطر', fajr: 18, isha: 90, min: true },
  kuwait:  { n: 'الكويت', fajr: 18, isha: 17.5 },
  turkey:  { n: 'ديانت — تركيا', fajr: 18, isha: 17 }
};

/* مدن جاهزة: الاسم، العرض، الطول، الطريقة الافتراضية */
const CITIES = [
  ['مكة المكرمة', 21.4225, 39.8262, 'makkah'], ['المدينة المنورة', 24.4686, 39.6142, 'makkah'],
  ['الرياض', 24.7136, 46.6753, 'makkah'], ['جدة', 21.4858, 39.1925, 'makkah'],
  ['الدمام', 26.4207, 50.0888, 'makkah'], ['الخبر', 26.2794, 50.2083, 'makkah'],
  ['الطائف', 21.2703, 40.4158, 'makkah'], ['أبها', 18.2465, 42.5117, 'makkah'],
  ['تبوك', 28.3835, 36.5662, 'makkah'], ['بريدة', 26.3260, 43.9750, 'makkah'],
  ['حائل', 27.5219, 41.6907, 'makkah'], ['نجران', 17.4917, 44.1322, 'makkah'],
  ['جازان', 16.8894, 42.5511, 'makkah'], ['ينبع', 24.0895, 38.0618, 'makkah'],
  ['الهفوف', 25.3647, 49.5876, 'makkah'], ['خميس مشيط', 18.3060, 42.7290, 'makkah'],
  ['الجبيل', 27.0174, 49.6225, 'makkah'], ['عرعر', 30.9753, 41.0381, 'makkah'],
  ['سكاكا', 29.9697, 40.2064, 'makkah'], ['القطيف', 26.5196, 49.9962, 'makkah'],
  ['الدوحة', 25.2854, 51.5310, 'qatar'], ['دبي', 25.2048, 55.2708, 'dubai'],
  ['أبوظبي', 24.4539, 54.3773, 'dubai'], ['الشارقة', 25.3463, 55.4209, 'dubai'],
  ['الكويت', 29.3759, 47.9774, 'kuwait'], ['المنامة', 26.2285, 50.5860, 'mwl'],
  ['مسقط', 23.5880, 58.3829, 'mwl'], ['صنعاء', 15.3694, 44.1910, 'mwl'],
  ['عدن', 12.7794, 45.0367, 'mwl'],
  ['القاهرة', 30.0444, 31.2357, 'egypt'], ['الإسكندرية', 31.2001, 29.9187, 'egypt'],
  ['الجيزة', 30.0131, 31.2089, 'egypt'], ['المنصورة', 31.0409, 31.3785, 'egypt'],
  ['طنطا', 30.7865, 31.0004, 'egypt'], ['أسيوط', 27.1809, 31.1837, 'egypt'],
  ['أسوان', 24.0889, 32.8998, 'egypt'], ['الأقصر', 25.6872, 32.6396, 'egypt'],
  ['بورسعيد', 31.2653, 32.3019, 'egypt'], ['السويس', 29.9668, 32.5498, 'egypt'],
  ['الغردقة', 27.2579, 33.8116, 'egypt'],
  ['عمّان', 31.9454, 35.9284, 'mwl'], ['القدس', 31.7683, 35.2137, 'mwl'],
  ['غزة', 31.5017, 34.4668, 'mwl'], ['دمشق', 33.5138, 36.2765, 'mwl'],
  ['حلب', 36.2021, 37.1343, 'mwl'], ['بيروت', 33.8938, 35.5018, 'mwl'],
  ['بغداد', 33.3152, 44.3661, 'mwl'], ['البصرة', 30.5081, 47.7835, 'mwl'],
  ['أربيل', 36.1901, 44.0091, 'mwl'],
  ['الخرطوم', 15.5007, 32.5599, 'mwl'], ['طرابلس', 32.8872, 13.1913, 'mwl'],
  ['بنغازي', 32.1167, 20.0667, 'mwl'], ['تونس', 36.8065, 10.1815, 'mwl'],
  ['الجزائر', 36.7538, 3.0588, 'mwl'], ['الدار البيضاء', 33.5731, -7.5898, 'mwl'],
  ['الرباط', 34.0209, -6.8416, 'mwl'], ['مراكش', 31.6295, -7.9811, 'mwl'],
  ['نواكشوط', 18.0735, -15.9582, 'mwl'],
  ['إسطنبول', 41.0082, 28.9784, 'turkey'], ['أنقرة', 39.9334, 32.8597, 'turkey'],
  ['كراتشي', 24.8607, 67.0011, 'karachi'], ['لاهور', 31.5204, 74.3587, 'karachi'],
  ['كوالالمبور', 3.1390, 101.6869, 'mwl'], ['جاكرتا', -6.2088, 106.8456, 'mwl'],
  ['لندن', 51.5074, -0.1278, 'mwl'], ['باريس', 48.8566, 2.3522, 'mwl'],
  ['برلين', 52.5200, 13.4050, 'mwl'], ['نيويورك', 40.7128, -74.0060, 'isna'],
  ['تورونتو', 43.6532, -79.3832, 'isna']
];
const TZ_GUESS = {
  'Asia/Riyadh': 2, 'Asia/Qatar': 20, 'Asia/Dubai': 21, 'Asia/Kuwait': 24,
  'Asia/Bahrain': 25, 'Asia/Muscat': 26, 'Africa/Cairo': 29, 'Asia/Amman': 40,
  'Asia/Damascus': 43, 'Asia/Beirut': 45, 'Asia/Baghdad': 46, 'Africa/Khartoum': 49,
  'Africa/Tunis': 52, 'Africa/Algiers': 53, 'Africa/Casablanca': 54,
  'Europe/Istanbul': 58, 'Asia/Karachi': 60, 'Europe/London': 64, 'Europe/Paris': 65,
  'Europe/Berlin': 66, 'America/New_York': 67, 'America/Toronto': 68
};

function julian(y, m, d) {
  if (m <= 2) { y -= 1; m += 12; }
  const A = Math.floor(y / 100), B = 2 - A + Math.floor(A / 4);
  return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d + B - 1524.5;
}
function sunPos(jd) {
  const D = jd - 2451545.0;
  const g = fix360(357.529 + .98560028 * D), q = fix360(280.459 + .98564736 * D);
  const L = fix360(q + 1.915 * sinD(g) + .020 * sinD(2 * g));
  const e = 23.439 - .00000036 * D;
  const RA = fix24(atan2D(cosD(e) * sinD(L), cosD(L)) / 15);
  return { decl: asinD(sinD(e) * sinD(L)), eqt: q / 15 - RA };
}
function prayerTimes(date, lat, lng, tz, key, asrF) {
  const M = METHODS[key] || METHODS.makkah;
  const jd0 = julian(date.getFullYear(), date.getMonth() + 1, date.getDate()) - lng / 360;
  const decl = t => sunPos(jd0 + t / 24).decl;
  const noon = t => fix24(12 - sunPos(jd0 + t / 24).eqt);
  const at = (angle, t, before) => {
    const d = decl(t);
    const x = (-sinD(angle) - sinD(d) * sinD(lat)) / (cosD(d) * cosD(lat));
    if (x > 1 || x < -1) return NaN;
    return noon(t) + (before ? -1 : 1) * acosD(x) / 15;
  };
  let T = { fajr: 5, sunrise: 6, dhuhr: 12, asr: 13, sunset: 18, isha: 18 };
  for (let i = 0; i < 3; i++) {
    T = {
      fajr: at(M.fajr, T.fajr, true),
      sunrise: at(.833, T.sunrise, true),
      dhuhr: noon(T.dhuhr),
      asr: at(-acotD(asrF + tanD(Math.abs(lat - decl(T.asr)))), T.asr, false),
      sunset: at(.833, T.sunset, false),
      isha: M.min ? 0 : at(M.isha, T.isha, false)
    };
    if (M.min) T.isha = T.sunset + M.isha / 60;
  }
  const adj = tz - lng / 15, o = {};
  ['fajr', 'sunrise', 'dhuhr', 'asr', 'sunset', 'isha'].forEach(k => o[k] = T[k] + adj);
  o.dhuhr += 1 / 60;
  o.maghrib = o.sunset;
  if (M.min) o.isha = o.maghrib + M.isha / 60;
  return o;
}
const hhmm = h => {
  if (isNaN(h)) return '—';
  const t = fix24(h + .5 / 60), H = Math.floor(t), M = Math.floor((t - H) * 60);
  return AR(String(H).padStart(2, '0')) + ':' + AR(String(M).padStart(2, '0'));
};
function currentCity() {
  if (prefs.city) return prefs.city;
  let i = 0;
  try { i = TZ_GUESS[Intl.DateTimeFormat().resolvedOptions().timeZone] ?? 0; } catch {}
  const c = CITIES[i];
  return { n: c[0], lat: c[1], lng: c[2] };
}
function todayTimes(date = new Date()) {
  const c = currentCity();
  const tz = -date.getTimezoneOffset() / 60;
  return { c, t: prayerTimes(date, c.lat, c.lng, tz, prefs.method, prefs.asr) };
}
const PRAYERS = [
  ['fajr', 'الفجر', 'dawn'], ['sunrise', 'الشروق', 'sun'], ['dhuhr', 'الظهر', 'sun'],
  ['asr', 'العصر', 'dusk'], ['maghrib', 'المغرب', 'dusk'], ['isha', 'العشاء', 'moon']
];
/* الصلاة القادمة والوقت المتبقّي بالثواني */
function nextPrayer() {
  const now = new Date();
  const h = now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600;
  const { t } = todayTimes(now);
  for (const [k, name] of PRAYERS) {
    if (k === 'sunrise') continue;
    if (!isNaN(t[k]) && t[k] > h) return { k, name, left: (t[k] - h) * 3600 };
  }
  const tm = new Date(now.getTime() + 864e5);
  const t2 = todayTimes(tm).t;
  return { k: 'fajr', name: 'الفجر', left: (t2.fajr + 24 - h) * 3600 };
}
const dur = s => {
  s = Math.max(0, Math.floor(s));
  const H = Math.floor(s / 3600), M = Math.floor(s % 3600 / 60);
  return H ? `${AR(H)} س ${AR(String(M).padStart(2, '0'))} د` : `${AR(M)} دقيقة`;
};
function hijri(d = new Date()) {
  try {
    return new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura',
      { day: 'numeric', month: 'long', year: 'numeric' }).format(d);
  } catch { return ''; }
}


/* ================= مراقب مواقيت الصلاة =================
   ينبّه قبل دخول الوقت بالمدة المختارة، ثم عند دخوله.
   يعمل والتطبيق مفتوح؛ وللتنبيه والجهاز مغلق يلزم تطبيق أندرويد. */
const VIB = {                       /* نمط اهتزاز مميّز لكل صلاة */
  fajr:    [180, 90, 180, 90, 180],
  dhuhr:   [400],
  asr:     [200, 120, 200],
  maghrib: [500, 150, 250],
  isha:    [180, 120, 180, 120, 400]
};
let fired = store.get('fired', { d: today(), v: {} });
if (fired.d !== today()) fired = { d: today(), v: {} };

function notify(title, body) {
  try {
    if (window.Notification && Notification.permission === 'granted') {
      new Notification(title, { body, tag: 'sahar-prayer', icon: 'icons/icon-192.png' });
    }
  } catch {}
}
function banner(title, body) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `<b>${esc(title)}</b><span>${esc(body)}</span>`;
  document.body.appendChild(el);
  setTimeout(() => el.classList.add('go'), 20);
  setTimeout(() => { el.classList.remove('go'); setTimeout(() => el.remove(), 400); }, 9000);
}
function markFired(k) { fired.v[k] = 1; fired.d = today(); store.set('fired', fired); }

function checkPrayers() {
  if (!prefs.alert) return;
  const now = new Date();
  const h = now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600;
  const { t } = todayTimes(now);
  for (const [k, name] of PRAYERS) {
    if (k === 'sunrise' || isNaN(t[k])) continue;
    const diff = (t[k] - h) * 60;                     /* بالدقائق */

    if (prefs.before > 0 && diff <= prefs.before && diff > prefs.before - 1.2
        && !fired.v['b' + k]) {
      markFired('b' + k);
      snd.alert(true);
      if (prefs.vib && navigator.vibrate) navigator.vibrate([120, 80, 120]);
      const msg = `اقترب وقت صلاة ${name} — بعد ${AR(Math.round(diff))} دقيقة`;
      banner('تنبيه قبل الأذان', msg);
      notify('سَحَر', msg);
    }
    if (diff <= 0 && diff > -1.2 && !fired.v['a' + k]) {
      markFired('a' + k);
      if (prefs.chime === 'takbir') snd.takbir(true);
      else if (prefs.chime === 'soft') snd.alert(true);
      if (prefs.vib && navigator.vibrate) navigator.vibrate(VIB[k] || [400]);
      const msg = `حان الآن وقت صلاة ${name} بتوقيت ${currentCity().n}`;
      banner('دخل وقت الصلاة', msg);
      notify('سَحَر', msg);
    }
  }
}
setInterval(checkPrayers, 20000);

/* ---------- البيانات ---------- */
let QURAN = null, ADHKAR = null;
const embedded = id => { const el = document.getElementById(id); return el ? JSON.parse(el.textContent) : null; };
const loadJSON = async p => (await fetch(p, { cache: 'force-cache' })).json();
async function quran() { return QURAN || (QURAN = embedded('d-quran') || await loadJSON('data/quran.json')); }
async function adhkar() { return ADHKAR || (ADHKAR = embedded('d-adhkar') || await loadJSON('data/adhkar.json')); }

/* تجريد الحركات للبحث فقط */
const strip = s => s
  .replace(/\u0670/g, 'ا')
  .replace(/[\u0610-\u061A\u064B-\u065F\u06D6-\u06ED\u08F0-\u08F3\u0640]/g, '')
  .replace(/[اأإآٱء]/g, '')
  .replace(/ى/g, 'ي').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي').replace(/ة/g, 'ه')
  .replace(/[\u00A0\s]+/g, ' ').trim();
let INDEX = null;
const index = q => INDEX || (INDEX = q.text.map(s => s.map(strip)));

/* ---------- اللوحة المنبثقة والشريط ---------- */
const view = $('#view'), sheet = $('#sheet'), backdrop = $('#backdrop');
function openSheet(html) {
  sheet.innerHTML = html; sheet.hidden = false; backdrop.hidden = false;
  sheet.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', closeSheet));
}
function closeSheet() { sheet.hidden = true; backdrop.hidden = true; }
backdrop.onclick = closeSheet;
addEventListener('keydown', e => { if (e.key === 'Escape') closeSheet(); });

function setBar(title, sub, back) {
  $('#title').textContent = title;
  $('#subtitle').textContent = sub || '';
  $('#backBtn').hidden = !back;
  $('#backBtn').onclick = () => { location.hash = back || '#/home'; };
}
function setTab(name) {
  document.querySelectorAll('.tab').forEach(t =>
    t.setAttribute('aria-current', t.dataset.tab === name ? 'page' : 'false'));
}
let ticker = null;
const stopTicker = () => { if (ticker) { clearInterval(ticker); ticker = null; } };


/* بطاقة «ثبّته على جهازك» — تظهر فقط قبل التثبيت، وتتغيّر حسب الجهاز */
function installCard() {
  const standalone = mq('(display-mode: standalone)').matches || navigator.standalone;
  if (standalone) return '';
  if (location.protocol === 'file:') return `
    <section class="install">
      <div class="ih"><span class="ico g">${svg('pin')}</span>
        <div><b>احفظ نسخة من هذا الملف</b>
        <small>يعمل بلا إنترنت وبلا استضافة. أرسله كما هو لمن شئت.</small></div></div>
    </section>`;

  const ua = navigator.userAgent;
  const ios = /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const android = /Android/.test(ua);
  const steps = ios
    ? ['افتح الصفحة بمتصفح <b>Safari</b>',
       'اضغط زر المشاركة <b>⬆</b> في الأسفل',
       'اختر <b>«إضافة إلى الشاشة الرئيسية»</b>']
    : android
    ? ['اضغط قائمة المتصفح <b>⋮</b> في الأعلى',
       'اختر <b>«تثبيت التطبيق»</b> أو <b>«إضافة إلى الشاشة الرئيسية»</b>',
       'ستظهر أيقونة التطبيق مع بقية تطبيقاتك']
    : ['اضغط أيقونة التثبيت <b>⊕</b> في شريط العنوان',
       'أو من قائمة المتصفح اختر <b>«تثبيت»</b>',
       'ستظهر أيقونة التطبيق على سطح المكتب'];

  return `
    <section class="install">
      <div class="ih"><span class="ico g">${svg('pin')}</span>
        <div><b>ثبّته على ${ios || android ? 'شاشتك الرئيسية' : 'سطح المكتب'}</b>
        <small>يفتح بضغطة واحدة، بملء الشاشة، ويعمل بلا إنترنت.</small></div></div>
      <ol class="isteps">${steps.map(t => '<li>' + t + '</li>').join('')}</ol>
      <button class="ibtn" id="installNow" hidden>تثبيت الآن بضغطة واحدة</button>
    </section>`;
}

/* ================= الرئيسية (الغلاف) ================= */
async function viewHome() {
  setBar('سَحَر', 'المصحف · الأذكار · المواقيت'); setTab('home');
  const q = await quran();
  const np = nextPrayer(), hj = hijri();

  view.innerHTML = `
    <section class="cover">
      <div class="mark"><i></i><u></u><b></b></div>
      <h1>سَحَر</h1>
      <p class="aya">وَبِٱلۡأَسۡحَارِ هُمۡ يَسۡتَغۡفِرُونَ</p>
      <div class="roles"><span>المصحف الشريف</span><span>الأذكار</span><span>مواقيت الصلاة</span></div>
      <div class="badges"><span>بلا إعلانات</span><span>بلا إنترنت</span><span>بلا تتبّع</span></div>
    </section>

    ${installCard()}

    <a class="next" href="#/times" id="nextCard">
      <div class="top"><b>${esc(np.name)}</b><span>${esc(currentCity().n)}${hj ? ' · ' + esc(hj) : ''}</span></div>
      <div class="cd" id="cd">بعد ${dur(np.left)}</div>
    </a>

    ${last ? `<a class="tile wide" href="#/s/${last.s}/${last.a}" style="margin-top:9px">
      <span class="ico g">${svg('book')}</span>
      <div><b>متابعة القراءة</b><small>سورة ${esc(q.surahs[last.s - 1].n)} — الآية ${AR(last.a)}</small></div>
      <span class="arrow">‹</span></a>` : ''}

    <div class="tiles">
      <a class="tile" href="#/mushaf"><span class="ico">${svg('book')}</span>
        <b>المصحف</b><small>١١٤ سورة · بحث في النص · علامات</small></a>
      <a class="tile" href="#/adhkar"><span class="ico">${beadsSvg}</span>
        <b>الأذكار</b><small>الصباح والمساء وبعد الصلاة</small></a>
      <a class="tile wide" href="#/times"><span class="ico">${svg('clock')}</span>
        <div><b>مواقيت الصلاة</b><small>محسوبة داخل جهازك بلا اتصال</small></div>
        <span class="arrow">‹</span></a>
    </div>

    <p class="hint" style="text-align:center;margin-top:16px">
      كل شيء داخل جهازك. لا يُرسل التطبيق أي بيانات إلى أي جهة.</p>`;

  if (deferredPrompt && $('#installNow')) {
    const b = $('#installNow'); b.hidden = false;
    b.onclick = async () => {
      deferredPrompt.prompt(); await deferredPrompt.userChoice;
      deferredPrompt = null; b.hidden = true;
    };
  }

  stopTicker();
  ticker = setInterval(() => {
    const el = $('#cd'); if (!el) return stopTicker();
    const n = nextPrayer();
    el.textContent = 'بعد ' + dur(n.left);
    const b = $('#nextCard b'); if (b) b.textContent = n.name;
  }, 1000);
}

/* ================= المواقيت ================= */
function viewTimes() {
  setBar('مواقيت الصلاة', 'محسوبة داخل الجهاز'); setTab('times');
  render();

  function render() {
    const now = new Date();
    const { c, t } = todayTimes(now);
    const h = now.getHours() + now.getMinutes() / 60;
    const np = nextPrayer();
    const hj = hijri();

    view.innerHTML = `
      <div class="next">
        <div class="top"><b>${esc(np.name)}</b><span>${esc(c.n)}</span></div>
        <div class="cd" id="cd2">بعد ${dur(np.left)}</div>
      </div>
      ${hj ? `<p class="hint" style="text-align:center;margin:9px 0 0">${esc(hj)}</p>` : ''}

      <div class="times">
        ${PRAYERS.map(([k, name, ic]) => `
          <div class="time-row${np.k === k && k !== 'sunrise' ? ' now' : ''}">
            <span class="ico${k === 'sunrise' ? ' g' : ''}">${svg(ic)}</span>
            <b>${name}</b><span class="t">${hhmm(t[k])}</span>
          </div>`).join('')}
      </div>

      <div class="section-title">الإعدادات</div>
      <div class="card">
        <div class="set-row"><label for="city">المدينة</label>
          <select class="field" id="city" style="width:auto;min-width:170px">
            ${CITIES.map((x, i) => `<option value="${i}"${x[0] === c.n ? ' selected' : ''}>${esc(x[0])}</option>`).join('')}
          </select></div>
        <div class="set-row"><label for="meth">طريقة الحساب</label>
          <select class="field" id="meth" style="width:auto;min-width:170px">
            ${Object.entries(METHODS).map(([k, m]) => `<option value="${k}"${prefs.method === k ? ' selected' : ''}>${esc(m.n)}</option>`).join('')}
          </select></div>
        <div class="set-row"><label>وقت العصر</label>
          <div class="chips" id="asr">
            <button class="chip" data-a="1" aria-pressed="${prefs.asr === 1}">الجمهور</button>
            <button class="chip" data-a="2" aria-pressed="${prefs.asr === 2}">الحنفية</button>
          </div></div>
      </div>
      <button class="row" id="geo" style="justify-content:center;margin-top:9px;font-family:system-ui;font-size:.86rem">
        <span class="ico" style="width:34px;height:34px">${svg('pin')}</span> تحديد موقعي بدقّة</button>

      <div class="section-title">تنبيهات الصلاة</div>
      <div class="card">
        <div class="set-row"><label>التنبيه</label>
          <div class="chips" id="al">
            <button class="chip" data-v="1" aria-pressed="${prefs.alert !== false}">تشغيل</button>
            <button class="chip" data-v="0" aria-pressed="${prefs.alert === false}">إيقاف</button>
          </div></div>
        <div class="set-row"><label>تنبيه قبل الأذان</label>
          <div class="chips" id="bf">
            ${[0, 5, 10, 15, 20, 30].map(v => `<button class="chip" data-v="${v}"
              aria-pressed="${+prefs.before === v}">${v ? AR(v) + ' د' : 'بدون'}</button>`).join('')}
          </div></div>
        <div class="set-row"><label>نغمة دخول الوقت</label>
          <div class="chips" id="ch">
            <button class="chip" data-v="takbir" aria-pressed="${prefs.chime === 'takbir'}">تكبيرتان</button>
            <button class="chip" data-v="soft" aria-pressed="${prefs.chime === 'soft'}">نغمة هادئة</button>
            <button class="chip" data-v="none" aria-pressed="${prefs.chime === 'none'}">صامت</button>
          </div></div>
        <div class="set-row"><label>الاهتزاز</label>
          <div class="chips" id="vb">
            <button class="chip" data-v="1" aria-pressed="${prefs.vib !== false}">تشغيل</button>
            <button class="chip" data-v="0" aria-pressed="${prefs.vib === false}">إيقاف</button>
          </div></div>
      </div>
      <div style="display:flex;gap:8px;margin-top:9px">
        <button class="row" id="try" style="flex:1;justify-content:center;font-family:system-ui;font-size:.85rem">تجربة النغمة</button>
        <button class="row" id="perm" style="flex:1;justify-content:center;font-family:system-ui;font-size:.85rem">تفعيل الإشعارات</button>
      </div>
      <p class="hint" style="margin-top:9px">التنبيه يعمل والتطبيق مفتوح. وللتنبيه والجهاز مغلق
        يلزم تطبيق أندرويد المبني من نفس المشروع.</p>

      <div class="notice">
        الأوقات محسوبة فلكياً داخل جهازك بتوقيته المحلي، وقد تختلف دقيقة أو دقيقتين عن
        التقويم الرسمي المطبوع. <b>المرجع عند الاختلاف هو تقويم بلدك ومسجدك.</b>
      </div>`;

    $('#city').onchange = e => {
      const x = CITIES[+e.target.value];
      prefs.city = { n: x[0], lat: x[1], lng: x[2] };
      prefs.method = x[3];
      store.set('prefs', prefs); snd.open(); render();
    };
    $('#meth').onchange = e => { prefs.method = e.target.value; store.set('prefs', prefs); render(); };
    $('#asr').onclick = e => {
      const b = e.target.closest('.chip'); if (!b) return;
      prefs.asr = +b.dataset.a; store.set('prefs', prefs); snd.tick(); render();
    };
    const pick = (id, key, cast) => {
      const el = $('#' + id); if (!el) return;
      el.onclick = e => {
        const b = e.target.closest('.chip'); if (!b) return;
        prefs[key] = cast(b.dataset.v); store.set('prefs', prefs); snd.tick(); render();
      };
    };
    pick('al', 'alert', v => v === '1');
    pick('bf', 'before', v => +v);
    pick('ch', 'chime', v => v);
    pick('vb', 'vib', v => v === '1');

    $('#try').onclick = () => {
      if (prefs.chime === 'takbir') snd.takbir(true);
      else if (prefs.chime === 'soft') snd.alert(true);
      if (prefs.vib && navigator.vibrate) navigator.vibrate(VIB.maghrib);
      banner('تجربة', 'هكذا سيصلك التنبيه عند دخول وقت الصلاة');
    };
    $('#perm').onclick = async () => {
      if (!window.Notification) { alert('الإشعارات غير مدعومة في هذا المتصفح.'); return; }
      const r = await Notification.requestPermission();
      $('#perm').textContent = r === 'granted' ? 'الإشعارات مفعّلة ✓' : 'لم يُسمح بالإشعارات';
    };

    $('#geo').onclick = () => {
      if (!navigator.geolocation) { alert('تحديد الموقع غير متاح في هذا المتصفح.'); return; }
      navigator.geolocation.getCurrentPosition(
        p => {
          prefs.city = { n: 'موقعي', lat: +p.coords.latitude.toFixed(4), lng: +p.coords.longitude.toFixed(4) };
          store.set('prefs', prefs); snd.open(); render();
        },
        () => alert('تعذّر تحديد الموقع. اختر مدينتك من القائمة.'),
        { timeout: 10000 });
    };

    stopTicker();
    ticker = setInterval(() => {
      const el = $('#cd2'); if (!el) return stopTicker();
      el.textContent = 'بعد ' + dur(nextPrayer().left);
    }, 1000);
  }
}

/* ================= المصحف ================= */
async function viewMushaf() {
  setBar('المصحف الشريف', '١١٤ سورة', '#/home'); setTab('mushaf');
  view.innerHTML = '<p class="loading">جارٍ فتح المصحف…</p>';
  const q = await quran();

  view.innerHTML = `
    <input class="field" id="q" type="search" inputmode="search"
           placeholder="ابحث في السور أو في نص القرآن…" autocomplete="off">
    ${marks.length ? `<div class="section-title">العلامات المحفوظة</div>
      <div class="list">${marks.slice(0, 6).map(m => `
        <a class="row" href="#/s/${m.s}/${m.a}">
          <span class="star"><span>${AR(m.a)}</span></span>
          <span class="row-main"><b>${esc(q.surahs[m.s - 1].n)}</b><small>الآية ${AR(m.a)}</small></span>
          <span class="arrow">‹</span></a>`).join('')}</div>` : ''}
    <div class="section-title">السور</div>
    <div class="list" id="list"></div>`;

  const list = $('#list');
  list.innerHTML = q.surahs.map(s => `
    <a class="row" href="#/s/${s.i}/1">
      <span class="star"><span>${AR(s.i)}</span></span>
      <span class="row-main"><b>${esc(s.n)}</b><small>${s.t} · ${AR(s.c)} آية</small></span>
      <span class="arrow">‹</span></a>`).join('');

  let timer;
  $('#q').addEventListener('input', e => {
    clearTimeout(timer);
    const raw = e.target.value.trim();
    timer = setTimeout(() => search(raw, list, q), 220);
  });
}

function search(raw, list, q) {
  if (!raw) { viewMushaf(); return; }
  const n = strip(raw);
  const byName = q.surahs.filter(s => strip(s.n).includes(n) ||
    s.tr.toLowerCase().includes(raw.toLowerCase()) || String(s.i) === raw);
  const hits = [];
  if (n.length >= 3) {
    const idx = index(q);
    outer: for (let si = 0; si < 114; si++) {
      for (let ai = 0; ai < idx[si].length; ai++) {
        if (idx[si][ai].includes(n)) {
          hits.push({ s: si + 1, a: ai + 1, t: q.text[si][ai] });
          if (hits.length >= 60) break outer;
        }
      }
    }
  }
  list.innerHTML =
    (byName.length ? '<div class="section-title">سور</div>' + byName.map(s => `
      <a class="row" href="#/s/${s.i}/1"><span class="star"><span>${AR(s.i)}</span></span>
      <span class="row-main"><b>${esc(s.n)}</b><small>${s.t} · ${AR(s.c)} آية</small></span></a>`).join('') : '') +
    (hits.length ? `<div class="section-title">آيات (${AR(hits.length)}${hits.length >= 60 ? '+' : ''})</div>` +
      hits.map(h => `<a class="row" href="#/s/${h.s}/${h.a}">
        <span class="row-main"><b style="font-family:'AmiriQuran',serif;font-size:1.08rem;line-height:2">${esc(h.t)}</b>
        <small>${esc(q.surahs[h.s - 1].n)} — الآية ${AR(h.a)}</small></span></a>`).join('') : '') ||
    '<p class="empty">لا نتائج. جرّب كلمة أقصر أو بدون حركات.</p>';
}

let io = null;
async function viewSurah(si, ai) {
  const q = await quran();
  const s = q.surahs[si - 1];
  if (!s) { location.hash = '#/mushaf'; return; }
  setBar(s.n, `${s.t} · ${AR(s.c)} آية`, '#/mushaf'); setTab('mushaf');

  const body = q.text[si - 1].map((t, i) => {
    const no = i + 1;
    const mk = marks.some(m => m.s === si && m.a === no) ? ' is-marked' : '';
    return `<span class="ayah${mk}" data-a="${no}" id="a${no}">${esc(t)}<span class="num">${AR(no)}</span></span> `;
  }).join('');

  view.innerHTML = `
    <div class="surah-head"><b>سورة ${esc(s.n)}</b><small>${s.t} · ${AR(s.c)} آية</small></div>
    ${si !== 1 && si !== 9 ? '<div class="basmala">بِسۡمِ ٱللَّهِ ٱلرَّحۡمَٰنِ ٱلرَّحِيمِ</div>' : ''}
    <div class="mushaf" id="mushaf">${body}</div>
    <div class="pager">
      ${si > 1 ? `<a href="#/s/${si - 1}/1">السابقة: ${esc(q.surahs[si - 2].n)}</a>` : '<span></span>'}
      ${si < 114 ? `<a href="#/s/${si + 1}/1">التالية: ${esc(q.surahs[si].n)}</a>` : '<span></span>'}
    </div>`;

  $('#mushaf').addEventListener('click', e => {
    const el = e.target.closest('.ayah'); if (!el) return;
    const no = +el.dataset.a, txt = q.text[si - 1][no - 1];
    document.querySelectorAll('.ayah.is-active').forEach(x => x.classList.remove('is-active'));
    el.classList.add('is-active');
    const isMarked = marks.some(m => m.s === si && m.a === no);
    openSheet(`
      <h3>${esc(s.n)} — الآية ${AR(no)}</h3>
      <p style="font-family:'AmiriQuran',serif;font-size:1.22rem;line-height:2.15;margin:0">${esc(txt)}</p>
      <div class="sheet-actions">
        <button id="cp">نسخ الآية</button>
        <button id="mk">${isMarked ? 'إزالة العلامة' : 'حفظ علامة عند هذه الآية'}</button>
        <button data-close>إغلاق</button>
      </div>`);
    $('#cp').onclick = async () => {
      try { await navigator.clipboard.writeText(`${txt}\n[${s.n}: ${no}]`); $('#cp').textContent = 'تم النسخ ✓'; }
      catch { $('#cp').textContent = 'تعذّر النسخ'; }
    };
    $('#mk').onclick = () => {
      marks = isMarked ? marks.filter(m => !(m.s === si && m.a === no))
                       : [{ s: si, a: no }, ...marks].slice(0, 40);
      store.set('marks', marks); el.classList.toggle('is-marked', !isMarked); closeSheet();
    };
  });

  if (io) { io.disconnect(); io = null; }
  if ('IntersectionObserver' in window) {
    io = new IntersectionObserver(en => {
      const vis = en.filter(x => x.isIntersecting).map(x => +x.target.dataset.a);
      if (vis.length) { last = { s: si, a: Math.min(...vis) }; store.set('last', last); }
    }, { rootMargin: '-45% 0px -45% 0px' });
    document.querySelectorAll('.ayah').forEach(el => io.observe(el));
  } else { last = { s: si, a: ai || 1 }; store.set('last', last); }

  if (ai > 1) {
    const t = $('#a' + ai);
    if (t) { t.scrollIntoView({ block: 'center' }); t.classList.add('is-active'); }
  } else scrollTo(0, 0);
}

/* ================= الأذكار ================= */
async function viewAdhkar() {
  setBar('الأذكار', 'من الكتاب والسنة', '#/home'); setTab('adhkar');
  view.innerHTML = '<p class="loading">جارٍ التحميل…</p>';
  const d = await adhkar();
  view.innerHTML = `
    <p class="hint">اضغط على بطاقة الذكر لينقص العدّاد. العدّادات تُصفَّر تلقائياً كل يوم.</p>
    <div class="list">${d.groups.map((g, i) => {
      const total = g.items.reduce((a, x) => a + x.n, 0);
      const done = g.items.reduce((a, x, ii) => a + (counters.v[i + ':' + ii] || 0), 0);
      return `<a class="row" href="#/z/${i}" style="flex-wrap:wrap">
        <span class="ico${i % 2 ? ' g' : ''}">${svg(GROUP_ICONS[i] || 'beads')}</span>
        <span class="row-main"><b>${esc(g.t)}</b><small>${esc(g.s)} · ${AR(g.items.length)} ذكراً</small></span>
        <span class="arrow">‹</span>
        <span class="progress" style="flex-basis:100%"><i style="width:${Math.round(done / total * 100)}%"></i></span></a>`;
    }).join('')}</div>`;
}

async function viewGroup(gi) {
  const d = await adhkar();
  const g = d.groups[gi];
  if (!g) { location.hash = '#/adhkar'; return; }
  setBar(g.t, g.s, '#/adhkar'); setTab('adhkar');

  view.innerHTML = `<div class="list" id="zlist">${g.items.map((it, ii) => card(gi, ii, it)).join('')}</div>
    <button class="row" id="reset" style="justify-content:center;margin-top:12px;font-family:system-ui;font-size:.86rem">
      إعادة ضبط عدّادات هذا القسم</button>`;

  $('#zlist').addEventListener('click', e => {
    const el = e.target.closest('.dhikr'); if (!el) return;
    const ii = +el.dataset.ii, it = g.items[ii], key = gi + ':' + ii;
    const done = counters.v[key] || 0;
    if (done >= it.n) return;
    counters.v[key] = done + 1; counters.d = today(); store.set('counters', counters);
    el.outerHTML = card(gi, ii, it);
    if (navigator.vibrate) navigator.vibrate(12);
    const all = g.items.every((x, j) => (counters.v[gi + ':' + j] || 0) >= x.n);
    if (all) { snd.khatma(); if (navigator.vibrate) navigator.vibrate([100, 80, 100, 80, 250]); }
    else (done + 1 >= it.n) ? snd.done() : snd.tick();
  });
  $('#reset').onclick = () => {
    g.items.forEach((_, ii) => delete counters.v[gi + ':' + ii]);
    store.set('counters', counters); viewGroup(gi);
  };
}

function card(gi, ii, it) {
  const done = counters.v[gi + ':' + ii] || 0, left = it.n - done;
  return `<article class="dhikr${left <= 0 ? ' done' : ''}" data-ii="${ii}">
    <div class="txt">${esc(it.z)}</div>
    ${(it.d || it.r) ? `<div class="meta">${it.d ? esc(it.d) + '<br>' : ''}${it.r ? '<b>المصدر:</b> ' + esc(it.r) : ''}</div>` : ''}
    <div class="dhikr-bar">
      <span class="counter">${left <= 0 ? '✓' : AR(left)}</span>
      <span style="flex:1">
        <span class="hint">${it.n > 1 ? 'تُقال ' + AR(it.n) + ' مرات' : 'تُقال مرة واحدة'}</span>
        <span class="progress"><i style="width:${done / it.n * 100}%"></i></span>
      </span>
    </div></article>`;
}

/* ================= الإعدادات ================= */
function viewSettings() {
  setBar('الإعدادات', 'المظهر والخط والمعلومات', '#/home');
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = mq('(display-mode: standalone)').matches || navigator.standalone;
  const fileMode = location.protocol === 'file:';

  view.innerHTML = `
    <div class="card">
      <div class="set-row"><label>المظهر</label>
        <div class="chips" id="th">
          <button class="chip" data-t="night" aria-pressed="${prefs.theme === 'night'}">ليلي</button>
          <button class="chip" data-t="day" aria-pressed="${prefs.theme === 'day'}">نهاري</button>
          <button class="chip" data-t="auto" aria-pressed="${prefs.theme === 'auto'}">تلقائي</button>
        </div></div>
      <div class="set-row"><label for="fs">حجم خط المصحف</label>
        <input id="fs" type="range" min="1.15" max="2.4" step="0.05" value="${prefs.q}"></div>
      <div class="set-row"><label for="lh">تباعد الأسطر</label>
        <input id="lh" type="range" min="1.9" max="3.2" step="0.05" value="${prefs.lh}"></div>
      <div class="set-row"><label>أصوات الواجهة</label>
        <div class="chips" id="sd">
          <button class="chip" data-s="1" aria-pressed="${prefs.snd !== false}">تشغيل</button>
          <button class="chip" data-s="0" aria-pressed="${prefs.snd === false}">إيقاف</button>
        </div></div>
    </div>
    <div class="mushaf" style="margin-top:11px;text-align-last:center">
      بِسۡمِ ٱللَّهِ ٱلرَّحۡمَٰنِ ٱلرَّحِيمِ<span class="num">١</span></div>

    ${fileMode ? `<div class="notice"><b>أنت تشغّل النسخة الملفّية.</b><br>
      هذا الملف الواحد يحوي كل شيء ويعمل بلا إنترنت وبلا استضافة.
      ${persists ? '' : '<br><br><b>تنبيه:</b> متصفحك يمنع الحفظ في وضع الملف، فالعلامات والعدّادات تعمل أثناء الجلسة فقط.'}
      </div>` : !standalone ? `<div class="notice"><b>لتثبيت التطبيق على الشاشة الرئيسية:</b><br>
      ${ios ? 'من متصفح Safari: زر المشاركة ⬆ ثم «إضافة إلى الشاشة الرئيسية».'
            : 'من قائمة المتصفح: «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية».'}
      <br>بعدها يعمل بلا إنترنت.</div>
      <button class="row" id="install" hidden style="justify-content:center;margin-top:9px">تثبيت التطبيق الآن</button>` : ''}

    <div class="section-title">عن التطبيق</div>
    <div class="card" style="padding:15px">
      <p class="about" style="margin:0 0 10px"><b>سَحَر</b> يعمل بالكامل داخل جهازك:
        لا إعلانات، ولا حسابات، ولا تتبّع، ولا يُرسل أي بيانات إلى أي جهة.</p>
      <p class="about" style="margin:0 0 10px"><b>نص المصحف:</b> رواية حفص بالرسم العثماني،
        من نسخة رقمية موثّقة، مقارَنة آيةً آيةً مع مصدر رقمي مستقل ثانٍ
        (١١٤ سورة و٦٢٣٦ آية، تطابق تام).</p>
      <p class="about" style="margin:0 0 10px"><b>المواقيت:</b> محسوبة فلكياً داخل الجهاز،
        وتم التحقق من الحساب بمقارنته بمكتبة فلكية مستقلة.</p>
      <p class="about" style="margin:0"><b>الأذكار:</b> مع عدد التكرار والتخريج. وأذكار ما بعد الصلاة مضبوطة على بطاقات مرجعية، ونصوصها القرآنية مدرَجة آلياً من ملف المصحف نفسه.</p>
    </div>
    <section class="dedication">
      <p>هذا العمل صدقة جارية،<br>
         اللهم اجعله في ميزان حسنات كلِّ من ساهم في بنائه ونشره</p>
      <span class="sig">طارق علي</span>
    </section>
    <p class="hint" style="text-align:center;margin:14px 0 0">الإصدار ٢٫٠</p>`;

  $('#th').onclick = e => {
    const b = e.target.closest('.chip'); if (!b) return;
    prefs.theme = b.dataset.t; store.set('prefs', prefs); applyTheme(); viewSettings();
  };
  $('#sd').onclick = e => {
    const b = e.target.closest('.chip'); if (!b) return;
    prefs.snd = b.dataset.s === '1'; store.set('prefs', prefs);
    if (prefs.snd) snd.page();
    viewSettings();
  };
  $('#fs').oninput = e => { prefs.q = +e.target.value; store.set('prefs', prefs); applyType(); };
  $('#lh').oninput = e => { prefs.lh = +e.target.value; store.set('prefs', prefs); applyType(); };
  if (deferredPrompt && $('#install')) {
    const b = $('#install'); b.hidden = false;
    b.onclick = async () => { deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt = null; b.hidden = true; };
  }
}
let deferredPrompt = null;
addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredPrompt = e; });

$('#settingsBtn').onclick = () => { location.hash = '#/settings'; };

/* زر المظهر في الشريط العلوي — تبديل فوري بضغطة */
function paintThemeBtn() {
  const night = document.documentElement.dataset.theme === 'night';
  $('#themeBtn').innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${night ? I.sun : I.moon}</svg>`;
  $('#themeBtn').setAttribute('aria-label', night ? 'التبديل إلى الوضع النهاري' : 'التبديل إلى الوضع الليلي');
}
$('#themeBtn').onclick = () => {
  prefs.theme = document.documentElement.dataset.theme === 'night' ? 'day' : 'night';
  store.set('prefs', prefs); applyTheme(); paintThemeBtn(); snd.tick();
  if ((location.hash || '#/home').startsWith('#/settings')) viewSettings();
};
paintThemeBtn();

/* ---------- التوجيه ---------- */
let booted = false;
function route() {
  closeSheet(); stopTicker();
  const p = (location.hash || '#/home').slice(2).split('/');
  if (booted) { p[0] === 's' ? snd.page() : snd.open(); }
  booted = true;
  if (p[0] === 's') return viewSurah(+p[1] || 1, +p[2] || 1);
  if (p[0] === 'z') return viewGroup(+p[1] || 0);
  if (p[0] === 'mushaf') return viewMushaf();
  if (p[0] === 'adhkar') return viewAdhkar();
  if (p[0] === 'times') return viewTimes();
  if (p[0] === 'settings') return viewSettings();
  return viewHome();
}
addEventListener('hashchange', route);
route();

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
})();
