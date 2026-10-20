/**
 * Learner-code selection: the first screen of a study session.
 *
 * Codes are short labels, never names. Existing codes are listed from
 * SQLite, most recently seen first; a new code is typed and validated by
 * learner/store.normaliseCode. Layout and wiring only.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { listLearners, normaliseCode, type Executor, type Learner } from '../learner/store';
import { formatWhen } from '../learner/time';
import { KeyboardScrollView } from './KeyboardScrollView';
import { Button, Card, colors, ui } from './ui';

export function LearnerScreen({
  db,
  contentLine,
  onChoose,
  onTeacher,
}: {
  db: Executor;
  contentLine: string;
  onChoose: (code: string) => void;
  onTeacher: () => void;
}): React.JSX.Element {
  const [learners, setLearners] = useState<Learner[]>([]);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    listLearners(db)
      .then(list => live && setLearners(list))
      .catch(e => live && setError(`Could not read learners: ${(e as Error).message}`));
    return () => {
      live = false;
    };
  }, [db]);

  const start = useCallback(() => {
    const code = normaliseCode(draft);
    if (!code) {
      setError('Use 1 to 12 letters, digits or hyphens, for example A1 or S6-07.');
      return;
    }
    setError(null);
    onChoose(code);
  }, [draft, onChoose]);

  return (
    <KeyboardScrollView contentContainerStyle={ui.screen}>
      <Text style={ui.h1}>Who is studying?</Text>
      <Text style={ui.muted}>
        Choose your learner code. A code is a label such as A1, not a name; the tablet stores no personal data, and
        everything stays on this device.
      </Text>

      {learners.length > 0 ? (
        <Card>
          <Text style={ui.label}>Continue as</Text>
          {learners.map(l => (
            <View key={l.code} style={ui.row}>
              <View style={ui.flex1}>
                <Text style={ui.body}>{l.code}</Text>
                <Text style={ui.muted}>last seen {formatWhen(l.lastSeenAt)}</Text>
              </View>
              <Button label="Continue" compact primary onPress={() => onChoose(l.code)} testID={`learner-${l.code}`} />
            </View>
          ))}
        </Card>
      ) : null}

      <Card>
        <Text style={ui.label}>New learner code</Text>
        <TextInput
          style={ui.input}
          value={draft}
          onChangeText={setDraft}
          placeholder="e.g. A1"
          placeholderTextColor={colors.muted}
          autoCapitalize="characters"
          autoCorrect={false}
          onSubmitEditing={start}
          returnKeyType="go"
          testID="learner-input"
        />
        {error ? <Text style={[ui.muted, { color: colors.bad }]}>{error}</Text> : null}
        <Button label="Start" primary onPress={start} disabled={!draft.trim()} testID="learner-start" />
      </Card>

      <Text style={ui.muted}>{contentLine}</Text>
      <View style={ui.row}>
        <Button label="Teacher tools" compact onPress={onTeacher} testID="learner-teacher" />
      </View>
    </KeyboardScrollView>
  );
}
