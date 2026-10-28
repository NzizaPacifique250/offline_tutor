/**
 * The lesson: prose, formulas and worked examples rendered offline, the
 * exercise list with the learner's status on each, and the question box.
 * A free question is planned by guidance/controller.ts: the router declines
 * what the package does not cover without calling the model; otherwise the
 * best-matching passage of the routed lesson is placed in the prompt and the
 * guidance panel runs the bounded generation. Layout and wiring only.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { PACKAGES } from '../content/packages';
import { getExamples, getExercises, getLesson, type LessonSummary } from '../content/service';
import { toLesson } from '../content/toLesson';
import type { PackageExercise, PackageLesson } from '../content/types';
import { planFreeQuestion, planTypingWarmUp } from '../guidance/controller';
import { freeQuestionMessages, lessonSource, passageWarmUpMessages, selectPassage, warmUpMessages } from '../guidance/prompt';
import type { GuidanceService, ServiceState } from '../guidance/service';
import type { Lesson } from '../lesson';
import type { LessonProgress } from '../learner/progress';
import { loadProgress, type ActiveSession } from '../learner/session';
import type { Executor } from '../learner/store';
import { LessonView } from '../LessonView';
import { log } from '../log';
import { GuidancePanel, type PanelRequest } from './GuidancePanel';
import { KeyboardScrollView } from './KeyboardScrollView';
import { Badge, Button, Card, colors, ui } from './ui';

export function LessonScreen({
  db,
  session,
  guidance,
  lessonId,
  lessons,
  onPractice,
}: {
  db: Executor;
  session: ActiveSession;
  guidance: GuidanceService;
  lessonId: string;
  lessons: LessonSummary[];
  onPractice: (exerciseId: string) => void;
}): React.JSX.Element {
  const learnerCode = session.learnerCode;
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [pkgLesson, setPkgLesson] = useState<PackageLesson | null>(null);
  const [exercises, setExercises] = useState<PackageExercise[]>([]);
  const [progress, setProgress] = useState<LessonProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [question, setQuestion] = useState('');
  const [request, setRequest] = useState<PanelRequest | null>(null);
  const [serviceState, setServiceState] = useState<ServiceState>(guidance.state);

  useEffect(() => guidance.subscribe(setServiceState), [guidance]);

  // While the learner reads, load the model and cache the prompt prefix so
  // the first question does not pay for either. Nothing is logged as a
  // learner request.
  useEffect(() => {
    guidance
      .warmUp(warmUpMessages())
      .then(r => log('guidance', r.ok ? `warm-up done in ${r.ms} ms (${r.promptTokens} prompt tokens processed)` : `warm-up skipped: ${r.reason}`))
      .catch(e => log('guidance', `warm-up error: ${(e as Error).message}`));
  }, [guidance]);

  useEffect(() => {
    let live = true;
    const t0 = Date.now();
    (async () => {
      const summary = lessons.find(l => l.id === lessonId);
      const manifest = PACKAGES.find(p => p.manifest.id === summary?.packageId)?.manifest;
      const [read, examples, qs, all] = await Promise.all([
        getLesson(db, lessonId),
        getExamples(db, lessonId),
        getExercises(db, lessonId),
        loadProgress(db, learnerCode, lessons),
      ]);
      if (!live) {
        return;
      }
      if (!read || !manifest) {
        setError(`Lesson ${lessonId} could not be read.`);
        return;
      }
      // Exercises are practised on their own screen; the reading view shows
      // the lesson text and the worked examples only.
      setLesson(toLesson(manifest, read, examples, []));
      setPkgLesson(read);
      setExercises(qs);
      setProgress(all.find(p => p.lessonId === lessonId) ?? null);
      log('lesson', `${lessonId} read from SQLite in ${Date.now() - t0} ms for ${learnerCode}`);
    })().catch(e => live && setError((e as Error).message));
    return () => {
      live = false;
    };
  }, [db, learnerCode, lessonId, lessons]);

  const routable = useMemo(() => lessons.map(l => ({ id: l.id, topics: l.topics })), [lessons]);

  // While the question is typed, cache the passage it routes to, so on
  // sending only the question's own words are new to the model. Routing and
  // passage choice are cheap, so this runs on every change; a warm-up starts
  // only when the chosen passage changes.
  const warmedPassage = useRef<string | null>(null);
  useEffect(() => {
    if (!pkgLesson) {
      return;
    }
    const route = planTypingWarmUp(question, routable, lessonId);
    if (!route) {
      return;
    }
    const passage = selectPassage(pkgLesson, question.trim(), route.matched);
    if (passage === warmedPassage.current) {
      return;
    }
    warmedPassage.current = passage;
    guidance
      .warmUp(passageWarmUpMessages(passage))
      .then(r => r.ok && log('guidance', `passage warm-up done in ${r.ms} ms (${r.promptTokens} prompt tokens processed): ${passage.slice(0, 40).replace(/\n/g, ' ')}…`))
      .catch(e => log('guidance', `warm-up error: ${(e as Error).message}`));
  }, [guidance, lessonId, pkgLesson, question, routable]);

  const ask = useCallback(async () => {
    const q = question.trim();
    if (!q) {
      return;
    }
    const id = Date.now();
    const plan = planFreeQuestion(q, routable);
    if (plan.kind === 'declined') {
      log('router', `"${q}" -> declined, model not called`);
      setRequest({ id, kind: 'declined', question: q, lessonId: null, exerciseId: null, reason: plan.reason });
      return;
    }
    log('router', `"${q}" -> ${plan.route.lessonId} (${plan.route.matched.join(', ')})`);
    // The routed lesson is usually this one; read it otherwise.
    const target = plan.route.lessonId === lessonId && pkgLesson ? pkgLesson : await getLesson(db, plan.route.lessonId);
    if (!target) {
      setRequest({ id, kind: 'declined', question: q, lessonId: plan.route.lessonId, exerciseId: null, reason: `Lesson ${plan.route.lessonId} could not be read.` });
      return;
    }
    const passage = selectPassage(target, q, plan.route.matched);
    log('guidance', `passage (${passage.length} chars): ${passage.slice(0, 60).replace(/\n/g, ' ')}…`);
    setRequest({ id, kind: 'generate', question: q, lessonId: plan.route.lessonId, exerciseId: null, messages: freeQuestionMessages(passage, q), source: lessonSource(target) });
  }, [db, lessonId, pkgLesson, question, routable]);

  const askDisabled = !question.trim() || serviceState === 'busy' || serviceState === 'loading';

  const status = (id: string) => progress?.exercises.find(e => e.exerciseId === id);
  const mark = (id: string): { text: string; tone: 'ok' | 'warn' | 'muted' } => {
    const s = status(id);
    if (!s || s.attempts === 0) {
      return s?.solutionSeen ? { text: 'solution seen', tone: 'warn' } : { text: 'not tried', tone: 'muted' };
    }
    if (s.correct) {
      return { text: 'correct', tone: 'ok' };
    }
    return { text: `${s.attempts} tried`, tone: 'warn' };
  };

  return (
    <KeyboardScrollView contentContainerStyle={ui.screen} keepAbove={110}>
      {error ? <Text style={[ui.body, { color: colors.bad }]}>{error}</Text> : null}
      {lesson ? <LessonView lesson={lesson} onStatus={m => log('lesson', m)} /> : <Text style={ui.muted}>Loading lesson…</Text>}

      <Card>
        <Text style={ui.label}>Practice</Text>
        {progress ? <Text style={ui.body}>{progress.next.reason}</Text> : null}
        {progress?.next.exerciseId ? (
          <Button
            label={`Practise: ${exercises.find(q => q.id === progress.next.exerciseId)?.source_label ?? 'next exercise'}`}
            primary
            onPress={() => onPractice(progress.next.exerciseId as string)}
            testID="lesson-practice-next"
          />
        ) : null}
        {exercises.map((q, i) => {
          const m = mark(q.id);
          return (
            <View key={q.id} style={ui.row}>
              <View style={ui.flex1}>
                <Text style={ui.body}>
                  {i + 1}. {q.source_label}
                </Text>
                <Text style={ui.muted}>
                  p. {q.pages[0]} · {q.difficulty}
                </Text>
              </View>
              <Badge text={m.text} tone={m.tone} />
              <Button label="Open" compact onPress={() => onPractice(q.id)} testID={`lesson-open-${q.id}`} />
            </View>
          );
        })}
      </Card>

      <Card>
        <Text style={ui.label}>Ask about this topic</Text>
        <Text style={ui.muted}>
          The tutor first checks whether a question is covered by the loaded units; questions outside them are declined
          without using the model. In-scope questions get a short generated hint from one passage of the book, which
          takes about a minute on this tablet and can be cancelled.
        </Text>
        <TextInput
          style={ui.input}
          value={question}
          onChangeText={setQuestion}
          placeholder="e.g. How do I multiply (3 + 4i) by (2 − i)?"
          placeholderTextColor={colors.muted}
          autoCorrect={false}
          onSubmitEditing={() => {
            if (!askDisabled) {
              ask().catch(e => setError((e as Error).message));
            }
          }}
          returnKeyType="send"
          testID="ask-input"
        />
        <Button label="Ask the tutor" primary onPress={() => ask().catch(e => setError((e as Error).message))} disabled={askDisabled} testID="ask-button" />
      </Card>
      <GuidancePanel service={guidance} db={db} session={session} request={request} />
    </KeyboardScrollView>
  );
}
