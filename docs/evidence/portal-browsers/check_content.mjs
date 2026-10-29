// Checks the portal's Content page (lesson releases, migration 0006) in
// Chrome, signed in as an admin.
//
// Always: the menu has Content, the page opens, and at phone width the tab
// bar's seven links fit with no horizontal scroll. As a teacher, Content
// sends them back to the overview.
//
// With RELEASE_FILE (a file from tools/export_package.py whose version has not
// been published): publish it for the tablet DEVICE_ID, or for every tablet;
// the release is listed with the database's checksum; the downloaded file is
// byte for byte the one uploaded; the same file again is refused as not
// newer; a file that is not a package is refused; withdrawing and offering it
// again work. With KEEP=1 the release stays offered at the end, for a tablet
// to install; otherwise it is left withdrawn.
//
//   ADMIN_EMAIL=… ADMIN_PASSWORD=… [TEACHER_EMAIL=… TEACHER_PASSWORD=…] \
//   [RELEASE_FILE=dist/content/rw-s6-am.u1-0.2.1.json DEVICE_ID=… KEEP=1] \
//     node check_content.mjs http://localhost:3000 <output dir>
import { chromium } from 'playwright';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';

const base = process.argv[2] ?? 'http://localhost:3000';
const out = process.argv[3] ?? 'content';
mkdirSync(out, { recursive: true });
const results = [];
const check = (step, ok, detail = '') => {
  results.push({ step, ok, detail, at: new Date().toISOString() });
  console.log(`${ok ? 'pass' : 'FAIL'}  ${step}${detail ? `  (${detail})` : ''}`);
};
const browser = await chromium.launch({ channel: 'chrome' });

async function signIn(email, password, viewport = { width: 1280, height: 800 }) {
  const context = await browser.newContext({ viewport, acceptDownloads: true });
  const page = await context.newPage();
  page.on('dialog', d => d.accept());
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(base + '/login');
  await page.fill('#email', email);
  await page.fill('#password', password);
  await Promise.all([page.waitForURL(u => !u.pathname.startsWith('/login') || u.search.includes('error'), { timeout: 90000 }), page.click('button[type=submit]')]);
  return { context, page, errors };
}
// Pages stream after a loading placeholder: wait for what a check expects.
const shows = (page, wanted) =>
  page.waitForFunction(w => document.querySelector('main')?.innerText.includes(w), wanted, { timeout: 30000 }).then(() => true, () => false);
const sha256 = text => createHash('sha256').update(text, 'utf8').digest('hex');
// Each submission starts from a clean /content, so a code the last step left
// in the address bar cannot end the wait before the form is sent.
async function publish(page, setFile, fill = async () => {}) {
  await page.goto(base + '/content');
  await shows(page, 'Publish a release');
  await setFile();
  await fill();
  await Promise.all([
    page.waitForURL(u => u.search.includes('notice=') || u.search.includes('error='), { timeout: 90000 }),
    page.click('form:has(#release-file) button[type=submit]'),
  ]);
  return new URL(page.url()).search;
}

