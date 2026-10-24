import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors, Fonts } from '@/constants/theme';
import { ago, attentionLine, STATUS_LABEL, type Attention, type StudentRow, type StudentStatus } from '@/lib/dashboard';

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

/** One student in the "All students" list. */
export function StudentRowCard({
  student: s,
  first,
  onPress,
}: {
  student: StudentRow;
  first: boolean;
  onPress: () => void;
}) {
  const where =
    s.status === 'completed'
      ? 'Finished the path'
      : s.milestone
        ? `Milestone ${s.milestone.number} of ${s.milestone.count} · ${s.milestone.title}`
        : 'Not started';
  const reason = attentionLine(s);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${s.name}. ${reason ?? ''} ${where}. ${s.progress.done} of ${s.progress.total} tasks. Last active ${ago(s.last_activity_at)}.`}
      onPress={onPress}
      style={({ pressed }) => [styles.row, !first && styles.divider, pressed && styles.pressed]}>
      <View style={styles.top}>
        <Text maxFontSizeMultiplier={1.3} style={styles.name} numberOfLines={1}>
          {s.name}
        </Text>
        <StatusPill status={s.status} attention={s.attention} />
      </View>
      {reason ? (
        <Text
          maxFontSizeMultiplier={1.3}
          style={[styles.reason, s.attention === 'blocker' && styles.reasonBlocker]}
          numberOfLines={1}>
          {reason}
        </Text>
      ) : null}
      <Text maxFontSizeMultiplier={1.3} style={styles.where} numberOfLines={1}>
        {where}
      </Text>
      <View style={styles.bottom}>
        <View style={styles.track}>
          <View
            style={[
              styles.fill,
              { width: `${s.progress.total ? Math.min(100, (s.progress.done / s.progress.total) * 100) : 0}%` },
            ]}
          />
        </View>
        <Text maxFontSizeMultiplier={1.2} style={styles.meta}>
          {s.progress.done}/{s.progress.total} · {ago(s.last_activity_at)}
        </Text>
      </View>
    </Pressable>
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
  row: {
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  divider: {
    borderTopWidth: 1,
    borderTopColor: Colors.line,
  },
  pressed: {
    opacity: 0.7,
  },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  name: {
    flex: 1,
    fontFamily: Fonts.bodySemiBold,
    fontSize: 15,
    color: Colors.ink,
  },
  reason: {
    fontFamily: Fonts.bodyMedium,
    fontSize: 13,
    color: Colors.ink,
  },
  reasonBlocker: {
    color: Colors.error,
  },
  where: {
    fontFamily: Fonts.body,
    fontSize: 13,
    color: Colors.inkMuted,
  },
  bottom: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingTop: 2,
  },
  track: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.paper,
    overflow: 'hidden',
  },
  fill: {
    height: 4,
    backgroundColor: Colors.emerald,
  },
  meta: {
    fontFamily: Fonts.mono,
    fontSize: 11,
    color: Colors.inkMuted,
  },
});
