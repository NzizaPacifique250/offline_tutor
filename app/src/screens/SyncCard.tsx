/**
 * The signed-in account's sync switch and status, shown under the topic
 * list. Sync is off until the account holder turns it on; while on, the app
 * sends this account's records whenever it has internet (sync/engine.ts),
 * and studying never waits for it. Layout and wiring only.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { getAccount, setSyncEnabled, type Account } from '../account/store';
import type { Executor } from '../learner/store';
import { formatWhen } from '../learner/time';
import { Badge, Button, Card, colors, ui } from './ui';

export function SyncCard({
  db,
  userId,
  syncNow,
}: {
  db: Executor;
  userId: string;
  /** Runs one sync of every account that has it on; resolves when done. */
  syncNow: () => Promise<void>;
}): React.JSX.Element | null {
  const [account, setAccount] = useState<Account | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(() => getAccount(db, userId).then(setAccount), [db, userId]);

  useEffect(() => {
    reload().catch(() => undefined);
  }, [reload]);

  const toggle = useCallback(async () => {
    if (!account) {
      return;
    }
    await setSyncEnabled(db, userId, !account.syncEnabled);
    await reload();
  }, [account, db, reload, userId]);

  const run = useCallback(async () => {
    setBusy(true);
    try {
      await syncNow();
    } finally {
      await reload();
      setBusy(false);
    }
  }, [reload, syncNow]);

  if (!account) {
    return null;
  }
  const pendingTeacher = account.role === 'student' && account.requestedRole === 'teacher';
  return (
    <Card>
      <Text style={ui.label}>Account and sync</Text>
      <View style={ui.wrap}>
        <Text style={ui.body}>
          {account.fullName || account.email} · {account.learnerCode}
        </Text>
        <Badge text={account.syncEnabled ? 'Sync on' : 'Sync off'} tone={account.syncEnabled ? 'ok' : 'muted'} />
        {pendingTeacher ? <Badge text="Teacher request awaiting approval" tone="warn" /> : null}
      </View>
      <Text style={ui.muted}>
        {account.syncEnabled
          ? "Whenever this tablet has internet, it sends your progress, answers and tutor questions to the school's server, where your teachers can follow them. Studying never waits for it."
          : "Your work stays on this tablet. Turn sync on to send your progress, answers and tutor questions to the school's server whenever there is internet."}
      </Text>
      {account.lastSyncError ? (
        <Text style={[ui.muted, { color: colors.bad }]}>Last attempt: {account.lastSyncError}</Text>
      ) : null}
      {account.lastSyncAt ? <Text style={ui.muted}>Last synced {formatWhen(account.lastSyncAt)}.</Text> : null}
      <View style={ui.row}>
        <Button label={account.syncEnabled ? 'Turn sync off' : 'Turn sync on'} onPress={toggle} testID="sync-toggle" />
        <Button label={busy ? 'Syncing…' : 'Sync now'} primary disabled={!account.syncEnabled || busy} onPress={run} testID="sync-now" />
      </View>
    </Card>
  );
}
