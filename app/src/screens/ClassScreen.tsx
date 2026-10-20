/**
 * Class progress, inside Teacher tools: every learner code on this tablet
 * and on the tablets that sent their progress (sharing/), with their
 * progress in each unit, each unit's progress across the class, and the
 * learners who have stopped on an exercise after repeated mistakes.
 * Computed from the saved records when the screen opens; works offline.
 * Layout and wiring only; the figures come from teacher/classProgress.ts.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { LessonSummary } from '../content/service';
import { formatWhen } from '../learner/time';
import type { Executor } from '../learner/store';
import { log } from '../log';
import { removeReceived } from '../sharing/store';
import { loadClassProgress, type ClassSummary } from '../teacher/classProgress';
import { statusTone } from './TopicsScreen';
import { Badge, Button, Card, colors, ui } from './ui';

/** "U4" for a lesson of package rw-s6-am.u4. */
function unitTag(packageId: string): string {
  const m = /\.u(\d+)$/.exec(packageId);
  return m ? `U${m[1]}` : packageId;
}

const percent = (x: number) => `${Math.round(x * 100)}%`;

export function ClassScreen({
  db,
  lessons,
  onLearner,
}: {
  db: Executor;
  lessons: LessonSummary[];
  onLearner: (code: string) => void;
}): React.JSX.Element {
  const [summary, setSummary] = useState<ClassSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const tags = useMemo(() => new Map(lessons.map(l => [l.id, unitTag(l.packageId)])), [lessons]);

  useEffect(() => {
    let live = true;
    const t0 = Date.now();
    loadClassProgress(db, lessons)
      .then(s => {
        if (live) {
          setSummary(s);
          log('teacher', `class view: ${s.learners} learners from ${s.tablets.length} tablet(s), ${s.attempts} answers, in ${Date.now() - t0} ms`);
        }
      })
      .catch(e => live && setError((e as Error).message));
    return () => {
      live = false;
    };
  }, [db, lessons, reload]);

  const remove = useCallback(
    async (id: string, label: string) => {
      if (confirmRemove !== id) {
        setConfirmRemove(id);
        return;
      }
      await removeReceived(db, id);
      log('teacher', `removed the progress received from ${label}`);
      setConfirmRemove(null);
      setReload(n => n + 1);
    },
    [confirmRemove, db],
  );

  return (
    <ScrollView contentContainerStyle={ui.screen}>
      <Text style={ui.h1}>Class progress</Text>
      <Text style={ui.muted}>
        Every learner on this tablet and on the tablets that sent their progress, computed when this screen opens. It works offline.
      </Text>
      {error ? <Text style={[ui.body, { color: colors.bad }]}>{error}</Text> : null}
      {!summary && !error ? <Text style={ui.muted}>Reading the records…</Text> : null}

      {summary && summary.learners === 0 ? (
        <Card>
          <Text style={ui.body}>No learner has used this tablet yet.</Text>
        </Card>
      ) : null}

      {summary && summary.learners > 0 ? (
        <>
          <Card>
            <Text style={ui.label}>Tablets</Text>
            {summary.tablets.map(t => (
              <View key={t.id} style={ui.row} testID={`class-tablet-${t.label}`}>
                <View style={ui.flex1}>
                  <Text style={ui.body}>
                    {t.label}
                    {t.local ? ' (this tablet)' : ''} · {t.learners} learner{t.learners === 1 ? '' : 's'}
                  </Text>
                  {!t.local && t.exportedAt && t.receivedAt ? (
                    <Text style={ui.muted}>
                      sent {formatWhen(t.exportedAt)}, received {formatWhen(t.receivedAt)}
                    </Text>
                  ) : null}
                </View>
                {!t.local ? (
                  <Button
                    label={confirmRemove === t.id ? 'Tap again to remove' : 'Remove'}
                    compact
                    danger={confirmRemove === t.id}
                    onPress={() => remove(t.id, t.label).catch(e => setError((e as Error).message))}
                    testID={`class-remove-${t.label}`}
                  />
                ) : null}
              </View>
            ))}
            {summary.tablets.length === 1 ? (
              <Text style={ui.muted}>To see students on other tablets, send their progress here: Teacher tools, Share this tablet's progress, on each of them.</Text>
            ) : null}
            {summary.unknownExercises > 0 ? (
              <Text style={ui.muted}>
                {summary.unknownExercises} exercise record{summary.unknownExercises === 1 ? '' : 's'} from other tablets do not match this tablet's lessons
                (a different content version) and are left out.
              </Text>
            ) : null}
          </Card>

          <Card>
            <Text style={ui.body} testID="class-totals">
              {summary.learners} learner{summary.learners === 1 ? '' : 's'} · {summary.attempts} answers checked · {summary.hints} hints · {summary.aiRequests} AI
              tutor requests
            </Text>
          </Card>

          <Card>
            <Text style={ui.label}>By unit</Text>
            {summary.units.map(u => (
              <View key={u.lessonId} style={styles.unit} testID={`class-unit-${u.lessonId}`}>
                <Text style={[ui.body, ui.bold]}>
                  {tags.get(u.lessonId) ?? ''} {u.title}
                </Text>
                <Text style={ui.muted}>
                  Started by {u.started} of {u.learners} · mastered by {u.mastered}
                  {u.averageMastery !== null ? ` · average ${percent(u.averageMastery)} for those who started` : ''}
                </Text>
                <View style={ui.bar}>
                  <View style={[ui.barFill, { width: `${Math.round((u.averageMastery ?? 0) * 100)}%` }]} />
                </View>
                {u.hardest ? (
                  <Text style={ui.muted}>
                    Most wrong answers: {u.hardest.label} ({u.hardest.wrong} wrong
                    {u.hardest.stuck ? `; ${u.hardest.stuck} learner${u.hardest.stuck === 1 ? '' : 's'} stuck` : ''})
                  </Text>
                ) : null}
              </View>
            ))}
          </Card>

          <Card>
            <Text style={ui.label}>Learners</Text>
            <Text style={ui.muted}>Tap a learner to see their answers, hints and tutor requests.</Text>
            {summary.rows.map(r => (
              <Pressable
                key={r.code}
                onPress={() => onLearner(r.code)}
                accessibilityRole="button"
                testID={`class-learner-${r.code}`}
                style={styles.learner}
              >
                <View style={ui.row}>
                  <Text style={[ui.body, ui.bold, ui.flex1]}>{r.code}</Text>
                  {r.stuckOn.length > 0 ? <Badge text="needs help" tone="warn" /> : null}
                  <Text style={ui.muted}>last seen {formatWhen(r.lastSeenAt)}</Text>
                </View>
                <View style={ui.wrap}>
                  {r.units.map(u => (
                    <Badge key={u.lessonId} text={`${tags.get(u.lessonId) ?? ''} ${u.correct}/${u.total}`} tone={statusTone(u.status)} />
                  ))}
                </View>
                <Text style={ui.muted}>
                  {r.correct} of {r.total} correct · {r.attempts} answers · {r.hints} hints · {r.solutions} solutions · {r.aiRequests} AI requests
                </Text>
                {r.stuckOn.length > 0 ? <Text style={ui.muted}>Stuck on: {r.stuckOn.join('; ')}</Text> : null}
                {summary.tablets.length > 1 ? <Text style={ui.muted}>on {r.sources.join(' and ')}</Text> : null}
              </Pressable>
            ))}
          </Card>
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  unit: { gap: 4, marginBottom: 8 },
  learner: { paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.border, gap: 4 },
});
