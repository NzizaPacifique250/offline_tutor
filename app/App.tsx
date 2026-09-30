/**
 * The application root: start-up, the active session and a small stack
 * navigator (P4 of docs/PROTOTYPE_DEVELOPMENT_PLAN.md).
 *
 * Start-up opens SQLite, makes sure the learner tables exist, imports any
 * bundled curriculum package whose version is not yet loaded, and reads the
 * lesson list. Everything after that is offline reads and writes of that one
 * database. The navigator is React state plus the Android back button; there
 * are no native navigation modules, so the debug APK from P3 runs this code
 * unchanged.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BackHandler, Pressable, StatusBar, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { getDb } from './src/content/db';
import { importPackages } from './src/content/importer';
import { PACKAGES } from './src/content/packages';
import { getContentVersions, listLessons, type ContentVersion, type LessonSummary } from './src/content/service';
import { getGuidanceService } from './src/guidance';
import { ensureGuidanceSchema } from './src/guidance/log';
import { openSession, type ActiveSession } from './src/learner/session';
import { ensureLearnerSchema } from './src/learner/store';
import { log } from './src/log';
import { DevScreen } from './src/screens/DevScreen';
import { LearnerScreen } from './src/screens/LearnerScreen';
import { LessonScreen } from './src/screens/LessonScreen';
import { PracticeScreen } from './src/screens/PracticeScreen';
import { ProgressScreen } from './src/screens/ProgressScreen';
import { TopicsScreen } from './src/screens/TopicsScreen';
import { colors } from './src/screens/ui';

type Route =
  | { name: 'learner' }
  | { name: 'topics' }
  | { name: 'lesson'; lessonId: string }
  | { name: 'practice'; lessonId: string; exerciseId: string }
  | { name: 'progress' }
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
  const reports = await importPackages(db, PACKAGES);
  for (const r of reports) {
    log('boot', `content ${r.packageId} v${r.version}: ${r.action} (${r.lessons} lesson, ${r.examples} examples, ${r.exercises} exercises)`);
  }
  const [lessons, versions] = await Promise.all([listLessons(db), getContentVersions(db)]);
  const line = `Content: ${versions.map(v => `${v.packageId} v${v.version}`).join(', ')} · ${lessons.length} lesson(s) · offline`;
  log('boot', `ready in ${Date.now() - t0} ms: ${line}`);
  return { status: 'ready', lessons, versions, line };
}

function titleFor(route: Route, lessons: LessonSummary[]): string {
  switch (route.name) {
    case 'learner':
      return 'Offline Tutor';
    case 'topics':
      return 'Topics';
    case 'lesson':
      return lessons.find(l => l.id === route.lessonId)?.title ?? 'Lesson';
    case 'practice':
      return 'Practice';
    case 'progress':
      return 'Progress';
    case 'dev':
      return 'Developer';
  }
}

function App(): React.JSX.Element {
  const [boot, setBoot] = useState<Boot>({ status: 'loading' });
  const [session, setSession] = useState<ActiveSession | null>(null);
  const [stack, setStack] = useState<Route[]>([{ name: 'learner' }]);
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
        setStack([{ name: 'learner' }, { name: 'topics' }]);
      } catch (e) {
        log('session', `FAIL ${(e as Error).message}`);
      }
    },
    [boot, db],
  );

  const switchLearner = useCallback(() => {
    setSession(null);
    setStack([{ name: 'learner' }]);
  }, []);

  const lessons = boot.status === 'ready' ? boot.lessons : [];
  const versions = boot.status === 'ready' ? boot.versions : [];

  let body: React.ReactNode;
  if (boot.status === 'loading') {
    body = <Text style={styles.centered}>Opening the local database…</Text>;
  } else if (boot.status === 'error') {
    body = <Text style={[styles.centered, { color: colors.bad }]}>Start-up failed: {boot.message}</Text>;
  } else if (route.name === 'learner' || !session) {
    body = <LearnerScreen db={db} contentLine={boot.line} onChoose={choose} />;
  } else if (route.name === 'topics') {
    body = (
      <TopicsScreen
        db={db}
        learnerCode={session.learnerCode}
        lessons={lessons}
        versions={versions}
        onOpenLesson={lessonId => push({ name: 'lesson', lessonId })}
        onProgress={() => push({ name: 'progress' })}
        onDeveloper={() => push({ name: 'dev' })}
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
