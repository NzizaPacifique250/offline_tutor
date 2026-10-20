/**
 * Progress and history for the active learner: per-lesson mastery computed
 * from stored attempts, the recommended next activity, and the attempt log.
 * Nothing here is stored; it is all derived from SQLite on entry.
 */

import React, { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import type { LessonSummary } from '../content/service';
import { countOutcomes, listGuidance, summariseOutcomes, type GuidanceEvent } from '../guidance/log';
import type { LessonProgress } from '../learner/progress';
import { loadProgress } from '../learner/session';
import { listAttempts, type AttemptRecord, type Executor } from '../learner/store';
import { formatWhen } from '../learner/time';
import { log } from '../log';
import { statusLabel, statusTone } from './TopicsScreen';
import { Badge, Button, Card, colors, ui } from './ui';

const verdictTone = { correct: 'ok', wrong: 'bad', unsupported: 'muted', empty: 'muted' } as const;

export function ProgressScreen({
  db,
  learnerCode,
  lessons,
  onPractice,
}: {
  db: Executor;
  learnerCode: string;
  lessons: LessonSummary[];
  /** Absent when a teacher views a learner from Class progress: read-only. */
  onPractice?: (lessonId: string, exerciseId: string) => void;
}): React.JSX.Element {
  const [progress, setProgress] = useState<LessonProgress[]>([]);
  const [history, setHistory] = useState<AttemptRecord[]>([]);
  const [tutor, setTutor] = useState<{ summary: string; recent: GuidanceEvent[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    const t0 = Date.now();
    Promise.all([loadProgress(db, learnerCode, lessons), listAttempts(db, learnerCode), countOutcomes(db, learnerCode), listGuidance(db, learnerCode)])
      .then(([p, a, c, g]) => {
        if (!live) {
          return;
        }
        setProgress(p);
        setHistory([...a].reverse());
        setTutor({ summary: summariseOutcomes(c), recent: [...g].reverse().slice(0, 8) });
        log('progress', `${learnerCode}: ${a.length} attempts, ${p.map(x => `${x.lessonId} ${x.correct}/${x.total} ${x.status}`).join('; ')}, tutor ${summariseOutcomes(c)} in ${Date.now() - t0} ms`);
      })
      .catch(e => live && setError((e as Error).message));
    return () => {
      live = false;
    };
  }, [db, learnerCode, lessons]);

  const label = (exerciseId: string) => progress.flatMap(p => p.exercises).find(e => e.exerciseId === exerciseId)?.label ?? exerciseId;

  return (
    <ScrollView contentContainerStyle={ui.screen}>
      <Text style={ui.h1}>Progress for {learnerCode}</Text>
      <Text style={ui.muted}>
        {onPractice ? 'Computed from the attempts saved on this tablet. Nothing leaves the device.' : 'Viewed from Teacher tools. Computed from the attempts saved on this tablet.'}
      </Text>
      {error ? <Text style={[ui.body, { color: colors.bad }]}>{error}</Text> : null}

      {progress.map(p => (
        <Card key={p.lessonId}>
          <Text style={ui.h2}>{p.title}</Text>
          <View style={ui.wrap}>
            <Badge text={statusLabel(p.status)} tone={statusTone(p.status)} />
            <Badge text={`${Math.round(p.mastery * 100)}% mastery`} tone="primary" />
          </View>
          <View style={ui.bar}>
            <View style={[ui.barFill, { width: `${Math.round(p.mastery * 100)}%` }]} />
          </View>
          <Text style={ui.muted}>
            {p.correct} of {p.total} exercises correct · {p.attempts} attempts · {p.hints} hints · {p.solutions} solutions
            {p.lastActivity ? ` · last activity ${formatWhen(p.lastActivity)}` : ''}
          </Text>
          {p.exercises.map(e => (
            <View key={e.exerciseId} style={ui.row}>
              <Text style={[ui.body, ui.flex1]}>{e.label}</Text>
              <Badge
                text={e.correct ? 'correct' : e.attempts > 0 ? `${e.wrong} wrong` : e.solutionSeen ? 'solution seen' : 'not tried'}
                tone={e.correct ? 'ok' : e.attempts > 0 ? 'warn' : 'muted'}
              />
              <Text style={ui.muted}>{e.hintsSeen} hints</Text>
            </View>
          ))}
          <Text style={[ui.body, ui.bold]}>{p.next.reason}</Text>
          {p.next.exerciseId && onPractice ? (
            <Button label={`Practise: ${label(p.next.exerciseId)}`} primary onPress={() => onPractice(p.lessonId, p.next.exerciseId as string)} testID="progress-practice" />
          ) : null}
        </Card>
      ))}

      <Card>
        <Text style={ui.label}>Tutor requests</Text>
        <Text style={ui.body}>{tutor ? tutor.summary : '…'}</Text>
        <Text style={ui.muted}>Generated text is recorded apart from your attempts and never counts towards mastery.</Text>
        {tutor?.recent.map(e => (
          <View key={e.id} style={ui.row}>
            <View style={ui.flex1}>
              <Text style={ui.body}>{e.question}</Text>
              <Text style={ui.muted}>
                {formatWhen(e.createdAt)}
                {e.outcome === 'generated' && e.totalMs !== null ? ` · ${e.generatedTokens ?? 0} tokens in ${(e.totalMs / 1000).toFixed(0)} s` : ''}
              </Text>
            </View>
            <Badge text={e.outcome.replace('-', ' ')} tone={e.outcome === 'generated' ? 'ok' : e.outcome === 'stored' || e.outcome === 'declined' ? 'muted' : 'warn'} />
          </View>
        ))}
      </Card>

      <Card>
        <Text style={ui.label}>History</Text>
        {history.length === 0 ? <Text style={ui.muted}>No attempts saved yet.</Text> : null}
        {history.slice(0, 40).map(a => (
          <View key={a.id} style={ui.row}>
            <View style={ui.flex1}>
              <Text style={ui.body}>{label(a.exerciseId)}</Text>
              <Text style={ui.muted}>
                {formatWhen(a.createdAt)} · answered "{a.answer}" · {a.hintsSeen} hints seen
              </Text>
            </View>
            <Badge text={a.verdict} tone={verdictTone[a.verdict]} />
          </View>
        ))}
        {history.length > 40 ? <Text style={ui.muted}>… and {history.length - 40} earlier attempts.</Text> : null}
      </Card>
    </ScrollView>
  );
}
