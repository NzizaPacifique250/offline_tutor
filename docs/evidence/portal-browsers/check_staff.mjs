// Checks the portal signed in as staff, in Chrome at 1280 px.
//
// As a teacher: every page opens, the struggle views are there, and no admin
// control is shown. As an admin: create a throwaway teacher account, rename
// it, set a new password (checked against Supabase), confirm its role in the
// auth record, and delete it.
//
// With both accounts: the admin makes a class taught by the teacher with one
// throwaway student, and the teacher must see that student and no one else.
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
// Portal pages stream their content after a loading placeholder, so wait for
// what a check expects rather than reading the page at once.
const shows = (page, wanted) =>
  page.waitForFunction(w => document.querySelector('main')?.innerText.includes(w), wanted, { timeout: 30000 }).then(() => true, () => false);
const text = page => page.innerText('main');

if (process.env.TEACHER_EMAIL) {
  const { context, page, errors } = await signIn(process.env.TEACHER_EMAIL, process.env.TEACHER_PASSWORD);
  check('teacher signs in to the overview', new URL(page.url()).pathname === '/', page.url());
  check('overview shows where students struggle', await shows(page, 'Where students struggle'));
  let t = await text(page);
  check('overview does not show the setup notice', !t.includes('not fully set up'));
  await page.screenshot({ path: `${out}/teacher-overview.png`, fullPage: true });
  await page.goto(base + '/users');
  check('users table has wrong answers and struggles', (await shows(page, 'Wrong answers')) && (await shows(page, 'Struggles')));
  t = await text(page);
  check('teacher sees no account creation', !t.includes('Create an account'));
  check('teacher sees no role change', !t.includes('Change role'));
  await page.screenshot({ path: `${out}/teacher-users.png`, fullPage: true });
  await page.goto(base + '/users?role=struggling');
  await shows(page, 'Struggling');
  await page.screenshot({ path: `${out}/teacher-struggling.png`, fullPage: true });
  // A student who struggles, or else the first account in the list.
  await page.goto(base + '/users?role=struggling');
  await shows(page, 'Struggling');
  let firstStudent = page.locator('table a[href^="/users/"]').first();
  if (!(await firstStudent.count())) {
    await page.goto(base + '/users?role=student');
    await shows(page, 'Learner');
    firstStudent = page.locator('table a[href^="/users/"]').first();
  }
  if (await firstStudent.count()) {
    await firstStudent.click();
    await page.waitForURL(u => /\/users\/[0-9a-f-]{36}/.test(u.pathname));
    check('a student page shows where they struggle', await shows(page, 'struggles'));
    t = await text(page);
    check('teacher sees no account management', !t.includes('Manage account'));
    await page.screenshot({ path: `${out}/teacher-student.png`, fullPage: true });
  } else {
    check('a student page shows where they struggle', false, 'no student account to open');
  }
  // Tablets are for admins: a teacher lands on the overview instead. The
  // page streams, so the redirect finishes in the browser after the 200.
  await page.goto(base + '/devices');
  check('teacher is sent away from Tablets', await page.waitForURL(u => u.pathname === '/', { timeout: 30000 }).then(() => true, () => false), page.url());
  for (const [path, title] of [['/activity', 'Activity'], ['/tutor', 'Tutor']]) {
    await page.goto(base + path);
    check(`teacher opens ${path}`, (await shows(page, title)) && new URL(page.url()).pathname === path, page.url());
  }
  check('no page errors as teacher', errors.length === 0, errors.join(' | '));
  await context.close();
}