const admin = await signIn(process.env.ADMIN_EMAIL, process.env.ADMIN_PASSWORD);
{
  const { page } = admin;
  check('admin signs in', new URL(page.url()).pathname === '/', page.url());
  check('the menu has Content', (await page.locator('nav[aria-label=Main] a[href="/content"]').count()) > 0);
  await page.goto(base + '/content');
  check('the Content page opens with the publish form', await shows(page, 'Publish a release'));
  const setupMissing = (await page.innerText('main')).includes('not fully set up');
  check('the database has the releases table (0006)', !setupMissing, setupMissing ? 'run supabase/migrations/0006_lesson_updates.sql' : '');
  await page.screenshot({ path: `${out}/admin-content.png`, fullPage: true });

  const file = process.env.RELEASE_FILE;
  if (file && !setupMissing) {
    const text = readFileSync(file, 'utf8');
    const { version, id: packageId } = JSON.parse(text).manifest;
    const device = process.env.DEVICE_ID;

    // Publish.
    const published = await publish(
      page,
      () => page.setInputFiles('#release-file', file),
      async () => {
        await page.fill('#release-notes', `Portal check ${new Date().toISOString()}: ${packageId} ${version}.`);
        if (device) {
          await page.locator('form:has(#release-file) input[name=audience][value=chosen]').check();
          await page.locator(`form:has(#release-file) input[name=devices][value="${device}"]`).check();
        }
      },
    );
    check('publishing the release file', published.includes('notice=published'), published);
    const card = page.locator('section', { has: page.locator(`h3:text-is("${JSON.parse(text).manifest.unit_title} (Unit ${JSON.parse(text).manifest.unit}), version ${version}")`) });
    await shows(page, `version ${version}`);
    check('the release is listed as offered', (await card.count()) === 1 && (await card.innerText()).includes('Offered'));
    check(
      'the listed checksum is the file\'s SHA-256',
      (await card.locator('[title^="SHA-256"]').getAttribute('title')) === `SHA-256 ${sha256(text)}`,
      sha256(text).slice(0, 12),
    );
    check('it is for the chosen tablet, or every tablet', (await card.innerText()).includes(device ? '1 tablet' : 'Every tablet'));
    await page.screenshot({ path: `${out}/admin-content-published.png`, fullPage: true });

    // Download: the same bytes.
    const [download] = await Promise.all([page.waitForEvent('download'), card.locator('a:has-text("Download file")').click()]);
    const saved = `${out}/${download.suggestedFilename()}`;
    await download.saveAs(saved);
    check('the download is the file that was published', readFileSync(saved, 'utf8') === text, download.suggestedFilename());

    // The same version again, and a file that is not a package, are refused.
    const again = await publish(page, () => page.setInputFiles('#release-file', file));
    check('the same version again is refused as not newer', again.includes('error=not-newer') && (await shows(page, 'not newer')), again);
    const notPackage = await publish(page, () =>
      page.setInputFiles('#release-file', { name: 'notes.json', mimeType: 'application/json', buffer: Buffer.from('{"format":"progress"}') }),
    );
    check('a file that is not a package is refused', notPackage.includes('error=not-package') && (await shows(page, 'not a release file')), notPackage);

    // Withdraw, then offer again.
    await Promise.all([page.waitForURL(u => u.search.includes('notice=withdrawn') || u.search.includes('error='), { timeout: 90000 }), card.locator('button:has-text("Withdraw")').click()]);
    await shows(page, 'Withdrawn');
    check('withdrawing it', page.url().includes('notice=withdrawn') && (await card.innerText()).includes('Withdrawn'));
    await page.screenshot({ path: `${out}/admin-content-withdrawn.png`, fullPage: true });
    if (process.env.KEEP === '1') {
      await Promise.all([page.waitForURL(u => u.search.includes('notice=restored') || u.search.includes('error='), { timeout: 90000 }), card.locator('button:has-text("Offer again")').click()]);
      await shows(page, 'Offered');
      check('offering it again', page.url().includes('notice=restored') && (await card.innerText()).includes('Offered'));
    }
  }
  check('no script errors as an admin', admin.errors.length === 0, admin.errors.join(' | '));
  await admin.context.close();
}

// Phone width: the admin's seven tabs fit.
{
  const { context, page } = await signIn(process.env.ADMIN_EMAIL, process.env.ADMIN_PASSWORD, { width: 360, height: 780 });
  await page.goto(base + '/content');
  await shows(page, 'Publish a release');
  const tabs = page.locator('nav[aria-label=Main]:visible a');
  const widths = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
  check('at 360 px the tab bar shows seven links', (await tabs.count()) === 7, String(await tabs.count()));
  check('at 360 px nothing scrolls sideways', widths[0] <= widths[1], `${widths[0]} of ${widths[1]} px`);
  await page.screenshot({ path: `${out}/admin-content-360.png`, fullPage: true });
  await context.close();
}

if (process.env.TEACHER_EMAIL) {
  const { context, page } = await signIn(process.env.TEACHER_EMAIL, process.env.TEACHER_PASSWORD);
  check('teacher: the menu has no Content', (await page.locator('nav[aria-label=Main] a[href="/content"]').count()) === 0);
  await page.goto(base + '/content');
  await page.waitForURL(u => u.pathname === '/', { timeout: 30000 }).catch(() => null);
  check('teacher: Content sends them to the overview', new URL(page.url()).pathname === '/', page.url());
  const response = await page.request.get(base + '/content/00000000-0000-0000-0000-000000000000/file', { maxRedirects: 0 });
  check('teacher: a release download is refused', response.status() >= 300 && response.status() < 400, String(response.status()));
  await context.close();
}

await browser.close();
writeFileSync(`${out}/results.json`, JSON.stringify(results, null, 2));
const failed = results.filter(r => !r.ok).length;
console.log(`${results.length - failed} of ${results.length} checks passed (${basename(out)})`);
process.exit(failed ? 1 : 0);
