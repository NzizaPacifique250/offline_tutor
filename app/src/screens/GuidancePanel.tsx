/**
 * The one place generated guidance is shown and every guidance outcome is
 * recorded. A screen hands it a request it has already planned through
 * guidance/controller.ts: a prompt to generate from, a declined question, or
 * a stored hint served instead.
 *
 * Generation is paced in steps (guidance/steps.ts): the model writes one
 * step and stops at the next step's heading or at the token cap; the learner
 * tries it, then asks for the next, which resumes the same assistant turn
 * from the cached text; "Explain this step more simply" asks a side question
 * about the last step. The panel streams the text, applies the answer
 * redaction when a key is given, renders finished text with KaTeX, offers
 * Cancel while the model runs, and writes one guidance_events row per
 * generation. Layout and wiring only; the rules live in src/guidance/.
 */

import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { AnswerKey } from '../content/types';
import { recordGuidance, type GuidanceOutcome } from '../guidance/log';
import type { ChatMessage } from '../guidance/prompt';
import { displayCut, promptTokens } from '../guidance/prompt';
import { redactAnswer } from '../guidance/redact';
import type { GuidanceResult, GuidanceService, ServiceState } from '../guidance/service';
import {
  afterStep,
  canAskSimpler,
  canNextStep,
  initialSteps,
  needsAnotherChunk,
  SIMPLER_STOP,
  simplerPrefill,
  stepLabel,
  stopWordsForStep,
  withSimpler,
  type StepState,
} from '../guidance/steps';
import { KatexView } from '../katex/KatexView';
import { generatedHtml } from '../katex/page';
import type { ActiveSession } from '../learner/session';
import type { Executor } from '../learner/store';
import { log } from '../log';
import { Badge, Button, Card, colors, ui } from './ui';

export type PanelRequest = {
  /** A new id starts a new request; the same id is ignored. */
  id: number;
  question: string;
  lessonId: string | null;
  exerciseId: string | null;
} & (
  | { kind: 'generate'; messages: ChatMessage[]; redactKey?: AnswerKey }
  | { kind: 'declined'; reason: string }
  | { kind: 'stored'; note: string }
);

type Phase = 'idle' | 'running' | 'done';
type Running = 'step' | 'simpler' | null;

function describeService(s: ServiceState): string {
  switch (s) {
    case 'idle':
      return 'Tutor model not loaded yet; it loads on the first question (about 3 s).';
    case 'loading':
      return 'Loading the tutor model…';
    case 'ready':
      return 'Tutor model ready.';
    case 'busy':
      return 'Tutor model working…';
    case 'no-model':
      return 'Tutor model not available on this tablet. Stored hints and solutions still work.';
  }
}

function finished(r: GuidanceResult): boolean {
  return r.outcome === 'generated' && !r.stoppedByLimit && !r.stoppedByWord;
}

