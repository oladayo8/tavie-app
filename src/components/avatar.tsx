import { StyleSheet, Text, View } from 'react-native';

import { Colors, Fonts } from '@/constants/theme';
import { initials } from '@/lib/dashboard';

type Tone = 'forest' | 'mint' | 'alert' | 'quiet';

const TONES: Record<Tone, { bg: string; fg: string }> = {
  forest: { bg: Colors.forest, fg: Colors.mint },
  mint: { bg: 'rgba(95, 216, 160, 0.3)', fg: Colors.forest },
  alert: { bg: '#FBE4E1', fg: Colors.error },
  quiet: { bg: '#F6EBD9', fg: '#8A5A12' },
};

/** A round badge with someone's initials. */
export function Avatar({
  name,
  tone = 'forest',
  size = 44,
  ring,
}: {
  name: string;
  tone?: Tone;
  size?: number;
  ring?: boolean;
}) {
  const t = TONES[tone];
  return (
    <View
      style={[
        styles.circle,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: t.bg },
        ring && styles.ring,
      ]}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden>
      <Text maxFontSizeMultiplier={1.1} style={[styles.text, { color: t.fg, fontSize: size * 0.36 }]}>
        {initials(name)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  circle: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    borderWidth: 3,
    borderColor: 'rgba(95, 216, 160, 0.45)',
  },
  text: {
    fontFamily: Fonts.bodySemiBold,
  },
});
