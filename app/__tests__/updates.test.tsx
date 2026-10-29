/**
 * Lesson updates: choosing the releases a tablet should install, checking a
 * package file, installing it on real SQLite (sql.js) without touching the
 * learners' records, the bundled importer keeping a newer installed version,
 * downloads that fail, and the pop-up.
 */

import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { importPackages } from '../src/content/importer';
import { PACKAGES } from '../src/content/packages';
import { getContentVersions, listLessons } from '../src/content/service';
import type { ContentPackage } from '../src/content/types';
import { compareVersions, isNewer } from '../src/content/version';
import { openSession } from '../src/learner/session';
import { ensureLearnerSchema, listAttempts, recordAttempt } from '../src/learner/store';
import { UpdatePrompt } from '../src/screens/UpdatePrompt';
import { installPackage, listInstalledUpdates } from '../src/updates/install';
import { readDownloaded, readPackageFile, sha256Hex } from '../src/updates/packageFile';
import { describeRelease, pendingUpdates, type Release } from '../src/updates/releases';
import { installFromFile, installReleases, type UpdateRemote } from '../src/updates/updater';

const { makeSqlDb } = require('../jest/sqljs-db');

const [u1, u4] = PACKAGES;
const fileFor = (pkg: ContentPackage) => JSON.stringify({ format: 'offline-tutor-package', format_version: 1, ...pkg });

/** Unit 1 at 0.3.0 with one more lesson and exercise, as an admin would publish it. */
function u1v030(): ContentPackage {
  const lesson = { ...u1.lessons[0], id: 'rw-s6-am.u1.l08', title: 'Powers of i', exercises: ['rw-s6-am.u1.q.020'] };
  const exercise = { ...u1.exercises[0], id: 'rw-s6-am.u1.q.020', lesson: 'rw-s6-am.u1.l08' };
  return {
    ...u1,
    manifest: { ...u1.manifest, version: '0.3.0' },
    lessons: [...u1.lessons, lesson],
    exercises: [...u1.exercises, exercise],
  };
}

function release(pkg: ContentPackage, over: Partial<Release> = {}): Release {
  const text = fileFor(pkg);
  return {
    id: `rel-${pkg.manifest.id}-${pkg.manifest.version}`,
    packageId: pkg.manifest.id,
    version: pkg.manifest.version,
    unit: pkg.manifest.unit,
    unitTitle: pkg.manifest.unit_title,
    lessons: pkg.lessons.length,
    exercises: pkg.exercises.length,
    notes: '',
    sha256: sha256Hex(text),
    devices: [],
    publishedAt: '2026-10-29T10:00:00Z',
    ...over,
  };
}

async function freshDb() {
  const db = await makeSqlDb();
  await ensureLearnerSchema(db);
  await importPackages(db, PACKAGES);
  return db;
}

describe('versions', () => {
  it('compares major.minor.patch as numbers', () => {
    expect(compareVersions('0.10.0', '0.9.0')).toBe(1);
    expect(compareVersions('1.0.0', '0.99.99')).toBe(1);
    expect(compareVersions('0.2.0', '0.2.0')).toBe(0);
    expect(compareVersions('0.2.0', '0.2.1')).toBe(-1);
    expect(isNewer('0.1.0', null)).toBe(true);
    expect(isNewer('0.1.0', '0.1.0')).toBe(false);
  });
});

describe('pendingUpdates', () => {
  const installed = [
    { packageId: 'rw-s6-am.u1', version: '0.2.0' },
    { packageId: 'rw-s6-am.u4', version: '0.1.0' },
  ];
  const r = (packageId: string, version: string, devices: string[] = [], unit = 1) =>
    ({ ...release(u1), id: `${packageId}@${version}@${devices.join('+')}`, packageId, version, unit, devices }) as Release;

  it('offers the newest newer release per unit, meant for this tablet, by unit', () => {
    const got = pendingUpdates(
      [
        r('rw-s6-am.u4', '0.2.0', [], 4),
        r('rw-s6-am.u1', '0.2.0'), // same as installed
        r('rw-s6-am.u1', '0.1.5'), // older
        r('rw-s6-am.u1', '0.3.0'),
        r('rw-s6-am.u1', '0.4.0', ['another-tablet']), // for another tablet
        r('rw-s6-am.u1', '0.3.5', ['this-tablet', 'another-tablet']),
        r('rw-s6-am.u6', '0.1.0', [], 6), // a unit this tablet does not have
      ],
      installed,
      'this-tablet',
    );
    expect(got.map(x => `${x.packageId} ${x.version}`)).toEqual(['rw-s6-am.u1 0.3.5', 'rw-s6-am.u4 0.2.0', 'rw-s6-am.u6 0.1.0']);
  });

  it('describes a release for the pop-up', () => {
    expect(describeRelease(release(u1v030()), '0.2.0')).toBe('Complex Numbers (Unit 1): 0.2.0 → 0.3.0 · 2 lessons, 6 exercises');
    expect(describeRelease(release(u1v030()))).toMatch(/new unit, 0\.3\.0/);
  });
});