export function GuidancePanel({
  service,
  db,
  session,
  request,
}: {
  service: GuidanceService;
  db: Executor;
  session: ActiveSession;
  request: PanelRequest | null;
}): React.JSX.Element {
  const [serviceState, setServiceState] = useState<ServiceState>(service.state);
  const [phase, setPhase] = useState<Phase>('idle');
  const [running, setRunning] = useState<Running>(null);
  const [text, setText] = useState('');
  const [simplerText, setSimplerText] = useState('');
  const [result, setResult] = useState<GuidanceResult | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [steps, setSteps] = useState<StepState>(initialSteps());
  const [chunk, setChunk] = useState(1);
  const handled = useRef<number | null>(null);
  const startedAt = useRef(0);
  // The messages as sent and the exercise key, for the steps that follow.
  const conversation = useRef<ChatMessage[]>([]);
  const redactKey = useRef<AnswerKey | undefined>(undefined);

  useEffect(() => service.subscribe(setServiceState), [service]);

  // Elapsed-time ticker while a request runs.
  useEffect(() => {
    if (phase !== 'running') {
      return;
    }
    const h = setInterval(() => setElapsed(Date.now() - startedAt.current), 500);
    return () => clearInterval(h);
  }, [phase]);

  const show = (t: string) => (redactKey.current ? redactAnswer(t, redactKey.current).text : t);

  const save = (outcome: GuidanceOutcome, question: string, body: string, r?: GuidanceResult) => {
    if (!request) {
      return;
    }
    recordGuidance(db, {
      learnerCode: session.learnerCode,
      sessionId: session.sessionId,
      lessonId: request.lessonId,
      exerciseId: request.exerciseId,
      question,
      outcome,
      text: body,
      promptTokens: r?.promptTokens ?? null,
      generatedTokens: r?.generatedTokens ?? null,
      firstTokenMs: r?.firstTokenMs ?? null,
      totalMs: r?.totalMs ?? null,
    })
      .then(id =>
        log(
          'guidance',
          `#${id} ${outcome} "${question.slice(0, 40)}" ${r ? `${r.generatedTokens ?? 0} tok in ${r.totalMs} ms, first ${r.firstTokenMs ?? '-'} ms, prompt ${r.promptTokens ?? '-'} tok (cached ${r.cachedTokens ?? '-'})${r.warmWaitMs > 0 ? `, waited ${r.warmWaitMs} ms for the warm-up` : ''}${r.stoppedByWord ? ', stopped at the next step' : r.stoppedByLimit ? ', stopped at the cap' : ''}` : ''}`,
        ),
      )
      .catch(e => setSaveError(`Could not save: ${(e as Error).message}`));
  };

  const start = (kind: Running) => {
    setPhase('running');
    setRunning(kind);
    startedAt.current = Date.now();
    setElapsed(0);
    setResult(null);
    setSaveError(null);
  };

  useEffect(() => {
    if (!request || handled.current === request.id) {
      return;
    }
    handled.current = request.id;
    setResult(null);
    setText('');
    setSimplerText('');
    setSaveError(null);
    setSteps(initialSteps());
    if (request.kind === 'declined') {
      setPhase('done');
      setNote(request.reason);
      save('declined', request.question, request.reason);
      return;
    }
    if (request.kind === 'stored') {
      setPhase('done');
      setNote(request.note);
      save('stored', request.question, request.note);
      return;
    }
    setNote(null);
    conversation.current = request.messages;
    redactKey.current = request.redactKey;
    log('guidance', `ask "${request.question.slice(0, 40)}" (~${promptTokens(request.messages)} prompt tokens${request.redactKey ? ', redacting the key' : ''}; step 1)`);
    runStep(initialSteps(), request.question);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request]);

  /**
   * Generate one step from the state `from`: chunks of the cap, resuming the
   * assistant turn each time, until the next step's heading, the model's own
   * end, or the chunk bound. The step is shown when it is complete.
   */
  const runStep = (from: StepState, question: string) => {
    const n = from.step + 1;
    const key = redactKey.current;
    let raw = from.raw;
    let part = 1;
    start('step');
    setChunk(1);
    const label = (p: number) => (n === 1 && p === 1 ? question : `(step ${n}${p > 1 ? `, part ${p}` : ''}) ${question}`);
    const one = (): Promise<void> =>
      service
        .ask(conversation.current, t => setText(show(`${raw}${t}`)), { prefill: raw || undefined, stop: stopWordsForStep(n) })
        .then(r => {
          if (key && r.outcome === 'generated') {
            const masked = redactAnswer(r.text, key).masked;
            if (masked > 0) {
              log('guidance', `redacted ${masked} occurrence(s) of the answer from the generated text`);
            }
          }
          save(r.outcome, label(part), show(r.text), r);
          if (r.outcome !== 'generated') {
            setText(show(raw || r.text));
            setResult(r);
            setPhase('done');
            setRunning(null);
            return;
          }
          raw = `${raw}${r.text}`;
          if (needsAnotherChunk(part, r)) {
            part += 1;
            setChunk(part);
            log('guidance', `step ${n} part ${part} (resuming after ${raw.length} characters)`);
            return one();
          }
          const next = afterStep(from, raw.slice(from.raw.length), finished(r));
          setSteps(next);
          setText(r.stoppedByLimit && !r.stoppedByWord ? show(displayCut(raw, from.raw.length).text) : show(raw));
          setResult(r);
          setPhase('done');
          setRunning(null);
        });
    one().catch(e => {
      setPhase('done');
      setRunning(null);
      setNote(`Could not ask: ${(e as Error).message}`);
    });
  };

  const onNextStep = () => {
    if (!request || request.kind !== 'generate' || phase === 'running' || !canNextStep(steps)) {
      return;
    }
    setSimplerText('');
    log('guidance', `step ${steps.step + 1} "${request.question.slice(0, 40)}" (resuming after ${steps.raw.length} characters)`);
    runStep(steps, request.question);
  };

  // A simpler explanation of the last step: the turn resumed with a lead-in
  // sentence, ended at the line break; the main explanation stays put.
  const onSimpler = () => {
    if (!request || request.kind !== 'generate' || phase === 'running' || !canAskSimpler(steps)) {
      return;
    }
    const n = steps.step;
    start('simpler');
    log('guidance', `simpler ${n} "${request.question.slice(0, 40)}"`);
    service
      .ask(conversation.current, t => setSimplerText(show(t)), { prefill: simplerPrefill(steps.raw), stop: SIMPLER_STOP })
      .then(r => {
        const body = show(r.text);
        setSimplerText(body);
        if (r.outcome === 'generated') {
          setSteps(withSimpler(steps, r.text));
        }
        setResult(r);
        setPhase('done');
        setRunning(null);
        save(r.outcome, `(simpler ${n}) ${request.question}`, body, r);
      })
      .catch(e => {
        setPhase('done');
        setRunning(null);
        setNote(`Could not ask: ${(e as Error).message}`);
      });
  };

  const isRunning = phase === 'running';
  const kind = request?.kind ?? null;
  const label = kind === 'generate' ? 'Tutor steps · generated, not reviewed' : kind === 'stored' ? 'Stored hint' : kind === 'declined' ? 'Scope check' : 'Tutor';
  const timing = (r: GuidanceResult) =>
    `${r.generatedTokens ?? 0} tokens in ${(r.totalMs / 1000).toFixed(1)} s (first token ${r.firstTokenMs === null ? '–' : (r.firstTokenMs / 1000).toFixed(1) + ' s'}${r.cachedTokens ? `, ${r.cachedTokens} reused from cache` : ''})`;

  return (
    <Card style={kind === 'generate' ? styles.generated : undefined}>
      <View style={ui.row}>
        <Text style={[ui.label, styles.flex]}>{label}</Text>
        {result ? <Badge text={result.outcome.replace('-', ' ')} tone={result.outcome === 'generated' ? 'ok' : result.outcome === 'no-model' ? 'bad' : 'warn'} /> : null}
      </View>
      <Text style={ui.muted}>{describeService(serviceState)}</Text>
      {request ? <Text style={ui.muted}>Question: {request.question}</Text> : null}
      {note ? <Text style={ui.body}>{note}</Text> : null}
      {isRunning ? (
        <Text style={ui.muted}>
          {serviceState === 'loading' ? 'Loading the model… ' : running === 'simpler' ? 'Putting it more simply… ' : `Working on step ${steps.step + 1}${chunk > 1 ? ` (part ${chunk})` : ''}… `}
          {(elapsed / 1000).toFixed(0)} s{text && running === 'step' ? ` · ${text.length} characters so far` : ''}
        </Text>
      ) : null}
      {text && !isRunning && kind === 'generate' ? (
        <View testID="guidance-text">
          <KatexView html={generatedHtml(text)} minHeight={60} onStatus={m => log('guidance', `render: ${m}`)} />
        </View>
      ) : text ? (
        <View style={styles.textBox} testID="guidance-text">
          <Text style={ui.body}>{text}</Text>
        </View>
      ) : null}
      {simplerText ? (
        <View style={styles.simplerBox} testID="guidance-simpler">
          <Text style={ui.label}>In simpler words</Text>
          {isRunning && running === 'simpler' ? <Text style={ui.body}>{simplerText}</Text> : <KatexView html={generatedHtml(simplerText)} minHeight={40} />}
        </View>
      ) : null}
      {steps.step > 0 && !isRunning ? (
        <Text style={[ui.body, ui.bold]} testID="guidance-step">
          {stepLabel(steps)}
        </Text>
      ) : null}
      {result ? (
        <Text style={ui.muted} testID="guidance-outcome">
          {result.outcome === 'generated' ? `Generated ${timing(result)}.` : result.message}
        </Text>
      ) : null}
      {kind === 'generate' && steps.step > 0 && !isRunning ? (
        <View style={ui.row}>
          {canNextStep(steps) ? <Button label={`Next step (${steps.step + 1})`} primary onPress={onNextStep} testID="guidance-next-step" /> : null}
          {canAskSimpler(steps) ? <Button label="Explain this step more simply" onPress={onSimpler} testID="guidance-simpler-button" /> : null}
        </View>
      ) : null}
      {kind === 'generate' && (text || isRunning) ? (
        <Text style={styles.disclaimer}>This text was produced by the on-device model from one passage of the book. It is not reviewed and is never used to mark your answers.</Text>
      ) : null}
      {saveError ? <Text style={[ui.muted, styles.error]}>{saveError}</Text> : null}
      {isRunning ? (
        <View style={ui.row}>
          <Button label="Cancel" danger onPress={() => service.cancel().catch(() => undefined)} testID="guidance-cancel" />
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  generated: { borderColor: '#6B4FA0', borderLeftWidth: 4 },
  flex: { flex: 1, marginBottom: 0 },
  textBox: { backgroundColor: '#F6F3FB', borderRadius: 6, padding: 10 },
  simplerBox: { backgroundColor: '#FFF6E5', borderRadius: 6, padding: 10, gap: 4 },
  disclaimer: { fontSize: 12, color: '#6B4FA0' },
  error: { color: colors.bad },
});
