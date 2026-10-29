/**
 * The application root: start-up, the signed-in account, the active
 * session, background sync, and a small stack navigator.
 *
 * Start-up opens SQLite, makes sure the learner tables exist, imports any
 * bundled curriculum package newer than the one loaded, and reads the
 * lesson list. When there is internet the app also looks for lesson updates
 * published from the admin portal (src/updates/) and offers them in a
 * pop-up on the sign-in, learner and topic screens, never mid-lesson. Everything after that is offline reads and writes of that one
 * database; sync (src/sync/) copies the records of accounts that switched it
 * on to Supabase when there is internet, and nothing waits for it. The navigator is React state plus the Android back button; there
 * are no native navigation modules, so the debug APK from P3 runs this code
 * unchanged.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, Pressable, StatusBar, StyleSheet, Text, View } from 'react-native';
import { OfflineError } from './src/account/auth';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { ensureAccountSchema, isStaff, type Account } from './src/account/store';
import { getDb } from './src/content/db';
import { importPackages } from './src/content/importer';
import { PACKAGES } from './src/content/packages';
import { getContentVersions, listLessons, type ContentVersion, type LessonSummary } from './src/content/service';
import { getGuidanceService } from './src/guidance';
import { ensureSharingSchema } from './src/sharing/store';
import { ensureGuidanceSchema } from './src/guidance/log';
import { openSession, type ActiveSession } from './src/learner/session';
import { ensureLearnerSchema } from './src/learner/store';
import { deviceInfo, pickTextFiles, tabletLabel } from './src/device/device';
import { log } from './src/log';
import { AccountScreen } from './src/screens/AccountScreen';
import { DevScreen } from './src/screens/DevScreen';
import { LearnerScreen } from './src/screens/LearnerScreen';
import { LessonScreen } from './src/screens/LessonScreen';
import { PracticeScreen } from './src/screens/PracticeScreen';
import { ProgressScreen } from './src/screens/ProgressScreen';
import { ClassScreen } from './src/screens/ClassScreen';
import { TeacherScreen } from './src/screens/TeacherScreen';
import { SyncCard } from './src/screens/SyncCard';
import { TopicsScreen } from './src/screens/TopicsScreen';
import { UpdatePrompt, type InstallSummary } from './src/screens/UpdatePrompt';
import { colors } from './src/screens/ui';
import { SYNC_INTERVAL_MS, UPDATE_CHECK_MS } from './src/sync/config';
import { syncAll } from './src/sync/engine';
import { supabaseAuth, supabaseSync, supabaseUpdates } from './src/sync/supabase';
import { ensureUpdatesSchema } from './src/updates/install';
import { MAX_PACKAGE_BYTES } from './src/updates/packageFile';
import { describeRelease, type Release } from './src/updates/releases';
import { checkForUpdates, installFromFile, installReleases } from './src/updates/updater';

type Route =
  | { name: 'account' }
  | { name: 'learner' }
  | { name: 'topics' }
  | { name: 'lesson'; lessonId: string }
  | { name: 'practice'; lessonId: string; exerciseId: string }
  | { name: 'progress' }
  | { name: 'teacher' }
  | { name: 'class' }
  | { name: 'learnerProgress'; code: string }
  | { name: 'dev' };

type Boot =
  | { status: 'loading' }
  | { status: 'ready'; lessons: LessonSummary[]; versions: ContentVersion[]; line: string }
  | { status: 'error'; message: string };

async function bootstrap(): Promise<Extract<Boot, { status: 'ready' }>> {
  const t0 = Date.now();
  const db = getDb();
  const { migratedDevTable } = await ensureLearnerSchema(db);
  if (migratedDevTable) {
    log('boot', 'renamed the P2 developer attempts table to dev_storage_check');
  }
  await ensureGuidanceSchema(db);
  await ensureSharingSchema(db);
  await ensureAccountSchema(db);
  await ensureUpdatesSchema(db);
  const reports = await importPackages(db, PACKAGES);
  for (const r of reports) {
    log('boot', `content ${r.packageId} v${r.version}: ${r.action} (${r.lessons} lesson, ${r.examples} examples, ${r.exercises} exercises)`);
  }
  const content = await readContent(db);
  log('boot', `ready in ${Date.now() - t0} ms: ${content.line}`);
  return content;
}

type Reader = Parameters<typeof listLessons>[0];

/** The lessons and versions the screens show, re-read after a lesson update. */
async function readContent(db: Reader): Promise<Extract<Boot, { status: 'ready' }>> {
  const [lessons, versions] = await Promise.all([listLessons(db), getContentVersions(db)]);
  const line = `Content: ${versions.map(v => `${v.packageId} v${v.version}`).join(', ')} · ${lessons.length} lesson(s) · offline`;
  return { status: 'ready', lessons, versions, line };
}