describe('readPackageFile', () => {
  it('accepts every bundled unit as a release file', () => {
    for (const pkg of PACKAGES) {
      const read = readPackageFile(fileFor(pkg));
      expect(read.ok ? read.pkg.manifest.id : read.problem).toBe(pkg.manifest.id);
    }
  });

  it.each([
    ['not JSON', () => '{"format":', /not JSON/],
    ['another format', () => JSON.stringify({ ...JSON.parse(fileFor(u1)), format: 'progress' }), /not a lesson package/],
    ['a unit that does not match its id', () => fileFor({ ...u1, manifest: { ...u1.manifest, unit: 4 } }), /unit does not match/],
    ['a version that is not major.minor.patch', () => fileFor({ ...u1, manifest: { ...u1.manifest, version: '0.3' } }), /major\.minor\.patch/],
    ['an exercise of another unit', () => fileFor({ ...u1, exercises: [{ ...u1.exercises[0], id: 'rw-s6-am.u4.q.001' }] }), /bad id/],
    ['an exercise whose lesson is missing', () => fileFor({ ...u1, exercises: [{ ...u1.exercises[0], lesson: 'rw-s6-am.u1.l99' }, ...u1.exercises.slice(1)] }), /lesson is not in this package/],
    ['a lesson listing an exercise that is not there', () => fileFor({ ...u1, lessons: [{ ...u1.lessons[0], exercises: [...u1.lessons[0].exercises, 'rw-s6-am.u1.q.099'] }] }), /not one of its exercises/],
    ['an exercise with one hint', () => fileFor({ ...u1, exercises: [{ ...u1.exercises[0], hints: ['only one'] }, ...u1.exercises.slice(1)] }), /at least two/],
    ['an answer without a key', () => fileFor({ ...u1, exercises: [{ ...u1.exercises[0], answer: { ...u1.exercises[0].answer, expected: '' } }, ...u1.exercises.slice(1)] }), /answer needs/],
    ['a duplicate exercise', () => fileFor({ ...u1, exercises: [...u1.exercises, u1.exercises[0]] }), /duplicate id/],
  ])('refuses %s', (_name, make, problem) => {
    const read = readPackageFile(make());
    expect(read.ok).toBe(false);
    expect(read.ok ? '' : read.problem).toMatch(problem);
  });

  it('checks a download against the published checksum and the release announced', () => {
    const text = fileFor(u1v030());
    const rel = release(u1v030());
    expect(readDownloaded(text, rel).ok).toBe(true);
    const changed = readDownloaded(text.replace('Powers of i', 'Powers of j'), rel);
    expect(changed.ok ? '' : changed.problem).toMatch(/checksum does not match/);
    const other = readDownloaded(text, { ...rel, version: '0.4.0' });
    expect(other.ok ? '' : other.problem).toMatch(/not the release announced/);
  });
});

describe('installing an update on the tablet', () => {
  it('installs a newer unit with its new lesson, keeps the learners\' records, and records the install', async () => {
    const db = await freshDb();
    const versions = await getContentVersions(db);
    const s = await openSession(db, 'A1', versions);
    await recordAttempt(db, { learnerCode: 'A1', sessionId: s.sessionId, lessonId: u1.lessons[0].id, exerciseId: u1.exercises[0].id, answer: '5+3i', verdict: 'correct', hintsSeen: 0 });

    const out = await installPackage(db, u1v030(), { source: 'online', sha256: 'abc', releaseId: 'rel-1' });
    expect(out).toEqual({ result: 'installed', packageId: 'rw-s6-am.u1', version: '0.3.0', replaced: '0.2.0' });
    expect((await listLessons(db)).map(l => l.id)).toContain('rw-s6-am.u1.l08');
    expect((await getContentVersions(db)).find(v => v.packageId === 'rw-s6-am.u1')?.version).toBe('0.3.0');
    expect((await listAttempts(db, 'A1')).map(a => a.answer)).toEqual(['5+3i']);
    expect(await listInstalledUpdates(db)).toEqual([expect.objectContaining({ packageId: 'rw-s6-am.u1', version: '0.3.0', source: 'online' })]);

    // The same version again, or an older one, changes nothing.
    expect((await installPackage(db, u1v030(), { source: 'file', sha256: 'abc' })).result).toBe('not-newer');
    expect((await installPackage(db, u1, { source: 'file', sha256: 'abc' })).result).toBe('not-newer');
    db.close();
  });

  it('keeps a newer installed unit when the app starts with an older bundled one', async () => {
    const db = await freshDb();
    await installPackage(db, u1v030(), { source: 'online', sha256: 'abc' });
    const again = await importPackages(db, PACKAGES);
    expect(again[0]).toMatchObject({ packageId: 'rw-s6-am.u1', action: 'kept-newer', version: '0.3.0' });
    expect((await listLessons(db)).map(l => l.id)).toContain('rw-s6-am.u1.l08');
    db.close();
  });
});

