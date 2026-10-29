/**
 * Teacher tools without a tablet: the research export over real SQLite, the
 * CSV writer, the model-status and progress wording, the device fallbacks
 * Jest runs under, and the screen behind the teacher PIN.
 */

import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { importPackages } from '../src/content/importer';
import { PACKAGES } from '../src/content/packages';
import { getContentVersions, listLessons } from '../src/content/service';
import * as device from '../src/device/device';
import { EXPORT_TABLES, exportFolder, exportRecords, toCsv } from '../src/export/records';
import { DEFAULT_MODEL_PATH, MODEL_BYTES, MODEL_SHA256 } from '../src/guidance/config';
import { ensureGuidanceSchema, recordGuidance } from '../src/guidance/log';
import { GuidanceService } from '../src/guidance/service';
import { openSession } from '../src/learner/session';
import { ensureLearnerSchema, recordAttempt, recordReveal } from '../src/learner/store';
import { TeacherScreen } from '../src/screens/TeacherScreen';
import { ensureSharingSchema } from '../src/sharing/store';
import { installOutcomeText, modelState, modelStatusText, pinMatches, progressText, TEACHER_PIN } from '../src/teacher/teacher';

const { makeSqlDb } = require('../jest/sqljs-db');

const flush = () =>
  act(async () => {
    await new Promise<void>(r => setTimeout(() => r(), 0));
  });

function byId(root: ReactTestRenderer.ReactTestInstance, testID: string, prop: string) {
  const hit = root.findAllByProps({ testID }).find(n => n.props[prop] !== undefined);
  if (!hit) {
    throw new Error(`no element with testID ${testID} and prop ${prop}`);
  }
  return hit;
}
const press = (root: ReactTestRenderer.ReactTestInstance, id: string) => byId(root, id, 'onPress').props.onPress();
const type = (root: ReactTestRenderer.ReactTestInstance, id: string, text: string) => byId(root, id, 'onChangeText').props.onChangeText(text);

function texts(root: ReactTestRenderer.ReactTestInstance): string {
  return root
    .findAllByType(require('react-native').Text)
    .map(t => (Array.isArray(t.props.children) ? t.props.children.join('') : String(t.props.children ?? '')))
    .join('\n');
}

const L = PACKAGES[0].lessons[0].id;
const Q = PACKAGES[0].exercises[0].id;

async function seededDb() {
  const db = await makeSqlDb();
  await ensureLearnerSchema(db);
  await ensureGuidanceSchema(db);
  await ensureSharingSchema(db);
  await importPackages(db, PACKAGES);
  const versions = await getContentVersions(db);
  const s = await openSession(db, 'T1', versions);
  const base = { learnerCode: 'T1', sessionId: s.sessionId, lessonId: L, exerciseId: Q };
  await recordAttempt(db, { ...base, answer: '5, "3i"', verdict: 'wrong', hintsSeen: 0 });
  await recordReveal(db, { ...base, kind: 'hint', hintIndex: 0 });
  await recordGuidance(db, {
    ...base,
    question: 'help with q1',
    outcome: 'generated',
    text: 'line one\nline two',
    promptTokens: 1,
    generatedTokens: 78,
    firstTokenMs: 510,
    totalMs: 35038,
  });
  return { db, versions };
}

describe('CSV and export folder', () => {
  it('quotes commas, quotes, line breaks and edge spaces, and leaves plain fields alone', () => {
    const csv = toCsv(['a', 'b', 'c'], [
      { a: 'plain', b: 'x, y', c: 'say "hi"' },
      { a: 'two\nlines', b: ' padded', c: null },
      { a: 3, b: { k: 1 }, c: undefined },
    ]);
    expect(csv).toBe('a,b,c\r\nplain,"x, y","say ""hi"""\r\n"two\nlines"," padded",\r\n3,"{""k"":1}",\r\n');
  });

  it('names a folder that sorts by time', () => {
    expect(exportFolder(new Date(2026, 9, 20, 14, 30, 5))).toBe('export-20261020-143005');
  });
});

