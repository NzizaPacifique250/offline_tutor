// Checks the portal signed in as staff, in Chrome at 1280 px.
//
// As a teacher: every page opens, the struggle views are there, and no admin
// control is shown. As an admin: create a throwaway teacher account, rename
// it, set a new password (checked against Supabase), confirm its role in the
// auth record, and delete it.
//
//   TEACHER_EMAIL=… TEACHER_PASSWORD=… ADMIN_EMAIL=… ADMIN_PASSWORD=… \
//     node check_staff.mjs http://localhost:3000 <output dir>
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:3000';
const out = process.argv[3] ?? 'staff';
mkdirSync(out, { recursive: true });
const SUPABASE = 'https://xthtcewmrjonzelhvmir.supabase.co';
const KEY = 'sb_publishable_eDY-FhmdHNW5BHrwEFYkVA_Y4ASIUOf';
const results = [];
const check = (step, ok, detail = '') => { results.push({ step, ok, detail }); console.log(`${ok ? 'pass' : 'FAIL'}  ${step}${detail ? `  (${detail})` : ''}`); };
const browser = await chromium.launch({ channel: 'chrome' });

async function signIn(email, password) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
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
const text = page => page.textContent('main');

if (process.env.TEACHER_EMAIL) {
  const { context, page, errors } = await signIn(process.env.TEACHER_EMAIL, process.env.TEACHER_PASSWORD);
  check('teacher signs in to the overview', new URL(page.url()).pathname === '/', page.url());
  let t = await text(page);
  check('overview shows students who need help', t.includes('Students who need help'));
  check('overview does not show the setup notice', !t.includes('not fully set up'));
  await page.screenshot({ path: `${out}/teacher-overview.png`, fullPage: true });
  await page.goto(base + '/users');
  t = await text(page);
  check('users table has wrong answers and needs help', t.includes('Wrong answers') && t.includes('Needs help'));
  check('teacher sees no account creation', !t.includes('Create an account'));
  check('teacher sees no role change', !t.includes('Change role'));
  await page.screenshot({ path: `${out}/teacher-users.png`, fullPage: true });
  await page.goto(base + '/users?role=needs-help');
  await page.screenshot({ path: `${out}/teacher-needs-help.png`, fullPage: true });
  const firstStudent = page.locator('table a[href^="/users/"]').first();
  if (await firstStudent.count()) {
    await firstStudent.click();
    await page.waitForURL(u => /\/users\/[0-9a-f-]{36}/.test(u.pathname));
    t = await text(page);
    check('a student page shows where they need help', /Where .+ needs help/.test(t));
    check('teacher sees no account management', !t.includes('Manage account'));
    await page.screenshot({ path: `${out}/teacher-student.png`, fullPage: true });
  } else {
    check('a student page shows where they need help', false, 'no student needs help, nothing to open');
  }
  for (const path of ['/devices', '/activity', '/tutor']) {
    const r = await page.goto(base + path);
    check(`teacher opens ${path}`, r?.status() === 200 && new URL(page.url()).pathname === path);
  }
  check('no page errors as teacher', errors.length === 0, errors.join(' | '));
  await context.close();
}

if (process.env.ADMIN_EMAIL) {
  const { context, page, errors } = await signIn(process.env.ADMIN_EMAIL, process.env.ADMIN_PASSWORD);
  check('admin signs in', new URL(page.url()).pathname === '/', page.url());
  const email = `crud.check.${Date.now()}@example.com`;
  const firstPassword = 'First-pass-123', secondPassword = 'Second-pass-456';
  await page.goto(base + '/users');
  await page.click('summary:has-text("Create an account")');
  await page.fill('#new-name', 'CRUD Check');
  await page.fill('#new-email', email);
  await page.fill('#new-password', firstPassword);
  await page.selectOption('#new-role', 'teacher');
  await Promise.all([page.waitForURL(u => u.search.includes('notice') || u.search.includes('error'), { timeout: 90000 }), page.click('button:has-text("Create account")')]);
  check('admin creates a teacher account', page.url().includes('notice=account-created'), new URL(page.url()).search);
  await page.screenshot({ path: `${out}/admin-created.png`, fullPage: true });
  const id = new URL(page.url()).searchParams.get('id');
  await page.goto(`${base}/users/${id}`);
  let t = await text(page);
  check('the new account is a teacher', t.includes('Teacher'));
  await page.fill('#rename', 'CRUD Check Renamed');
  await Promise.all([page.waitForURL(u => u.search.includes('notice') || u.search.includes('error')), page.click('button:has-text("Save name")')]);
  check('admin renames it', page.url().includes('notice=renamed') && (await text(page)).includes('CRUD Check Renamed'));
  await page.fill('#new-password', secondPassword);
  await Promise.all([page.waitForURL(u => u.search.includes('notice=password') || u.search.includes('error')), page.click('button:has-text("Set password")')]);
  check('admin sets a new password', page.url().includes('notice=password-set'));
  const signInWith = async pw => {
    const r = await fetch(`${SUPABASE}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: pw }) });
    return { status: r.status, body: await r.json() };
  };
  const withNew = await signInWith(secondPassword), withOld = await signInWith(firstPassword);
  check('the new password signs in; the old one does not', withNew.status === 200 && withOld.status === 400, `${withNew.status} / ${withOld.status}`);
  check('the auth record carries the role', withNew.body?.user?.app_metadata?.role === 'teacher', JSON.stringify(withNew.body?.user?.app_metadata ?? {}));
  await page.screenshot({ path: `${out}/admin-manage.png`, fullPage: true });
  await Promise.all([page.waitForURL(u => u.pathname === '/users' || u.search.includes('error'), { timeout: 90000 }), page.click('button:has-text("Delete account")')]);
  check('admin deletes it', page.url().includes('notice=account-deleted'), new URL(page.url()).search);
  check('the deleted account can no longer sign in', (await signInWith(secondPassword)).status === 400);
  check('no page errors as admin', errors.length === 0, errors.join(' | '));
  await context.close();
}
await browser.close();
writeFileSync(`${out}/results.json`, JSON.stringify(results, null, 2));
const failed = results.filter(r => !r.ok).length;
console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
process.exit(failed ? 1 : 0);
