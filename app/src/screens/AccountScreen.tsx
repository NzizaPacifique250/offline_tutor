/**
 * The first screen: sign in with a personal account, or create one.
 *
 * Signing in tries the server and falls back to the tablet when there is no
 * internet (account/auth.ts). Accounts already used on this tablet are
 * listed so a learner can pick theirs. Studying without an account (the
 * learner-code screen) and Teacher tools by PIN stay available, so the
 * tablet still works for a class with no accounts. Layout and wiring only.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { AuthError, OfflineError, signIn, signUp, type AuthRemote } from '../account/auth';
import { listAccounts, type Account } from '../account/store';
import type { Executor } from '../learner/store';
import { KeyboardScrollView } from './KeyboardScrollView';
import { Badge, Button, Card, colors, ui } from './ui';

type Mode = 'sign-in' | 'create';

function roleLabel(a: Account): string {
  if (a.role === 'student' && a.requestedRole === 'teacher') {
    return 'Teacher (awaiting approval)';
  }
  return a.role === 'admin' ? 'Admin' : a.role === 'teacher' ? 'Teacher' : 'Student';
}

export function AccountScreen({
  db,
  remote,
  contentLine,
  onSignedIn,
  onWithoutAccount,
  onTeacher,
}: {
  db: Executor;
  remote: AuthRemote;
  contentLine: string;
  onSignedIn: (account: Account, online: boolean) => void;
  onWithoutAccount: () => void;
  onTeacher: () => void;
}): React.JSX.Element {
  const [mode, setMode] = useState<Mode>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [teacher, setTeacher] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; bad: boolean } | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);

  useEffect(() => {
    let live = true;
    listAccounts(db)
      .then(list => live && setAccounts(list))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [db]);

  const explain = (e: unknown) =>
    setMessage({ text: e instanceof AuthError || e instanceof OfflineError ? e.message : `Could not sign in: ${(e as Error).message}`, bad: true });

  const submit = useCallback(async () => {
    setBusy(true);
    setMessage(null);
    try {
      if (mode === 'sign-in') {
        const r = await signIn(db, remote, email, password);
        onSignedIn(r.account, r.online);
      } else {
        const r = await signUp(db, remote, { email, password, fullName, requestedRole: teacher ? 'teacher' : 'student' });
        if (r.kind === 'confirm-email') {
          setMode('sign-in');
          setMessage({ text: 'Account created. Open the confirmation email we sent, then sign in here.', bad: false });
        } else {
          onSignedIn(r.account, true);
        }
      }
    } catch (e) {
      explain(e);
    } finally {
      setBusy(false);
    }
  }, [db, email, fullName, mode, onSignedIn, password, remote, teacher]);

  const creating = mode === 'create';
  const ready = email.trim() && password && (!creating || fullName.trim());

  return (
    <KeyboardScrollView contentContainerStyle={ui.screen}>
      <Text style={ui.h1}>{creating ? 'Create an account' : 'Sign in'}</Text>
      <Text style={ui.muted}>
        {creating
          ? 'Creating an account needs the internet. After that, the account also signs in on this tablet with no connection.'
          : 'Sign in with your account. Once an account has signed in on this tablet, it signs in again here without the internet.'}
      </Text>

      <Card>
        {creating ? (
          <>
            <Text style={ui.label}>Full name</Text>
            <TextInput style={ui.input} value={fullName} onChangeText={setFullName} autoComplete="name" testID="account-name" />
          </>
        ) : null}
        <Text style={ui.label}>Email</Text>
        <TextInput
          style={ui.input}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          keyboardType="email-address"
          placeholder="name@example.com"
          placeholderTextColor={colors.muted}
          testID="account-email"
        />
        <Text style={ui.label}>Password</Text>
        <TextInput
          style={ui.input}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
          autoComplete={creating ? 'new-password' : 'current-password'}
          placeholder={creating ? 'at least 8 characters' : undefined}
          placeholderTextColor={colors.muted}
          onSubmitEditing={ready && !busy ? submit : undefined}
          testID="account-password"
        />
        {creating ? (
          <>
            <Text style={ui.label}>I am a</Text>
            <View style={ui.row}>
              <Button label="Student" primary={!teacher} onPress={() => setTeacher(false)} testID="account-student" />
              <Button label="Teacher" primary={teacher} onPress={() => setTeacher(true)} testID="account-teacher" />
            </View>
            {teacher ? (
              <Text style={ui.muted}>An admin approves teacher accounts. Until then the account works as a student account.</Text>
            ) : null}
          </>
        ) : null}
        {message ? <Text style={[ui.body, { color: message.bad ? colors.bad : colors.ok }]}>{message.text}</Text> : null}
        <View style={ui.row}>
          <Button
            label={busy ? 'Please wait…' : creating ? 'Create account' : 'Sign in'}
            primary
            disabled={!ready || busy}
            onPress={submit}
            testID="account-submit"
          />
        </View>
        <Pressable
          onPress={() => {
            setMode(creating ? 'sign-in' : 'create');
            setMessage(null);
          }}
          accessibilityRole="button"
          testID="account-mode">
          <Text style={[ui.body, ui.bold, { color: colors.primary }]}>
            {creating ? 'I already have an account' : 'New here? Create an account'}
          </Text>
        </Pressable>
      </Card>

      {accounts.length > 0 && !creating ? (
        <Card>
          <Text style={ui.label}>Signed in on this tablet before</Text>
          {accounts.map(a => (
            <Pressable key={a.userId} onPress={() => setEmail(a.email)} accessibilityRole="button" testID={`account-${a.learnerCode}`}>
              <View style={[ui.row, styles.accountRow]}>
                <View style={styles.accountText}>
                  <Text style={ui.body}>{a.fullName || a.email}</Text>
                  <Text style={ui.muted}>
                    {a.email} · {a.learnerCode}
                  </Text>
                </View>
                <Badge text={roleLabel(a)} tone={a.role === 'student' ? 'muted' : 'primary'} />
              </View>
            </Pressable>
          ))}
        </Card>
      ) : null}

      <View style={ui.row}>
        <Button label="Continue without an account" onPress={onWithoutAccount} testID="account-without" />
        <Button label="Teacher tools (PIN)" onPress={onTeacher} testID="account-teacher-tools" />
      </View>
      <Text style={ui.muted}>
        Without an account, progress stays on this tablet under a learner code and is never synced. {contentLine}
      </Text>
    </KeyboardScrollView>
  );
}

const styles = StyleSheet.create({
  accountRow: { justifyContent: 'space-between', paddingVertical: 6 },
  accountText: { flexShrink: 1 },
});
