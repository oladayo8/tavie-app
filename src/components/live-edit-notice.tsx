import { StyleSheet, Text, View } from 'react-native';

import { Colors, Fonts } from '@/constants/theme';
import type { ProgramStatus } from '@/lib/program';

/**
 * Shown while editing a published path. Edits never undo what students finished or delete their
 * check-ins, but a task added before where a student is becomes their next task.
 */
export function LiveEditNotice({ status }: { status: ProgramStatus }) {
  if (status === 'draft') return null;
  return (
    <View style={styles.box} accessibilityRole="alert">
      <Text maxFontSizeMultiplier={1.3} style={styles.title}>
        This path is {status === 'paused' ? 'paused' : 'live'}. Students keep everything they’ve done.
      </Text>
      <Text maxFontSizeMultiplier={1.3} style={styles.body}>
        Changes show up for them right away. A task you add before where a student is becomes their next task. Removing
        a task archives it; their check-ins stay.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    gap: 4,
    marginBottom: 12,
    padding: 14,
    borderRadius: 16,
    backgroundColor: 'rgba(95, 216, 160, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(11, 122, 80, 0.35)',
  },
  title: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 14,
    lineHeight: 19,
    color: Colors.forest,
  },
  body: {
    fontFamily: Fonts.body,
    fontSize: 13,
    lineHeight: 18,
    color: Colors.forest,
  },
});