describe('research export on real SQLite', () => {
  it('writes the learner tables and a manifest, and never the lesson content', async () => {
    const { db, versions } = await seededDb();
    const written: { folder: string; name: string; mime: string; content: string }[] = [];
    const r = await exportRecords(
      db,
      async (folder, name, mime, content) => {
        written.push({ folder, name, mime, content });
        return `Download/ClevoAI/${folder}/${name}`;
      },
      { content: versions },
      new Date(2026, 9, 20, 9, 0, 0),
    );
    expect(r.folder).toBe('export-20261020-090000');
    expect(written.every(w => w.folder === r.folder)).toBe(true);
    expect(written.map(w => w.name)).toEqual([...EXPORT_TABLES.map(t => `${t}.csv`), 'manifest.json']);
    expect(written.some(w => /lessons|exercises|examples|dev_storage/.test(w.name))).toBe(false);

    const attempts = written.find(w => w.name === 'attempts.csv')!.content.split('\r\n');
    expect(attempts[0]).toContain('learner_code');
    expect(attempts[0]).toContain('verdict');
    expect(attempts[1]).toContain('T1');
    expect(attempts[1]).toContain('"5, ""3i"""');
    const guidance = written.find(w => w.name === 'guidance_events.csv')!.content;
    expect(guidance).toContain('"line one\nline two"');
    expect(guidance).toContain('35038');

    const manifest = JSON.parse(written.find(w => w.name === 'manifest.json')!.content);
    expect(manifest.tables).toMatchObject({ learners: 1, sessions: 1, attempts: 1, reveals: 1, guidance_events: 1 });
    expect(manifest.content[0].packageId).toBe(PACKAGES[0].manifest.id);
    expect(r.files.find(f => f.name === 'attempts.csv')).toMatchObject({ rows: 1, path: `Download/ClevoAI/${r.folder}/attempts.csv` });
    db.close();
  });
});

describe('teacher tools wording', () => {
  it('opens only with the teacher PIN', () => {
    expect(pinMatches(TEACHER_PIN)).toBe(true);
    expect(pinMatches(` ${TEACHER_PIN} `)).toBe(true);
    expect(pinMatches('0000')).toBe(false);
    expect(pinMatches('')).toBe(false);
  });

  it('tells a missing, a wrong-size, an unchecked and a checked model apart', () => {
    expect(modelState({ exists: false, bytes: 0, verifiedSha256: '' })).toBe('missing');
    expect(modelState({ exists: true, bytes: 12, verifiedSha256: '' })).toBe('wrong-size');
    expect(modelState({ exists: true, bytes: MODEL_BYTES, verifiedSha256: '' })).toBe('unchecked');
    expect(modelState({ exists: true, bytes: MODEL_BYTES, verifiedSha256: MODEL_SHA256 })).toBe('checked');
    expect(modelStatusText({ exists: false, bytes: 0, verifiedSha256: '' })).toMatch(/stored hints and solutions/);
    expect(modelStatusText({ exists: true, bytes: MODEL_BYTES, verifiedSha256: MODEL_SHA256 })).toMatch(/^Installed and checked: 986 MB/);
  });

  it('reports copying progress and the outcome in plain words', () => {
    expect(progressText({ phase: 'picking', copied: 0, total: -1 })).toMatch(/Choose the model file/);
    expect(progressText({ phase: 'copying', copied: 493_024_416, total: MODEL_BYTES })).toBe('Copying and checking: 493 MB of 986 MB (50%). Keep the app open.');
    expect(progressText({ phase: 'copying', copied: 5e6, total: -1 })).toBe('Copying and checking: 5 MB. Keep the app open.');
    expect(installOutcomeText({ ok: true, reason: '' })).toMatch(/ready/);
    expect(installOutcomeText({ ok: false, reason: 'cancelled' })).toMatch(/Nothing was changed/);
    expect(installOutcomeText({ ok: false, reason: 'The file has 12 bytes' })).toBe('Not installed: The file has 12 bytes');
  });
});

describe('device fallbacks under Jest', () => {
  it('uses the development values and refuses native-only actions plainly', async () => {
    expect(device.nativeAvailable).toBe(false);
    expect(device.deviceInfo().pilot).toBe(false);
    expect(device.modelPath()).toBe(DEFAULT_MODEL_PATH);
    expect(device.modelFileInfo()).toEqual({ exists: false, bytes: 0, verifiedSha256: '' });
    expect((await device.pickAndInstallModel(MODEL_SHA256, MODEL_BYTES)).ok).toBe(false);
    await expect(device.writeDownload('f', 'n', 'text/csv', 'x')).rejects.toThrow(/pilot build/);
    expect(device.freeBytes()).toBeNull();
  });
});

