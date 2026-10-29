// k6 load test (NFR-PERF-001…005): browse pages, search, JSON API and chat streams against a production build.
// PROFILE=normal: steady mixed load, thresholds must pass. PROFILE=stress: ramp chat streams up to CHAT_MAX to find where it breaks.
import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';

const BASE = __ENV.BASE_URL || 'http://localhost:3211';
const PROFILE = __ENV.PROFILE || 'normal';
const USERS = Number(__ENV.USERS || 60);
const CHAT_MAX = Number(__ENV.CHAT_MAX || 200);
const SCALE = Number(__ENV.SCALE || 1); // 1 = 58 concurrent VUs in the normal profile (about 20 = a pilot's busy moment at SCALE=0.35)
const scaled = (sc) => Object.fromEntries(Object.entries(sc).map(([k, v]) => [k, { ...v, stages: v.stages.map((st) => ({ ...st, target: Math.max(st.target ? 1 : 0, Math.round(st.target * SCALE)) })) }]));
const PASS = 'correct-horse-9';
const TS = __ENV.TS || String(Date.now());

const ttft = new Trend('chat_ttft_ms', true);
const complete = new Trend('chat_complete_ms', true);
const chatOk = new Rate('chat_ok');
const searchMs = new Trend('search_ms', true);
const pageMs = new Trend('page_ms', true);
const apiMs = new Trend('api_ms', true);
const chatFail = new Counter('chat_failures');

const normal = {
  browse: { executor: 'ramping-vus', exec: 'browse', startVUs: 0, stages: [{ duration: '30s', target: 20 }, { duration: '90s', target: 20 }, { duration: '10s', target: 0 }] },
  search: { executor: 'ramping-vus', exec: 'search', startVUs: 0, stages: [{ duration: '30s', target: 8 }, { duration: '90s', target: 8 }, { duration: '10s', target: 0 }] },
  api: { executor: 'ramping-vus', exec: 'api', startVUs: 0, stages: [{ duration: '30s', target: 10 }, { duration: '90s', target: 10 }, { duration: '10s', target: 0 }] },
  chat: { executor: 'ramping-vus', exec: 'chat', startVUs: 0, stages: [{ duration: '30s', target: 20 }, { duration: '90s', target: 20 }, { duration: '10s', target: 0 }] },
};
const stress = {
  chat: { executor: 'ramping-vus', exec: 'chat', startVUs: 0, stages: [
    { duration: '30s', target: Math.round(CHAT_MAX / 4) }, { duration: '40s', target: Math.round(CHAT_MAX / 4) },
    { duration: '30s', target: Math.round(CHAT_MAX / 2) }, { duration: '40s', target: Math.round(CHAT_MAX / 2) },
    { duration: '30s', target: CHAT_MAX }, { duration: '40s', target: CHAT_MAX }, { duration: '10s', target: 0 }] },
};

export const options = {
  setupTimeout: '300s', // hundreds of sign-ups
  noCookiesReset: true, // k6 empties the cookie jar every iteration by default; each VU signs in once
  scenarios: PROFILE === 'stress' ? stress : scaled(normal),
  thresholds: PROFILE === 'stress' ? {} : {
    'page_ms': ['p(95)<800'],
    'search_ms': ['p(95)<800'],
    'api_ms': ['p(95)<300'],
    'chat_ttft_ms': ['p(95)<3000'],
    'chat_complete_ms': ['p(95)<30000'],
    'chat_ok': ['rate>0.99'],
  },
  summaryTrendStats: ['avg', 'p(50)', 'p(90)', 'p(95)', 'max'],
};

const email = (i) => `load-${TS}-${i}@example.test`;
const QUESTIONS = [
  'ส่งงานช้า ลูกค้าจะหักค่าปรับวันละ 2 หมื่น ต้องจ่ายเต็มไหม',
  'ซัพพลายเออร์ส่งของไม่ได้มาตรฐาน แต่สัญญาไม่มีข้อเลิกสัญญา เลิกได้ไหม',
  'ถูกเลิกสัญญากะทันหันระหว่างทำงาน ขอค่างานที่ทำไปแล้วได้ไหม',
  'ปพพ 383 ว่าอย่างไร',
  'เบี้ยปรับคืออะไร',
  'อายุความเรียกค่าเสียหายจากสัญญากี่ปี',
];
const SEARCHES = ['ค่าปรับส่งงานช้า', 'เลิกสัญญา', 'ปพพ 383', 'มัดจำ', 'ความชำรุดบกพร่อง', 'สงวนสิทธิ'];

