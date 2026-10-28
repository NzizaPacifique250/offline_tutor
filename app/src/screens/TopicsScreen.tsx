/**
 * The topic list: one card per lesson in the imported packages, with the
 * learner's progress on it and the recommended next activity.
 */

import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import type { ContentVersion, LessonSummary } from '../content/service';
import type { LessonProgress } from '../learner/progress';
import { loadProgress } from '../learner/session';
import type { Executor } from '../learner/store';
import { Badge, Button, Card, colors, ui } from './ui';

export function statusTone(status: LessonProgress['status']): 'muted' | 'warn' | 'ok' {
  return status === 'mastered' ? 'ok' : status === 'in-progress' ? 'warn' : 'muted';
}

export function statusLabel(status: LessonProgress['status']): string {
  return status === 'mastered' ? 'Mastered' : status === 'in-progress' ? 'In progress' : 'Not started';
}

export function TopicsScreen({
  db,
  learnerCode,
  lessons,
  versions,
  onOpenLesson,
  onProgress,
  onTeacher,
  footer,
}: {
  db: Executor;
  learnerCode: string;
  lessons: LessonSummary[];
  versions: ContentVersion[];
  onOpenLesson: (lessonId: string) => void;
  onProgress: () => void;
  /** Given for a teacher or admin account: Teacher tools without the PIN. */
  onTeacher?: () => void;
  /** Shown under the list, for example the account's sync card. */
  footer?: React.ReactNode;
}): React.JSX.Element {
  // Null until the learner's progress is read, so each card is drawn once at
  // its final size. On the IT-801B, cards below the fold that grew when
  // progress arrived kept their old size on screen, and a tap on one lesson
  // could open another (offline test, 28 October).
  const [progress, setProgress] = useState<Map<string, LessonProgress> | null>(null);

  useEffect(() => {
    let live = true;
    setProgress(null);
    loadProgress(db, learnerCode, lessons)
      .then(p => live && setProgress(new Map(p.map(x => [x.lessonId, x]))))
      .catch(() => live && setProgress(new Map()));
    return () => {
      live = false;
    };
  }, [db, learnerCode, lessons]);

  const unitTitle = (packageId: string) => versions.find(v => v.packageId === packageId);

  return (
    <ScrollView contentContainerStyle={ui.screen}>
      <Text style={ui.h1}>Topics</Text>
      <Text style={ui.muted}>Senior Six Advanced Mathematics, from the REB Student's Book. Everything below works offline.</Text>

      {lessons.length === 0 ? <Text style={ui.body}>No lessons are loaded.</Text> : null}
      {progress === null && lessons.length > 0 ? <Text style={ui.muted}>Reading your progress…</Text> : null}
      {progress !== null && lessons.map(l => {
        const unit = unitTitle(l.packageId);
        const p = progress.get(l.id);
        return (
          <Pressable key={l.id} onPress={() => onOpenLesson(l.id)} testID={`topic-${l.id}`}>
            <Card>
              <Text style={ui.muted}>{unit ? `Unit ${unit.unit}: ${unit.unitTitle}` : l.packageId}</Text>
              <Text style={ui.h2}>{l.title}</Text>
              <Text style={ui.muted}>{l.objective}</Text>
              <View style={ui.wrap}>
                <Badge text={`${l.exerciseCount} exercises`} />
                <Badge text={l.reviewStatus} tone={l.reviewStatus === 'teacher-reviewed' ? 'ok' : 'warn'} />
                {p ? <Badge text={statusLabel(p.status)} tone={statusTone(p.status)} /> : null}
              </View>
              {p ? (
                <View style={ui.gap4}>
                  <View style={ui.bar}>
                    <View style={[ui.barFill, { width: `${Math.round(p.mastery * 100)}%` }]} />
                  </View>
                  <Text style={ui.muted}>
                    {p.correct} of {p.total} exercises correct · {p.next.reason}
                  </Text>
                </View>
              ) : null}
              <Text style={[ui.body, ui.bold, { color: colors.primary }]}>Open lesson ›</Text>
            </Card>
          </Pressable>
        );
      })}

      <View style={ui.row}>
        <Button label="My progress" onPress={onProgress} testID="topics-progress" />
        {onTeacher ? <Button label="Teacher tools" onPress={onTeacher} testID="topics-teacher" /> : null}
      </View>
      {footer}
    </ScrollView>
  );
}
