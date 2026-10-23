import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Body } from '@/components/text';
import { Colors, Spacing } from '@/constants/theme';

export function Loading({ label = 'Loading' }: { label?: string }) {
  return (
    <View style={styles.center} accessibilityLabel={label}>
      <ActivityIndicator color={Colors.emerald} />
    </View>
  );
}

/** A plain error with Try again. */
export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <View style={styles.center}>
      <Body accessibilityRole="alert" style={styles.error}>
        {message}
      </Body>
      <Button variant="secondary" title="Try again" onPress={onRetry} />
    </View>
  );
}

/** An inline error line, e.g. under a form after a failed save. */
export function ErrorText({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <Body accessibilityRole="alert" style={styles.error}>
      {message}
    </Body>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.five,
  },
  error: {
    color: Colors.error,
  },
});
