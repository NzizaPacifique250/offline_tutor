/**
 * Shared visual vocabulary for the study-flow screens: colours, a button, a
 * card and a few text styles. Layout only; no logic lives here.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

export const colors = {
  bg: '#F4F6F8',
  card: '#FFFFFF',
  tint: '#EDF2F8',
  border: '#D3DCE6',
  text: '#16202B',
  muted: '#6B7A88',
  primary: '#14467E',
  ok: '#1D6B45',
  warn: '#8A5A00',
  bad: '#8A2E2E',
  okBg: '#E6F4EC',
  warnBg: '#FFF6E5',
  badBg: '#FBE9E9',
  infoBg: '#EDF2F8',
};

export function Button({
  label,
  onPress,
  disabled,
  primary,
  danger,
  compact,
  testID,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  primary?: boolean;
  danger?: boolean;
  compact?: boolean;
  testID?: string;
}): React.JSX.Element {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [
        ui.btn,
        compact && ui.btnCompact,
        primary && ui.btnPrimary,
        danger && ui.btnDanger,
        disabled && ui.btnDisabled,
        pressed && !disabled && ui.btnPressed,
      ]}>
      <Text style={[ui.btnText, (primary || danger) && ui.btnTextLight]}>{label}</Text>
    </Pressable>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }): React.JSX.Element {
  return <View style={[ui.card, style]}>{children}</View>;
}

export function Badge({ text, tone = 'muted' }: { text: string; tone?: 'muted' | 'ok' | 'warn' | 'bad' | 'primary' }): React.JSX.Element {
  const bg = { muted: colors.tint, ok: colors.okBg, warn: colors.warnBg, bad: colors.badBg, primary: colors.tint }[tone];
  const fg = { muted: colors.muted, ok: colors.ok, warn: colors.warn, bad: colors.bad, primary: colors.primary }[tone];
  return (
    <View style={[ui.badge, { backgroundColor: bg }]}>
      <Text style={[ui.badgeText, { color: fg }]}>{text}</Text>
    </View>
  );
}

export const ui = StyleSheet.create({
  screen: { padding: 16, paddingBottom: 40, gap: 12 },
  h1: { fontSize: 20, fontWeight: '700', color: colors.text },
  h2: { fontSize: 16, fontWeight: '700', color: colors.text },
  label: { fontSize: 12, fontWeight: '700', color: colors.primary, textTransform: 'uppercase', marginBottom: 6 },
  body: { fontSize: 15, color: colors.text, lineHeight: 22 },
  muted: { fontSize: 13, color: colors.muted, lineHeight: 18 },
  mono: { fontFamily: 'monospace', fontSize: 13, color: colors.text },
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 14,
    gap: 6,
  },
  row: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 18,
    color: colors.text,
  },
  btn: {
    flexGrow: 1,
    flexBasis: 0,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: '#C9D3DD',
    borderRadius: 6,
    paddingVertical: 12,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  btnCompact: { flexGrow: 0, flexBasis: 'auto', paddingVertical: 8 },
  btnPrimary: { backgroundColor: colors.primary, borderColor: colors.primary },
  btnDanger: { backgroundColor: colors.bad, borderColor: colors.bad },
  btnDisabled: { opacity: 0.4 },
  btnPressed: { opacity: 0.7 },
  btnText: { fontSize: 14, fontWeight: '600', color: colors.text },
  btnTextLight: { color: '#FFFFFF' },
  badge: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2, alignSelf: 'flex-start' },
  badgeText: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
  bar: { height: 8, backgroundColor: colors.tint, borderRadius: 4, overflow: 'hidden' },
  barFill: { height: 8, backgroundColor: colors.ok },
  flex1: { flex: 1 },
  bold: { fontWeight: '600' },
  gap4: { gap: 4 },
  feedback: { borderRadius: 6, padding: 10 },
});
