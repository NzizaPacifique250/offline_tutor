// Times how long the admin portal's server takes to answer each page, signed
// in, through the portal's own sign-in form: a few rounds back to back, then
// single requests after 15 s idle (longer than Node's default 4 s keep-alive).
//
//   EMAIL=… PASSWORD=… node measure.mjs http://localhost:3000 result.json
//
// A staff account renders every page. A student account is sent to
// /no-access by each page, after the same proxy, session and profile checks.
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:3000';
const out = process.argv[3] ?? 'result.json';
const routes = ['/', '/users', '/devices', '/activity', '/tutor'];
const browser = await chromium.launch({ channel: 'chrome' });
const context = await browser.newContext();
const page = await context.newPage();

await page.goto(base + '/login');
await page.fill('#email', process.env.EMAIL);
await page.fill('#password', process.env.PASSWORD);
const t0 = performance.now();
await Promise.all([page.waitForURL(u => !u.pathname.startsWith('/login') || u.search.includes('error'), { timeout: 90000 }), page.click('button[type=submit]')]);
const signIn = { ms: Math.round(performance.now() - t0), landed: new URL(page.url()).pathname + new URL(page.url()).search };

async function time(path) {
  const t = performance.now();
  const r = await context.request.get(base + path, { maxRedirects: 0, timeout: 90000 });
  await r.body();
  return { path, status: r.status(), ms: Math.round(performance.now() - t), to: r.headers().location ?? null };
}
const rounds = [];
for (let i = 0; i < 3; i++) for (const p of routes) rounds.push(await time(p));
const idle = [];
for (let i = 0; i < 3; i++) {
  await new Promise(r => setTimeout(r, 15000));
  idle.push(await time('/'));
}
await browser.close();

const median = a => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
const summary = {
  signIn,
  backToBack: { median: median(rounds.map(r => r.ms)), slowest: Math.max(...rounds.map(r => r.ms)) },
  afterIdle: idle.map(r => r.ms),
  statuses: [...new Set(rounds.map(r => `${r.status} ${r.to ?? ''}`.trim()))],
};
writeFileSync(out, JSON.stringify({ summary, rounds, idle }, null, 2));
console.log(JSON.stringify(summary));