function titleFor(route: Route, lessons: LessonSummary[]): string {
  switch (route.name) {
    case 'account':
      return 'Offline Tutor';
    case 'learner':
      return 'Learner code';
    case 'topics':
      return 'Topics';
    case 'lesson':
      return lessons.find(l => l.id === route.lessonId)?.title ?? 'Lesson';
    case 'practice':
      return 'Practice';
    case 'progress':
      return 'Progress';
    case 'teacher':
      return 'Teacher tools';
    case 'class':
      return 'Class progress';
    case 'learnerProgress':
      return `Progress: ${route.code}`;
    case 'dev':
      return 'Developer';
  }
}

function App(): React.JSX.Element {
  const [boot, setBoot] = useState<Boot>({ status: 'loading' });
  const [session, setSession] = useState<ActiveSession | null>(null);
  const [account, setAccount] = useState<Account | null>(null);
  const [stack, setStack] = useState<Route[]>([{ name: 'account' }]);
  const [teacherUnlocked, setTeacherUnlocked] = useState(false);
  const db = useMemo(() => getDb(), []);
  const guidance = useMemo(() => getGuidanceService(), []);

  useEffect(() => {
    bootstrap()
      .then(setBoot)
      .catch(e => {
        log('boot', `FAIL ${(e as Error).message}`);
        setBoot({ status: 'error', message: (e as Error).message });
      });
  }, []);

  const route = stack[stack.length - 1];

  // The PIN holds while the teacher moves between teacher screens, and is
  // asked for again once Teacher tools is left.
  useEffect(() => {
    if (!stack.some(r => r.name === 'teacher')) {
      setTeacherUnlocked(false);
    }
  }, [stack]);
  const push = useCallback((r: Route) => setStack(s => [...s, r]), []);
  const replaceTop = useCallback((r: Route) => setStack(s => [...s.slice(0, -1), r]), []);
  const pop = useCallback(() => setStack(s => (s.length > 1 ? s.slice(0, -1) : s)), []);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (stack.length > 1) {
        pop();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [pop, stack.length]);

  const choose = useCallback(
    async (code: string) => {
      if (boot.status !== 'ready') {
        return;
      }
      try {
        const s = await openSession(db, code, boot.versions);
        log('session', `learner ${s.learnerCode} session #${s.sessionId}`);
        setSession(s);
        setStack([{ name: 'account' }, { name: 'topics' }]);
      } catch (e) {
        log('session', `FAIL ${(e as Error).message}`);
      }
    },
    [boot, db],
  );

  const switchLearner = useCallback(() => {
    setSession(null);
    setAccount(null);
    setStack([{ name: 'account' }]);
  }, []);

  // One sync at a time, of every account on this tablet that switched it on.
  const syncing = useRef(false);
  const runSync = useCallback(async () => {
    if (boot.status !== 'ready' || syncing.current) {
      return;
    }
    syncing.current = true;
    try {
      const info = deviceInfo();
      const device = {
        id: info.installId,
        label: tabletLabel(info.installId),
        model: info.deviceModel,
        appVersion: `${info.versionName} (${info.versionCode})`,
        content: boot.versions.map(v => `${v.packageId} v${v.version}`).join(', '),
      };
      for (const r of await syncAll(db, supabaseSync, device)) {
        const sent = Object.entries(r.sent)
          .map(([table, n]) => `${n} ${table}`)
          .join(', ');
        log('sync', r.error ? `${r.email}: ${r.error}` : `${r.email}: sent ${sent}`);
      }
    } catch (e) {
      log('sync', `FAIL ${(e as Error).message}`);
    } finally {
      syncing.current = false;
    }
  }, [boot, db]);

  useEffect(() => {
    if (boot.status !== 'ready') {
      return;
    }
    runSync();
    const h = setInterval(runSync, SYNC_INTERVAL_MS);
    return () => clearInterval(h);
  }, [boot.status, runSync]);

  // Lesson updates: looked for at start-up and every ten minutes; a tablet
  // with no internet, or the offline-only build, just finds none.
  const [updates, setUpdates] = useState<Release[]>([]);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [prompt, setPrompt] = useState<Release[] | null>(null);
  const checking = useRef(false);

  const reloadContent = useCallback(async () => {
    const content = await readContent(db);
    setBoot(content);
    log('updates', `content now ${content.line}`);
  }, [db]);

  const checkUpdates = useCallback(async (): Promise<string> => {
    if (boot.status !== 'ready' || checking.current) {
      return 'Already checking.';
    }
    checking.current = true;
    try {
      const pending = await checkForUpdates(supabaseUpdates, boot.versions, deviceInfo().installId);
      setUpdates(pending);
      if (pending.length) {
        log('updates', `available: ${pending.map(r => `${r.packageId} v${r.version}`).join(', ')}`);
      }
      return pending.length ? `${pending.length} update${pending.length === 1 ? '' : 's'} ready to install.` : 'The lessons are up to date.';
    } catch (e) {
      const message = e instanceof OfflineError ? 'No internet connection.' : (e as Error).message || String(e);
      log('updates', `check: ${message}`);
      return `Could not check for updates: ${message}`;
    } finally {
      checking.current = false;
    }
  }, [boot]);

  useEffect(() => {
    if (boot.status !== 'ready') {
      return;
    }
    checkUpdates();
    const h = setInterval(checkUpdates, UPDATE_CHECK_MS);
    return () => clearInterval(h);
  }, [boot.status, checkUpdates]);

  const installUpdates = useCallback(
    async (releases: Release[]): Promise<InstallSummary> => {
      const versionsBefore = boot.status === 'ready' ? boot.versions : [];
      const results = await installReleases(db, supabaseUpdates, releases);
      const summary: InstallSummary = { installed: [], problems: [] };
      for (const { release, outcome, problem } of results) {
        const before = versionsBefore.find(v => v.packageId === release.packageId)?.version;
        if (outcome?.result === 'installed') {
          summary.installed.push(describeRelease(release, before));
        } else if (outcome) {
          summary.installed.push(`${release.unitTitle} (Unit ${release.unit}) is already at ${outcome.installed}`);
        } else {
          summary.problems.push(`${release.unitTitle} (Unit ${release.unit}): ${problem}`);
        }
        log('updates', `${release.packageId} v${release.version}: ${outcome ? outcome.result : `FAIL ${problem}`}`);
      }
      if (results.some(r => r.outcome?.result === 'installed')) {
        await reloadContent();
      }
      setUpdates(u => u.filter(x => !results.some(r => r.release.id === x.id && r.outcome)));
      return summary;
    },
    [boot, db, reloadContent],
  );

  // The offline route: package files copied onto the tablet, from Teacher tools.
  const importLessonFiles = useCallback(async (): Promise<string> => {
    const files = await pickTextFiles(MAX_PACKAGE_BYTES);
    if (!files.length) {
      return 'No file was chosen.';
    }
    const lines: string[] = [];
    let changed = false;
    for (const f of files) {
      if (f.error) {
        lines.push(`${f.name}: ${f.error}`);
        continue;
      }
      const r = await installFromFile(db, f.name, f.content);
      if (r.outcome?.result === 'installed') {
        changed = true;
        lines.push(`${f.name}: installed ${r.outcome.packageId} v${r.outcome.version}.`);
      } else if (r.outcome) {
        lines.push(`${f.name}: ${r.outcome.packageId} is already at ${r.outcome.installed}; nothing changed.`);
      } else {
        lines.push(`${f.name}: ${r.problem}`);
      }
      log('updates', `file ${f.name} (sha256 ${r.sha256.slice(0, 12)}…): ${r.outcome ? r.outcome.result : `FAIL ${r.problem}`}`);
    }
    if (changed) {
      await reloadContent();
    }
    return lines.join('\n');
  }, [db, reloadContent]);

  // The pop-up waits for a calm screen: sign-in, learner code or the topic list.
  const promptable = route.name === 'account' || route.name === 'learner' || route.name === 'topics';
  const offered = updates.filter(u => !dismissed.includes(u.id));
  const offeredKey = offered.map(u => u.id).join(',');
  useEffect(() => {
    if (promptable && prompt === null && offered.length > 0) {
      setPrompt(offered);
    }
    // offeredKey stands for `offered`, which is a new array on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [promptable, prompt, offeredKey]);
  const closePrompt = useCallback(() => {
    setDismissed(d => [...d, ...(prompt ?? []).map(r => r.id)]);
    setPrompt(null);
  }, [prompt]);

  const signedIn = useCallback(
    (a: Account, online: boolean) => {
      log('account', `${a.email} (${a.role}, ${a.learnerCode}) signed in ${online ? 'online' : 'offline, from this tablet'}`);
      setAccount(a);
      choose(a.learnerCode);
      if (online && a.syncEnabled) {
        runSync();
      }
    },
    [choose, runSync],
  );

  const lessons = boot.status === 'ready' ? boot.lessons : [];
  const versions = boot.status === 'ready' ? boot.versions : [];

  let body: React.ReactNode;
  if (boot.status === 'loading') {
    body = <Text style={styles.centered}>Opening the local database…</Text>;
  } else if (boot.status === 'error') {
    body = <Text style={[styles.centered, { color: colors.bad }]}>Start-up failed: {boot.message}</Text>;
  } else if (route.name === 'teacher') {
    body = (
      <TeacherScreen
        db={db}
        guidance={guidance}
        versions={versions}
        lessons={lessons}
        unlocked={teacherUnlocked || isStaff(account)}
        onUnlock={() => setTeacherUnlocked(true)}
        onClass={() => push({ name: 'class' })}
        onDeveloper={() => push({ name: 'dev' })}
        updates={updates}
        onCheckUpdates={checkUpdates}
        onInstallUpdates={() => installUpdates(updates)}
        onImportLessonFiles={importLessonFiles}
      />
    );
  } else if (route.name === 'class') {
    body = <ClassScreen db={db} lessons={lessons} onLearner={code => push({ name: 'learnerProgress', code })} />;
  } else if (route.name === 'learnerProgress') {
    body = <ProgressScreen db={db} learnerCode={route.code} lessons={lessons} />;
  } else if (route.name === 'dev') {
    body = <DevScreen service={guidance} />;
  } else if (route.name === 'account') {
    body = (
      <AccountScreen
        db={db}
        remote={supabaseAuth}
        contentLine={boot.line}
        onSignedIn={signedIn}
        onWithoutAccount={() => push({ name: 'learner' })}
        onTeacher={() => push({ name: 'teacher' })}
      />
    );
  } else if (route.name === 'learner' || !session) {
    body = <LearnerScreen db={db} contentLine={boot.line} onChoose={choose} onTeacher={() => push({ name: 'teacher' })} />;
  } else if (route.name === 'topics') {
    body = (
      <TopicsScreen
        db={db}
        learnerCode={session.learnerCode}
        lessons={lessons}
        versions={versions}
        onOpenLesson={lessonId => push({ name: 'lesson', lessonId })}
        onProgress={() => push({ name: 'progress' })}
        onTeacher={isStaff(account) ? () => push({ name: 'teacher' }) : undefined}
        footer={account ? <SyncCard db={db} userId={account.userId} syncNow={runSync} /> : null}
      />
    );
  } else if (route.name === 'lesson') {
    body = (
      <LessonScreen
        db={db}
        session={session}
        guidance={guidance}
        lessonId={route.lessonId}
        lessons={lessons}
        onPractice={exerciseId => push({ name: 'practice', lessonId: route.lessonId, exerciseId })}
      />
    );
  } else if (route.name === 'practice') {
    body = (
      <PracticeScreen
        key={route.exerciseId}
        db={db}
        session={session}
        guidance={guidance}
        lessonId={route.lessonId}
        exerciseId={route.exerciseId}
        onNext={exerciseId => replaceTop({ name: 'practice', lessonId: route.lessonId, exerciseId })}
        onBackToLesson={pop}
      />
    );
  } else if (route.name === 'progress') {
    body = (
      <ProgressScreen
        db={db}
        learnerCode={session.learnerCode}
        lessons={lessons}
        onPractice={(lessonId, exerciseId) => push({ name: 'practice', lessonId, exerciseId })}
      />
    );
  } else {
    body = <DevScreen service={guidance} />;
  }

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.root}>
        <StatusBar barStyle="dark-content" />
        <View style={styles.header}>
          {stack.length > 1 ? (
            <Pressable onPress={pop} style={styles.headerBtn} testID="nav-back" accessibilityRole="button">
              <Text style={styles.headerBtnText}>‹ Back</Text>
            </Pressable>
          ) : (
            <View style={styles.headerBtn} />
          )}
          <Text style={styles.headerTitle} numberOfLines={1}>
            {titleFor(route, lessons)}
          </Text>
          {session ? (
            <Pressable onPress={switchLearner} style={styles.headerBtn} testID="nav-learner" accessibilityRole="button">
              <Text style={styles.headerBtnText}>{session.learnerCode} ⇄</Text>
            </Pressable>
          ) : (
            <View style={styles.headerBtn} />
          )}
        </View>
        {body}
        {prompt && boot.status === 'ready' ? (
          <UpdatePrompt
            key={prompt.map(r => r.id).join(',')}
            releases={prompt}
            installed={boot.versions}
            onInstall={() => installUpdates(prompt)}
            onLater={closePrompt}
            onClose={closePrompt}
          />
        ) : null}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: 8,
    height: 48,
  },
  headerBtn: { minWidth: 72, paddingHorizontal: 8, paddingVertical: 8 },
  headerBtnText: { color: colors.primary, fontWeight: '600', fontSize: 14 },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '700', color: colors.text },
  centered: { padding: 24, textAlign: 'center', fontSize: 15, color: colors.muted },
});

export default App;