describe('TeacherScreen', () => {
  afterEach(() => jest.restoreAllMocks());

  it('stays closed until the PIN is right, then shows the model, export, about and developer sections', async () => {
    const { db, versions } = await seededDb();
    const lessons = await listLessons(db);
    const service = new GuidanceService(async () => {
      throw new Error('no model in tests');
    }, { modelPath: '/none.gguf' });
    const onDeveloper = jest.fn();
    const onClass = jest.fn();
    // The app keeps the unlock while the teacher moves between teacher screens.
    function Harness() {
      const [unlocked, setUnlocked] = React.useState(false);
      return (
        <TeacherScreen
          db={db}
          guidance={service}
          versions={versions}
          lessons={lessons}
          unlocked={unlocked}
          onUnlock={() => setUnlocked(true)}
          onClass={onClass}
          onDeveloper={onDeveloper}
          updates={[]}
          onCheckUpdates={async () => 'The lessons are up to date.'}
          onInstallUpdates={async () => ({ installed: [], problems: [] })}
          onImportLessonFiles={async () => 'No file was chosen.'}
        />
      );
    }
    let r!: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      r = ReactTestRenderer.create(<Harness />);
    });
    expect(texts(r.root)).toContain('Enter the teacher PIN');
    expect(texts(r.root)).not.toContain('Research records');

    await act(async () => type(r.root, 'teacher-pin', '1111'));
    await act(async () => press(r.root, 'teacher-unlock'));
    expect(texts(r.root)).toContain('That PIN is not right.');
    expect(texts(r.root)).not.toContain('Research records');

    await act(async () => type(r.root, 'teacher-pin', TEACHER_PIN));
    await act(async () => press(r.root, 'teacher-unlock'));
    const t = texts(r.root);
    expect(t).toContain('Tutor model');
    expect(t).toMatch(/Not installed\./);
    expect(t).toContain('Research records');
    expect(t).toContain('Apache License 2.0');
    expect(t).toContain(`${PACKAGES[0].manifest.id} v${PACKAGES[0].manifest.version}`);

    // Without the native module the export says why it cannot run.
    await act(async () => press(r.root, 'teacher-export'));
    await flush();
    expect(texts(r.root)).toContain('Export failed: Exporting needs the pilot build of the app.');

    // With it, the export writes every table and says where.
    const paths: string[] = [];
    jest.spyOn(device, 'writeDownload').mockImplementation(async (folder, name) => {
      paths.push(`${folder}/${name}`);
      return `Download/${folder}/${name}`;
    });
    await act(async () => press(r.root, 'teacher-export'));
    await flush();
    expect(paths).toHaveLength(EXPORT_TABLES.length + 1);
    expect(paths[0]).toMatch(/^ClevoAI\/export-\d{8}-\d{6}\/learners\.csv$/);
    expect(texts(r.root)).toMatch(/Saved to Download\/ClevoAI\/export-\d{8}-\d{6}: learners\.csv \(1\)/);

    // Installation is refused plainly without the native module, and the model status stays.
    await act(async () => press(r.root, 'teacher-install'));
    await flush();
    expect(texts(r.root)).toContain('Not installed: Model installation needs the pilot build of the app.');

    await act(async () => press(r.root, 'teacher-dev'));
    expect(onDeveloper).toHaveBeenCalled();
    await act(async () => press(r.root, 'teacher-class'));
    expect(onClass).toHaveBeenCalled();
    expect(texts(r.root)).toContain('Class progress');

    // Sharing: the summary goes to the share menu, or to Download.
    const shared: { name: string; mime: string; content: string }[] = [];
    jest.spyOn(device, 'shareText').mockImplementation(async (name, mime, content) => {
      shared.push({ name, mime, content });
      return true;
    });
    await act(async () => press(r.root, 'teacher-share'));
    await flush();
    expect(shared).toHaveLength(1);
    expect(shared[0].name).toMatch(/^ClevoAI-progress-Tablet-[0-9A-F]{4}-\d{8}-\d{4}\.txt$/);
    expect(shared[0].mime).toBe('text/plain');
    const sent = JSON.parse(shared[0].content);
    expect(sent.learners.map((l: { code: string }) => l.code)).toEqual(['T1']);
    expect(texts(r.root)).toContain('Choose Bluetooth or Quick Share');
    await act(async () => press(r.root, 'teacher-share-save'));
    await flush();
    expect(texts(r.root)).toMatch(/Saved Download\/ClevoAI\/ClevoAI-progress-.*\(1 learner\)/);

    // Collecting: a file from another tablet is added, a stranger's file is refused.
    const other = { ...sent, tablet: { ...sent.tablet, id: 'other-tablet', label: 'Tablet 0THE' } };
    jest.spyOn(device, 'pickTextFiles').mockResolvedValue([
      { name: 'from-0THE.txt', content: JSON.stringify(other), error: '' },
      { name: 'notes.txt', content: 'shopping list', error: '' },
      { name: 'own.txt', content: shared[0].content, error: '' },
    ]);
    await act(async () => press(r.root, 'teacher-import'));
    await flush();
    const note = texts(r.root);
    expect(note).toContain('Tablet 0THE: 1 learner added.');
    expect(note).toContain('notes.txt: not a progress file from Clevo AI.');
    expect(note).toContain("this is this tablet's own file");
    db.close();
  });
});
