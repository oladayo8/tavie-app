import { StyleSheet, Text, View } from 'react-native';

import { Colors, Fonts } from '@/constants/theme';
import { STATUS_LABEL, type Attention, type StudentStatus } from '@/lib/dashboard';

/** Progressing (green), Needs attention (red for a blocker, ink for inactive), Completed (forest). */
export function StatusPill({ status, attention }: { status: StudentStatus; attention: Attention }) {
  const label = STATUS_LABEL[status];
  const tone =
    status === 'completed'
      ? styles.completed
      : status === 'progressing'
        ? styles.progressing
        : attention === 'blocker'
          ? styles.blocker
          : styles.inactive;
  return (
    <View style={[styles.pill, tone]} accessibilityLabel={label}>
      <Text maxFontSizeMultiplier={1.2} style={[styles.pillText, tone === styles.completed && styles.pillTextLight]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  pillText: {
    fontFamily: Fonts.mono,
    fontSize: 10,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: Colors.ink,
  },
  pillTextLight: {
    color: Colors.white,
  },
  progressing: {
    backgroundColor: 'rgba(95, 216, 160, 0.3)',
  },
  blocker: {
    backgroundColor: '#FBE4E1',
  },
  inactive: {
    backgroundColor: Colors.paper,
    borderWidth: 1,
    borderColor: Colors.ink,
  },
  completed: {
    backgroundColor: Colors.forest,
  },
});