export function setup() {
  const n = PROFILE === 'stress' ? Math.max(USERS, CHAT_MAX + 10) : USERS;
  for (let i = 0; i < n; i++) {
    http.post(`${BASE}/api/auth/sign-up/email`, JSON.stringify({ email: email(i), password: PASS, name: `load ${i}` }),
      { headers: { 'content-type': 'application/json', origin: BASE }, tags: { name: 'setup' } });
  }
  return { n };
}

let signedIn = false;
function session(data) {
  if (signedIn) return;
  const i = (__VU - 1) % data.n;
  http.get(`${BASE}/login`, { tags: { name: 'bootstrap' } }); // sets the CSRF cookie
  const r = http.post(`${BASE}/api/auth/sign-in/email`, JSON.stringify({ email: email(i), password: PASS }),
    { headers: { 'content-type': 'application/json', origin: BASE }, tags: { name: 'bootstrap' } });
  check(r, { 'signed in': (x) => x.status === 200 });
  // the session cookie is `Secure` in a production build, which k6's jar will not send over http://localhost: re-set it plainly
  const jar = http.cookieJar();
  for (const [name, list] of Object.entries(r.cookies)) jar.set(BASE, name, list[0].value, { path: '/' });
  signedIn = true;
}
const csrf = () => { const c = http.cookieJar().cookiesForURL(BASE).lc_csrf; return c ? c[0] : ''; };

export function browse(data) {
  session(data);
  for (const path of ['/library', '/law/ccc/383', '/guides/notice-to-cure-then-terminate', '/library/glossary', '/templates/notice-to-cure']) {
    const r = http.get(`${BASE}${path}`, { tags: { name: `page ${path}` } });
    pageMs.add(r.timings.duration);
    check(r, { 'page 200': (x) => x.status === 200 });
    sleep(0.5 + Math.random());
  }
}

export function search(data) {
  session(data);
  const q = SEARCHES[Math.floor(Math.random() * SEARCHES.length)];
  const r = http.get(`${BASE}/library/search?q=${encodeURIComponent(q)}`, { tags: { name: 'search' } });
  searchMs.add(r.timings.duration);
  check(r, { 'search 200': (x) => x.status === 200 && x.body.includes('ผลการค้นหา') });
  sleep(1 + Math.random());
}

export function api(data) {
  session(data);
  group('json api', () => {
    for (const path of ['/api/v1/session', '/api/v1/glossary', '/api/v1/chats']) {
      const r = http.get(`${BASE}${path}`, { tags: { name: `api ${path}` } });
      apiMs.add(r.timings.duration);
      check(r, { 'api 200': (x) => x.status === 200 });
      if (r.status !== 200 && __ITER < 2) console.log(`api ${path} -> ${r.status} ${r.body.slice(0, 120)}`);
    }
  });
  sleep(0.5 + Math.random());
}

export function chat(data) {
  session(data);
  const message = QUESTIONS[Math.floor(Math.random() * QUESTIONS.length)];
  const r = http.post(`${BASE}/api/v1/chat/stream`, JSON.stringify({ message }),
    { headers: { 'content-type': 'application/json', 'x-csrf-token': csrf() }, tags: { name: 'chat stream' }, timeout: '90s' });
  const good = r.status === 200 && r.body.includes('event: complete') && r.body.includes('event: chunk') && !r.body.includes('event: error');
  chatOk.add(good);
  if (!good && __ITER < 2) console.log(`chat -> ${r.status} ${r.body.slice(0, 200).replace(/\n/g, ' ')}`);
  if (good) { ttft.add(r.timings.waiting); complete.add(r.timings.duration); } else chatFail.add(1);
  sleep(1 + Math.random() * 2);
}
