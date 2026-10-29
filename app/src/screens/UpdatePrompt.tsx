/**
 * The pop-up that offers lesson updates. App.tsx shows it on the sign-in,
 * learner-code and topic screens, never during a lesson or an exercise, and
 * installs through src/updates/; this is layout and wiring only.
 */

import React, { useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { ContentVersion } from '../content/service';
import { describeRelease, type Release } from '../updates/releases';
import { Button, colors, ui } from './ui';

export type InstallSummary = { installed: string[]; problems: string[] };

type Phase = { kind: 'offer' } | { kind: 'installing' } | { kind: 'done'; summary: InstallSummary };

export function UpdatePrompt({
  releases,
  installed,
  onInstall,
  onLater,
  onClose,
}: {
  releases: Release[];
  installed: ContentVersion[];
  onInstall: () => Promise<InstallSummary>;
  onLater: () => void;
  onClose: () => void;
}): React.JSX.Element {
  const [phase, setPhase] = useState<Phase>({ kind: 'offer' });
  const versionOf = (packageId: string) => installed.find(v => v.packageId === packageId)?.version;

  const install = async () => {
    setPhase({ kind: 'installing' });
    try {
      setPhase({ kind: 'done', summary: await onInstall() });
    } catch (e) {
      setPhase({ kind: 'done', summary: { installed: [], problems: [(e as Error).message || String(e)] } });
    }
  };

  return (
    <Modal transparent animationType="fade" visible onRequestClose={phase.kind === 'installing' ? () => {} : onLater}>
      <View style={styles.backdrop}>
        <View style={styles.panel} accessibilityViewIsModal testID="update-prompt">
          {phase.kind === 'done' ? (
            <>
              <Text style={ui.h1}>{phase.summary.installed.length ? 'Lessons updated' : 'The update did not install'}</Text>
              {phase.summary.installed.map(line => (
                <Text key={line} style={ui.body}>
                  ✓ {line}
                </Text>
              ))}
              {phase.summary.installed.length ? (
                <Text style={ui.muted}>The new lessons are in the topic list. Saved progress is kept.</Text>
              ) : null}
              {phase.summary.problems.map(line => (
                <Text key={line} style={[ui.body, { color: colors.bad }]}>
                  {line}
                </Text>
              ))}
              <View style={ui.row}>
                {phase.summary.problems.length ? <Button label="Try again" onPress={install} testID="update-retry" /> : null}
                <Button label="Close" primary onPress={onClose} testID="update-close" />
              </View>
            </>
          ) : (
            <>
              <Text style={ui.h1}>New lessons are ready</Text>
              <Text style={ui.muted}>
                Updated lessons have been published for this tablet. Installing takes a few seconds and keeps all saved progress.
              </Text>
              <ScrollView style={styles.list} contentContainerStyle={ui.gap4}>
                {releases.map(r => (
                  <View key={r.id} style={styles.item}>
                    <Text style={[ui.body, ui.bold]}>{describeRelease(r, versionOf(r.packageId))}</Text>
                    {r.notes ? <Text style={ui.muted}>{r.notes}</Text> : null}
                  </View>
                ))}
              </ScrollView>
              <View style={ui.row}>
                <Button label="Later" onPress={onLater} disabled={phase.kind === 'installing'} testID="update-later" />
                <Button
                  label={phase.kind === 'installing' ? 'Installing…' : 'Update now'}
                  primary
                  onPress={install}
                  disabled={phase.kind === 'installing'}
                  testID="update-now"
                />
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(22, 32, 43, 0.45)', justifyContent: 'center', padding: 24 },
  panel: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: 560,
    backgroundColor: colors.card,
    borderRadius: 10,
    padding: 20,
    gap: 12,
  },
  list: { maxHeight: 260 },
  item: { backgroundColor: colors.tint, borderRadius: 6, padding: 10, gap: 2 },
});
