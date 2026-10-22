import { StyleSheet, View } from 'react-native';

import { Body, Label } from '@/components/text';
import { Colors, Radius, Spacing } from '@/constants/theme';

/** Shown in development when the Supabase keys are missing from `.env`. */
export function SetupNotice() {
  return (
    <View style={styles.box}>
      <Label>Setup needed</Label>
      <Body>
        Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to a .env file, then restart Expo.
      </Body>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Radius.card,
    borderWidth: 1.5,
    borderColor: Colors.ink,
    backgroundColor: Colors.white,
  },
});
