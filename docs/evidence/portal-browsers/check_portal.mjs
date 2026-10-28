// Opens the admin portal in Chrome, Firefox and WebKit at a desktop and a
// phone width, and records what each one shows.
//
// Signed out: every page must redirect to /login, the form must be usable,
// and nothing may overflow the width. With ADMIN_EMAIL and ADMIN_PASSWORD
// set, it also signs in and opens every staff page.
//
//   cd admin && npm run build && npm run start          # in one terminal
//   npm i playwright@1.56.1 && npx playwright install firefox webkit
//   node check_portal.mjs http://localhost:3000 <output dir>
import { chromium, firefox, webkit } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:3000';
const out = process.argv[3] ?? 'out';
mkdirSync(out, { recursive: true });
const browsers = [
  ['chrome', () => chromium.launch({ channel: 'chrome' })],
  ['firefox', () => firefox.launch()],
  ['webkit', () => webkit.launch()],
];
const viewports = { desktop: { width: 1280, height: 800 }, phone: { width: 390, height: 844 } };
const staffPages = ['/', '/users', '/devices', '/activity', '/tutor'];
const results = [];

async function look(page) {
  return page.evaluate(() => ({
    title: document.querySelector('h1')?.textContent?.trim() ?? null,
    overflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
    problem: document.querySelector('[role="alert"], .text-red-700, .bg-red-50')?.textContent?.trim() ?? null,
  }));
}

for (const [name, launch] of browsers) {
  let browser;
  try {
    browser = await launch();
  } catch (e) {
    results.push({ browser: name, error: `could not start: ${e.message.split('\n')[0]}` });
    continue;
  }
  const version = browser.version();
  for (const [vp, size] of Object.entries(viewports)) {
    const context = await browser.newContext({ viewport: size });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => m.type() === 'error' && errors.push(m.text()));
    const row = { browser: name, version, viewport: vp, checks: [] };
    for (const path of ['/', '/users', '/tutor']) {
      const t0 = Date.now();
      await page.goto(base + path);
      row.checks.push({ step: `signed out ${path}`, url: new URL(page.url()).pathname, ms: Date.now() - t0 });
    }
    const form = await page.evaluate(() => ['#email', '#password', 'button[type=submit]'].every(s => {
      const el = document.querySelector(s);
      const r = el?.getBoundingClientRect();
      return !!r && r.width > 0 && r.right <= window.innerWidth;
    }));
    row.checks.push({ step: 'sign-in form visible and inside the width', ok: form, ...(await look(page)) });
    await page.screenshot({ path: `${out}/${name}-${vp}-login.png` });
    await page.click('button[type=submit]');
    row.checks.push({ step: 'empty form is not sent', url: new URL(page.url()).pathname });
    if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
      await page.fill('#email', process.env.ADMIN_EMAIL);
      await page.fill('#password', process.env.ADMIN_PASSWORD);
      const t0 = Date.now();
      await Promise.all([page.waitForURL(u => !u.pathname.startsWith('/login') || u.search.includes('error'), { timeout: 60000 }), page.click('button[type=submit]')]);
      row.checks.push({ step: 'sign in', url: new URL(page.url()).pathname, ms: Date.now() - t0, ...(await look(page)) });
      for (const path of staffPages) {
        const t1 = Date.now();
        const resp = await page.goto(base + path, { timeout: 60000 });
        row.checks.push({ step: `signed in ${path}`, status: resp?.status(), url: new URL(page.url()).pathname, ms: Date.now() - t1, ...(await look(page)) });
        await page.screenshot({ path: `${out}/${name}-${vp}-${path === '/' ? 'overview' : path.slice(1)}.png`, fullPage: true });
      }
    }
    row.errors = errors;
    results.push(row);
    await context.close();
  }
  await browser.close();
}
writeFileSync(`${out}/results.json`, JSON.stringify(results, null, 2));
for (const r of results) {
  if (r.error) {
    console.log(`${r.browser}: ${r.error}`);
    continue;
  }
  console.log(`${r.browser} ${r.version} ${r.viewport}: ${r.errors.length} console errors`);
  for (const c of r.checks) {
    console.log('   ', JSON.stringify(c));
  }
}