if (process.env.ADMIN_EMAIL) {
  const { context, page, errors } = await signIn(process.env.ADMIN_EMAIL, process.env.ADMIN_PASSWORD);
  check('admin signs in', new URL(page.url()).pathname === '/', page.url());
  await page.goto(base + '/users');
  check('users list separates students from teachers and admins', (await shows(page, 'Teachers and admins')) && (await shows(page, 'Students')));
  const email = `crud.check.${Date.now()}@example.com`;
  const firstPassword = 'First-pass-123', secondPassword = 'Second-pass-456';
  await page.goto(base + '/users');
  if (!(await shows(page, 'Create an account'))) {
    check('admin sees account creation', false, 'not shown: is this account an admin?');
    await context.close();
    await browser.close();
    process.exit(1);
  }
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
  check('the new account is a teacher', await shows(page, 'Teacher'));
  check('a teacher\'s page shows classes taught, not lesson progress', (await shows(page, 'Classes taught')) && !(await text(page)).includes('Progress by lesson'));
  await page.fill('#rename', 'CRUD Check Renamed');
  await Promise.all([page.waitForURL(u => u.search.includes('notice') || u.search.includes('error')), page.click('button:has-text("Save name")')]);
  check('admin renames it', page.url().includes('notice=renamed') && (await shows(page, 'CRUD Check Renamed')));
  await page.fill('#new-password', secondPassword);
  await Promise.all([page.waitForURL(u => u.search.includes('notice=password') || u.search.includes('error')), page.click('button:has-text("Set password")')]);
  check('admin sets a new password', page.url().includes('notice=password-set'));
  // This laptop's DNS sometimes stalls past Node's 10 s connect limit; retry.
  const signInWith = async pw => {
    for (let attempt = 1; ; attempt++) {
      try {
        const r = await fetch(`${SUPABASE}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: pw }) });
        return { status: r.status, body: await r.json() };
      } catch (e) {
        if (attempt === 4) throw e;
      }
    }
  };
  const withNew = await signInWith(secondPassword), withOld = await signInWith(firstPassword);
  check('the new password signs in; the old one does not', withNew.status === 200 && withOld.status === 400, `${withNew.status} / ${withOld.status}`);
  check('the auth record carries the role', withNew.body?.user?.app_metadata?.role === 'teacher', JSON.stringify(withNew.body?.user?.app_metadata ?? {}));
  await page.screenshot({ path: `${out}/admin-manage.png`, fullPage: true });
  await Promise.all([page.waitForURL(u => u.pathname === '/users' || u.search.includes('error'), { timeout: 90000 }), page.click('button:has-text("Delete account")')]);
  check('admin deletes it', page.url().includes('notice=account-deleted'), new URL(page.url()).search);
  check('the deleted account can no longer sign in', (await signInWith(secondPassword)).status === 400);

  if (process.env.TEACHER_EMAIL) {
    // A class taught by the teacher, with one new student.
    const stamp = Date.now();
    const studentName = `Class Check Student ${stamp}`, className = `Check class ${stamp}`;
    await page.goto(base + '/users');
    await shows(page, 'Create an account');
    await page.click('summary:has-text("Create an account")');
    await page.fill('#new-name', studentName);
    await page.fill('#new-email', `class.check.${stamp}@example.com`);
    await page.fill('#new-password', 'Class-check-123');
    await page.selectOption('#new-role', 'student');
    await Promise.all([page.waitForURL(u => u.search.includes('notice') || u.search.includes('error'), { timeout: 90000 }), page.click('button:has-text("Create account")')]);
    const studentId = new URL(page.url()).searchParams.get('id');
    check('admin creates a student for the class', page.url().includes('notice=account-created'));
    await page.goto(base + '/classes');
    await shows(page, 'Create a class');
    await page.fill('#class-name', className);
    await page.selectOption('#class-teacher', { label: 'Demo Teacher' });
    await Promise.all([page.waitForURL(u => u.search.includes('notice') || u.search.includes('error'), { timeout: 90000 }), page.click('button:has-text("Create class")')]);
    check('admin creates a class taught by the teacher', page.url().includes('notice=created'), new URL(page.url()).search);
    const card = page.locator('section', { has: page.locator(`h2:text-is("${className}")`) });
    await card.locator('select[name="student_id"]').selectOption(studentId);
    await Promise.all([page.waitForURL(u => u.search.includes('notice=added') || u.search.includes('error'), { timeout: 90000 }), card.locator('button:has-text("Add")').click()]);
    check('admin adds the student to the class', page.url().includes('notice=added') && (await shows(page, studentName)));
    await page.screenshot({ path: `${out}/admin-classes.png`, fullPage: true });

    const teacher = await signIn(process.env.TEACHER_EMAIL, process.env.TEACHER_PASSWORD);
    await teacher.page.goto(base + '/users');
    await shows(teacher.page, 'Your students');
    const visible = await teacher.page.locator('table a[href^="/users/"]').allInnerTexts();
    check('the teacher sees the class\'s student', visible.includes(studentName), visible.join(', '));
    check('the teacher sees no account outside their classes', !visible.includes('Demo Admin') && !visible.includes('Demo Teacher'), visible.join(', '));
    await teacher.page.screenshot({ path: `${out}/teacher-users-class.png`, fullPage: true });
    await teacher.page.goto(base + '/classes');
    check('the teacher sees the class', await shows(teacher.page, className));
    check('the teacher cannot manage classes', !(await teacher.page.innerText('main')).includes('Create a class'));
    await teacher.page.screenshot({ path: `${out}/teacher-classes.png`, fullPage: true });
    await teacher.page.goto(base + '/devices');
    check('the teacher is sent away from the Tablets page', await teacher.page.waitForURL(u => u.pathname === '/', { timeout: 30000 }).then(() => true, () => false), teacher.page.url());
    await teacher.context.close();

    // Clean up: the class, then the student.
    await page.goto(base + '/classes');
    await shows(page, className);
    await card.locator('summary').click();
    await Promise.all([page.waitForURL(u => u.search.includes('notice=deleted') || u.search.includes('error'), { timeout: 90000 }), card.locator('button:has-text("Delete class")').click()]);
    check('admin deletes the class', page.url().includes('notice=deleted'));
    await page.goto(`${base}/users/${studentId}`);
    await shows(page, 'Delete account');
    await Promise.all([page.waitForURL(u => u.pathname === '/users' || u.search.includes('error'), { timeout: 90000 }), page.click('button:has-text("Delete account")')]);
    check('admin deletes the class\'s student', page.url().includes('notice=account-deleted'));
  }
  check('no page errors as admin', errors.length === 0, errors.join(' | '));
  await context.close();
}
await browser.close();
writeFileSync(`${out}/results.json`, JSON.stringify(results, null, 2));
const failed = results.filter(r => !r.ok).length;
console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
process.exit(failed ? 1 : 0);
