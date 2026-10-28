/**
 * The sign-in screen over real SQLite (sql.js) with a fake server: signing
 * in, the message when an unknown account tries offline, creating a teacher
 * account, and the routes that need no account.
 */

import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { OfflineError, type AuthRemote } from '../src/account/auth';
import { ensureAccountSchema, type Account } from '../src/account/store';
import { ensureLearnerSchema } from '../src/learner/store';
import { AccountScreen } from '../src/screens/AccountScreen';

const { makeSqlDb } = require('../jest/sqljs-db');

const USER = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

function texts(root: ReactTestRenderer.ReactTestInstance): string {
  return root
    .findAllByType(require('react-native').Text)
    .map(t => (Array.isArray(t.props.children) ? t.props.children.join('') : String(t.props.children ?? '')))
    .join('\n');
}
function byId(root: ReactTestRenderer.ReactTestInstance, testID: string, prop: string) {
  const hit = root.findAllByProps({ testID }).find(n => n.props[prop] !== undefined);
  if (!hit) {
    throw new Error(`no element with testID ${testID} and prop ${prop}`);
  }
  return hit;
}
const press = (root: ReactTestRenderer.ReactTestInstance, id: string) => byId(root, id, 'onPress').props.onPress();
const type = (root: ReactTestRenderer.ReactTestInstance, id: string, text: string) => byId(root, id, 'onChangeText').props.onChangeText(text);
const flush = () =>
  act(async () => {
    await new Promise<void>(r => setTimeout(() => r(), 0));
  });

const online = (meta: string[] = []): AuthRemote => ({
  async signUp(_e, _p, m) {
    meta.push(m.requestedRole);
    return { userId: USER, refreshToken: 'r0' };
  },
  async signIn() {
    return { userId: USER, refreshToken: 'r1' };
  },
  async profile() {
    return { role: 'student', requestedRole: meta[0] === 'teacher' ? 'teacher' : 'student', fullName: 'Aline', learnerCode: 'S-AAAAAA' };
  },
});

async function render(remote: AuthRemote, handlers: Partial<{ onSignedIn: jest.Mock; onWithoutAccount: jest.Mock; onTeacher: jest.Mock }> = {}) {
  const db = await makeSqlDb();
  await ensureLearnerSchema(db);
  await ensureAccountSchema(db);
  const h = { onSignedIn: jest.fn(), onWithoutAccount: jest.fn(), onTeacher: jest.fn(), ...handlers };
  let r!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    r = ReactTestRenderer.create(<AccountScreen db={db} remote={remote} contentLine="4 lessons" {...h} />);
  });
  await flush();
  return { db, r, h };
}

describe('AccountScreen', () => {
  it('signs in and hands the account on', async () => {
    const { db, r, h } = await render(online());
    await act(async () => type(r.root, 'account-email', 'aline@example.com'));
    await act(async () => type(r.root, 'account-password', 'correct horse'));
    await act(async () => press(r.root, 'account-submit'));
    await flush();
    expect(h.onSignedIn).toHaveBeenCalledTimes(1);
    const [account, wasOnline] = h.onSignedIn.mock.calls[0] as [Account, boolean];
    expect(wasOnline).toBe(true);
    expect(account).toMatchObject({ email: 'aline@example.com', learnerCode: 'S-AAAAAA', syncEnabled: false });
    db.close();
  });

  it('explains why an unknown account cannot sign in offline', async () => {
    const remote: AuthRemote = {
      ...online(),
      async signIn() {
        throw new OfflineError('No internet connection.');
      },
    };
    const { db, r, h } = await render(remote);
    await act(async () => type(r.root, 'account-email', 'new@example.com'));
    await act(async () => type(r.root, 'account-password', 'whatever1'));
    await act(async () => press(r.root, 'account-submit'));
    await flush();
    expect(h.onSignedIn).not.toHaveBeenCalled();
    expect(texts(r.root)).toContain('has not signed in on this tablet before');
    db.close();
  });

  it('creates a teacher account, which starts as a student awaiting approval', async () => {
    const asked: string[] = [];
    const { db, r, h } = await render(online(asked));
    await act(async () => press(r.root, 'account-mode'));
    expect(texts(r.root)).toContain('Create an account');
    await act(async () => type(r.root, 'account-name', 'Mr Habimana'));
    await act(async () => type(r.root, 'account-email', 'teacher@example.com'));
    await act(async () => type(r.root, 'account-password', 'correct horse'));
    await act(async () => press(r.root, 'account-teacher'));
    expect(texts(r.root)).toContain('An admin approves teacher accounts');
    await act(async () => press(r.root, 'account-submit'));
    await flush();
    expect(asked).toEqual(['teacher']);
    const [account] = h.onSignedIn.mock.calls[0] as [Account, boolean];
    expect(account).toMatchObject({ role: 'student', requestedRole: 'teacher' });
    db.close();
  });

  it('keeps studying without an account and Teacher tools by PIN', async () => {
    const { db, r, h } = await render(online());
    await act(async () => press(r.root, 'account-without'));
    await act(async () => press(r.root, 'account-teacher-tools'));
    expect(h.onWithoutAccount).toHaveBeenCalledTimes(1);
    expect(h.onTeacher).toHaveBeenCalledTimes(1);
    expect(texts(r.root)).toContain('never synced');
    db.close();
  });
});