describe('installReleases and installFromFile', () => {
  it('installs what downloads intact and reports what does not, one failure not stopping the others', async () => {
    const db = await freshDb();
    const good = release(u1v030());
    const u4v020 = { ...u4, manifest: { ...u4.manifest, version: '0.2.0' } };
    const tampered = release(u4v020);
    const gone = { ...release(u4v020), id: 'gone' };
    const remote: UpdateRemote = {
      listReleases: async () => [good, tampered],
      fetchPackage: async id => {
        if (id === good.id) {
          return fileFor(u1v030());
        }
        if (id === tampered.id) {
          return fileFor(u4v020).replace('Integration', 'Integratio');
        }
        throw new Error('That update is no longer available.');
      },
    };
    const results = await installReleases(db, remote, [good, tampered, gone]);
    expect(results.map(r => [r.release.packageId, r.outcome?.result ?? null, r.problem])).toEqual([
      ['rw-s6-am.u1', 'installed', null],
      ['rw-s6-am.u4', null, 'The download is incomplete or changed: its checksum does not match.'],
      ['rw-s6-am.u4', null, 'That update is no longer available.'],
    ]);
    expect((await getContentVersions(db)).map(v => `${v.packageId} ${v.version}`)).toEqual([
      'rw-s6-am.u1 0.3.0',
      'rw-s6-am.u4 0.1.0',
      'rw-s6-am.u5 0.1.0',
      'rw-s6-am.u9 0.1.0',
    ]);
    db.close();
  });

  it('installs a package file copied onto an offline tablet, and refuses a broken one', async () => {
    const db = await freshDb();
    const ok = await installFromFile(db, 'rw-s6-am.u1-0.3.0.json', fileFor(u1v030()));
    expect(ok.outcome).toMatchObject({ result: 'installed', version: '0.3.0' });
    expect(ok.sha256).toBe(sha256Hex(fileFor(u1v030())));
    const bad = await installFromFile(db, 'notes.txt', 'hello');
    expect(bad.outcome).toBeNull();
    expect(bad.problem).toMatch(/not a lesson package/);
    db.close();
  });
});

describe('UpdatePrompt', () => {
  const texts = (root: ReactTestRenderer.ReactTestInstance) =>
    root
      .findAllByType(require('react-native').Text)
      .map(t => (Array.isArray(t.props.children) ? t.props.children.join('') : String(t.props.children ?? '')))
      .join('\n');
  const press = (root: ReactTestRenderer.ReactTestInstance, id: string) =>
    root.findAllByProps({ testID: id }).find(n => typeof n.props.onPress === 'function')!.props.onPress();

  it('offers the updates, installs on request and reports what was installed', async () => {
    const onInstall = jest.fn(async () => ({ installed: ['Complex Numbers (Unit 1): 0.2.0 → 0.3.0 · 2 lessons, 6 exercises'], problems: [] }));
    const onClose = jest.fn();
    const versions = [{ packageId: 'rw-s6-am.u1', version: '0.2.0', unit: 1, unitTitle: 'Complex Numbers', attribution: '', importedAt: '' }];
    let r!: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      r = ReactTestRenderer.create(
        <UpdatePrompt releases={[release(u1v030(), { notes: 'A lesson on powers of i.' })]} installed={versions} onInstall={onInstall} onLater={() => {}} onClose={onClose} />,
      );
    });
    let t = texts(r.root);
    expect(t).toContain('New lessons are ready');
    expect(t).toContain('Complex Numbers (Unit 1): 0.2.0 → 0.3.0 · 2 lessons, 6 exercises');
    expect(t).toContain('A lesson on powers of i.');
    await act(async () => press(r.root, 'update-now'));
    t = texts(r.root);
    expect(onInstall).toHaveBeenCalledTimes(1);
    expect(t).toContain('Lessons updated');
    expect(t).toContain('Saved progress is kept');
    await act(async () => press(r.root, 'update-close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('lets the learner decide later, and shows a failure with a way to try again', async () => {
    const onLater = jest.fn();
    const onInstall = jest.fn(async () => ({ installed: [], problems: ['Complex Numbers (Unit 1): No internet connection.'] }));
    let r!: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      r = ReactTestRenderer.create(<UpdatePrompt releases={[release(u1v030())]} installed={[]} onInstall={onInstall} onLater={onLater} onClose={() => {}} />);
    });
    await act(async () => press(r.root, 'update-later'));
    expect(onLater).toHaveBeenCalledTimes(1);
    await act(async () => press(r.root, 'update-now'));
    expect(texts(r.root)).toContain('The update did not install');
    expect(texts(r.root)).toContain('No internet connection.');
    expect(r.root.findAllByProps({ testID: 'update-retry' }).length).toBeGreaterThan(0);
  });
});
