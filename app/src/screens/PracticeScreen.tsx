/**
 * One exercise: the prompt from the book, the learner's answer checked on the
 * device against the proven key, hints in stored order, and the solution
 * only after the hints or a correct answer. Every check and reveal is
 * persisted through the learner store. "Ask the tutor" serves the next stored
 * hint while any remain and runs bounded generation, with the answer
 * redacted, only once they are exhausted (guidance/controller.ts). The rules
 * live in study/practice.ts; this file is layout and wiring.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import { checkAnswer } from '../checker/check';
import { answerFormat } from '../checker/format';
import { getExercises } from '../content/service';
import type { PackageExercise } from '../content/types';
import { planExerciseHelp } from '../guidance/controller';
import { exerciseHelpMessages } from '../guidance/prompt';
import type { GuidanceService, ServiceState } from '../guidance/service';
import { KatexView } from '../katex/KatexView';
import { escapeHtml, pageHtml, pagesLabel, rich, stepsHtml } from '../katex/page';
import type { ActiveSession } from '../learner/session';
import { recordAttempt, recordReveal, type Executor } from '../learner/store';
import { log } from '../log';
import { canCheck, canShowHint, canShowSolution, initialPractice, reduce, type PracticeEffect, type PracticeState } from '../study/practice';
import { GuidancePanel, type PanelRequest } from './GuidancePanel';
import { KeyboardScrollView } from './KeyboardScrollView';
import { Badge, Button, Card, colors, ui } from './ui';

export function promptHtml(q: PackageExercise): string {
  return pageHtml(rich(q.prompt), { compact: true });
}

export function solutionHtml(q: PackageExercise): string {
  return pageHtml(`<div class="q">Solution <span class="pg">(${escapeHtml(q.source_label)}, ${pagesLabel(q.pages)})</span></div>` + stepsHtml(q.solution, q.answer.display_tex), {
    compact: true,
  });
}

const toneStyle = {
  ok: { bg: colors.okBg, fg: colors.ok },
  info: { bg: colors.infoBg, fg: colors.primary },
  warn: { bg: colors.warnBg, fg: colors.warn },
  bad: { bg: colors.badBg, fg: colors.bad },
};

export function PracticeScreen({
  db,
  session,
  guidance,
  lessonId,
  exerciseId,
  onNext,
  onBackToLesson,
}: {
  db: Executor;
  session: ActiveSession;
  guidance: GuidanceService;
  lessonId: string;
  exerciseId: string;
  onNext: (exerciseId: string) => void;
  onBackToLesson: () => void;
}): React.JSX.Element {
  const [exercises, setExercises] = useState<PackageExercise[]>([]);
  const [state, setState] = useState<PracticeState | null>(null);
  const [answer, setAnswer] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [request, setRequest] = useState<PanelRequest | null>(null);
  const [serviceState, setServiceState] = useState<ServiceState>(guidance.state);

  useEffect(() => guidance.subscribe(setServiceState), [guidance]);

  useEffect(() => {
    let live = true;
    getExercises(db, lessonId)
      .then(qs => {
        if (!live) {
          return;
        }
        setExercises(qs);
        const q = qs.find(x => x.id === exerciseId);
        if (!q) {
          setError(`Exercise ${exerciseId} is not in this lesson.`);
          return;
        }
        setState(initialPractice(q.id, q.hints.length));
        setAnswer('');
        log('practice', `open ${exerciseId} (${q.hints.length} hints) for ${session.learnerCode}`);
      })
      .catch(e => live && setError((e as Error).message));
    return () => {
      live = false;
    };
  }, [db, lessonId, exerciseId, session.learnerCode]);

  const q = useMemo(() => exercises.find(x => x.id === exerciseId) ?? null, [exercises, exerciseId]);

  // The exercise-help prompt is fixed once the exercise is known: process it
  // while the learner works, so help after the stored hints starts at once.
  useEffect(() => {
    if (!q) {
      return;
    }
    guidance
      .warmUp(exerciseHelpMessages(q))
      .then(r => log('guidance', r.ok ? `exercise warm-up done in ${r.ms} ms (${r.promptTokens} prompt tokens processed)` : `exercise warm-up skipped: ${r.reason}`))
      .catch(e => log('guidance', `warm-up error: ${(e as Error).message}`));
  }, [guidance, q]);
  const index = useMemo(() => exercises.findIndex(x => x.id === exerciseId), [exercises, exerciseId]);
  const next = index >= 0 && index + 1 < exercises.length ? exercises[index + 1] : null;
  const prompt = useMemo(() => (q ? promptHtml(q) : ''), [q]);
  const format = useMemo(() => (q ? answerFormat(q.answer) : null), [q]);
  const solution = useMemo(() => (q ? solutionHtml(q) : ''), [q]);

  const persist = useCallback(
    async (effects: PracticeEffect[]) => {
      for (const e of effects) {
        const base = { learnerCode: session.learnerCode, sessionId: session.sessionId, lessonId, exerciseId };
        if (e.type === 'record-attempt') {
          const id = await recordAttempt(db, { ...base, answer: e.input, verdict: e.verdict, hintsSeen: e.hintsSeen });
          log('practice', `attempt #${id} ${exerciseId} "${e.input}" -> ${e.verdict} (hints seen ${e.hintsSeen})`);
        } else if (e.kind === 'hint') {
          const id = await recordReveal(db, { ...base, kind: 'hint', hintIndex: e.hintIndex });
          log('practice', `reveal #${id} hint ${e.hintIndex + 1} on ${exerciseId}`);
        } else {
          const id = await recordReveal(db, { ...base, kind: 'solution', hintIndex: null });
          log('practice', `reveal #${id} solution on ${exerciseId}`);
        }
      }
    },
    [db, exerciseId, lessonId, session],
  );

  const dispatch = useCallback(
    (action: Parameters<typeof reduce>[1]) => {
      if (!state) {
        return;
      }
      const r = reduce(state, action);
      setState(r.state);
      persist(r.effects).catch(e => setError(`Could not save: ${(e as Error).message}`));
    },
    [persist, state],
  );

  const check = useCallback(() => {
    if (!q) {
      return;
    }
    const result = checkAnswer(q.answer, answer);
    if (result.verdict === 'unsupported') {
      log('checker', `unsupported "${result.input}": ${result.reason}`);
    }
    dispatch({ type: 'check', result, instruction: format?.instruction });
  }, [answer, dispatch, format, q]);

  const askTutor = useCallback(() => {
    if (!q || !state) {
      return;
    }
    const plan = planExerciseHelp(state);
    const id = Date.now();
    const base = { id, question: `help with ${q.source_label}`, lessonId, exerciseId: q.id };
    if (plan.kind === 'stored') {
      dispatch({ type: 'hint' });
      setRequest({ ...base, kind: 'stored', note: `Hint ${plan.hintIndex + 1} of ${q.hints.length} shown from the book instead of generating. The tutor generates only once every stored hint has been seen.` });
    } else if (plan.kind === 'generate') {
      setRequest({ ...base, kind: 'generate', messages: exerciseHelpMessages(q), redactKey: q.answer });
    }
  }, [dispatch, lessonId, q, state]);

  if (error) {
    return (
      <ScrollView contentContainerStyle={ui.screen}>
        <Text style={[ui.body, { color: colors.bad }]}>{error}</Text>
        <Button label="Back to lesson" onPress={onBackToLesson} />
      </ScrollView>
    );
  }
  if (!q || !state) {
    return (
      <ScrollView contentContainerStyle={ui.screen}>
        <Text style={ui.muted}>Loading exercise…</Text>
      </ScrollView>
    );
  }

  const checking = canCheck(state);
  const fb = state.feedback;

  return (
    <KeyboardScrollView contentContainerStyle={ui.screen} keepAbove={150}>
      <View style={ui.wrap}>
        <Badge text={`Exercise ${index + 1} of ${exercises.length}`} tone="primary" />
        <Badge text={q.difficulty} />
        <Badge text={q.review.status} tone={q.review.status === 'teacher-reviewed' ? 'ok' : 'warn'} />
      </View>
      <Text style={ui.h2}>{q.source_label}</Text>
      <Text style={ui.muted}>REB Student's Book, {pagesLabel(q.pages)}</Text>

      <KatexView key={q.id} html={prompt} minHeight={80} onStatus={m => log('practice', `prompt: ${m}`)} />

      <Card>
        <Text style={ui.label}>Your answer</Text>
        <TextInput
          style={ui.input}
          value={answer}
          onChangeText={setAnswer}
          placeholder={format?.placeholder}
          placeholderTextColor={colors.muted}
          autoCapitalize="none"
          autoCorrect={false}
          editable={checking}
          onSubmitEditing={checking ? check : undefined}
          returnKeyType="done"
          testID="answer-input"
        />
        {fb ? (
          <View style={[ui.feedback, { backgroundColor: toneStyle[fb.tone].bg }]} testID="feedback">
            <Text style={[ui.body, ui.bold, { color: toneStyle[fb.tone].fg }]}>{fb.text}</Text>
          </View>
        ) : null}
        {!checking && state.solutionShown && !state.solved ? (
          <Text style={ui.muted}>The solution is open, so this exercise is no longer checked. Try the next one.</Text>
        ) : null}
        <View style={ui.row}>
          <Button label="Check answer" primary onPress={check} disabled={!checking} testID="check-button" />
          <Button
            label={canShowHint(state) ? `Show hint ${state.hintsShown + 1} of ${state.hintCount}` : 'No more hints'}
            onPress={() => dispatch({ type: 'hint' })}
            disabled={!canShowHint(state)}
            testID="hint-button"
          />
        </View>
        <Text style={ui.muted}>
          {state.attempts.length === 0 ? 'No attempts yet.' : `${state.attempts.length} attempt(s) this visit.`}
        </Text>
      </Card>

      {planExerciseHelp(state).kind !== 'none' ? (
        <View style={ui.row}>
          <Button
            label={planExerciseHelp(state).kind === 'stored' ? 'Ask the tutor (next stored hint)' : 'Ask the tutor (generated)'}
            onPress={askTutor}
            disabled={serviceState === 'busy' || serviceState === 'loading'}
            testID="ask-tutor"
          />
        </View>
      ) : null}
      {request ? <GuidancePanel service={guidance} db={db} session={session} request={request} /> : null}

      {state.hintsShown > 0 ? (
        <Card style={{ backgroundColor: colors.warnBg }}>
          <Text style={ui.label}>Hints</Text>
          {q.hints.slice(0, state.hintsShown).map((h, i) => (
            <Text key={i} style={ui.body}>
              {i + 1}. {h}
            </Text>
          ))}
        </Card>
      ) : null}

      <Card>
        <Text style={ui.label}>Solution</Text>
        {state.solutionShown ? (
          <KatexView html={solution} minHeight={120} onStatus={m => log('practice', `solution: ${m}`)} />
        ) : (
          <>
            <Text style={ui.muted}>
              {canShowSolution(state)
                ? 'Open the worked solution from the book.'
                : 'Available after all the hints, or after a correct answer.'}
            </Text>
            <Button label="Show solution" onPress={() => dispatch({ type: 'solution' })} disabled={!canShowSolution(state)} testID="solution-button" />
          </>
        )}
      </Card>

      <View style={ui.row}>
        <Button label="Back to lesson" onPress={onBackToLesson} testID="practice-back" />
        {next ? <Button label="Next exercise" primary={state.solved || state.solutionShown} onPress={() => onNext(next.id)} testID="practice-next" /> : null}
      </View>
    </KeyboardScrollView>
  );
}
