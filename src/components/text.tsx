import { StyleSheet, Text, type TextProps } from 'react-native';

import { Colors, Fonts } from '@/constants/theme';

/** Bricolage Grotesque 800, for headlines. */
export function Headline({ style, ...props }: TextProps) {
  return <Text accessibilityRole="header" style={[styles.headline, style]} {...props} />;
}

/** Instrument Sans, for body copy. */
export function Body({ style, muted, ...props }: TextProps & { muted?: boolean }) {
  return <Text style={[styles.body, muted && styles.muted, style]} {...props} />;
}

/** JetBrains Mono, uppercase, for small labels. */
export function Label({ style, ...props }: TextProps) {
  return <Text style={[styles.label, style]} {...props} />;
}

const styles = StyleSheet.create({
  headline: {
    fontFamily: Fonts.display,
    fontSize: 34,
    lineHeight: 38,
    letterSpacing: -0.8,
    color: Colors.ink,
  },
  body: {
    fontFamily: Fonts.body,
    fontSize: 17,
    lineHeight: 25,
    color: Colors.ink,
  },
  muted: {
    color: Colors.inkMuted,
  },
  label: {
    fontFamily: Fonts.mono,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: Colors.inkMuted,
  },
});
