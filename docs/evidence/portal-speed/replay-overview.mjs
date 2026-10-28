// Replays the Supabase requests the portal's overview page makes, the old way
// and the new way, and times them. It runs with the publishable key only, so
// row-level security returns no rows, but each request still makes the same
// trip to Supabase, which is what decides the time.
//
//   cd admin && node ../docs/evidence/portal-speed/replay-overview.mjs [old|new|both]
//
// old: Node's default connections (closed after 4 s idle, a DNS lookup for
//      each new one); getUser, then the profile, then the nine queries.
// new: connections kept for 60 s and the address remembered, as
//      lib/connections.ts sets up; the profile and the nine queries together.
import dns from 'node:dns';
import { createRequire } from 'node:module';
const require = createRequire(process.cwd() + '/');
const { Agent, setGlobalDispatcher, getGlobalDispatcher } = require('undici');

const U = 'https://xthtcewmrjonzelhvmir.supabase.co';
const H = { apikey: 'sb_publishable_eDY-FhmdHNW5BHrwEFYkVA_Y4ASIUOf', Authorization: 'Bearer sb_publishable_eDY-FhmdHNW5BHrwEFYkVA_Y4ASIUOf' };
const since = new Date(Date.now() - 7 * 864e5).toISOString();
const get = (path, extra = {}) => fetch(U + path, { headers: { ...H, ...extra } }).then(r => r.text());
const head = { Prefer: 'count=exact', Range: '0-0' };
const queries = () => [
  get('/rest/v1/profiles?select=role,requested_role'),
  get('/rest/v1/devices?select=*&order=last_sync_at.desc'),
  get('/rest/v1/attempts?select=device_id', head),
  get('/rest/v1/attempts?select=device_id&verdict=eq.correct', head),
  get(`/rest/v1/attempts?select=device_id&created_at=gte.${since}`, head),
  get(`/rest/v1/guidance_events?select=device_id&created_at=gte.${since}`, head),
  get(`/rest/v1/sessions?select=device_id&started_at=gte.${since}`, head),
  get(`/rest/v1/attempts?select=created_at&created_at=gte.${since}&order=created_at&offset=0&limit=1000`),
  get('/rest/v1/guidance_events?select=outcome&order=created_at&offset=0&limit=1000'),
];
const profile = () => get('/rest/v1/profiles?select=id,role&id=eq.00000000-0000-0000-0000-000000000000');

async function oldWay() { await get('/auth/v1/user'); await profile(); await Promise.all(queries()); }
async function newWay() { await Promise.all([profile(), ...queries()]); }

const known = new Map();
function cachedLookup(host, opts, cb) {
  const reply = a => (opts.all ? cb(null, a) : cb(null, a[0].address, a[0].family));
  if (known.has(host)) return reply(known.get(host));
  dns.lookup(host, { all: true }, (e, a) => (e ? cb(e, '') : (known.set(host, a), reply(a))));
}
const wait = ms => new Promise(r => setTimeout(r, ms));
async function measure(label, run) {
  // A request that fails (the 10 s connect timeout) is recorded as 'failed after N ms'.
  const t = async () => {
    const s = performance.now();
    try { await run(); return Math.round(performance.now() - s); } catch (e) { return `failed after ${Math.round(performance.now() - s)} ms (${e.cause?.code ?? e.message})`; }
  };
  const say = (what, v) => console.log(`${label} ${what}: ${typeof v === 'number' ? v + ' ms' : v}`);
  const first = await t(); say('first', first);
  const warm = []; for (let i = 0; i < 5; i++) { warm.push(await t()); say('back to back', warm.at(-1)); }
  const idle = []; for (let i = 0; i < 3; i++) { await wait(15000); idle.push(await t()); say('after 15 s idle', idle.at(-1)); }
  const med = [...warm].filter(x => typeof x === 'number').sort((a, b) => a - b)[2] ?? null;
  console.log(JSON.stringify({ label, first, warmMedian: med, warm, afterIdle: idle }));
}

// node replay-overview.mjs old | new | both (default). Run each in its own
// process to give both the same start: no connection, no address known.
const mode = process.argv[2] ?? 'both';
if (mode !== 'new') {
  getGlobalDispatcher(); // undici's default agent: 4 s keep-alive, a DNS lookup per connection
  await measure('old', oldWay);
}
if (mode !== 'old') {
  setGlobalDispatcher(new Agent({ keepAliveTimeout: 60_000, keepAliveMaxTimeout: 600_000, connect: { lookup: cachedLookup } }));
  await measure('new', newWay);
}
