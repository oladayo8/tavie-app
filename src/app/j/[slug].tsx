import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Screen } from '@/components/screen';
import { Body, Headline, Label } from '@/components/text';
import { Wordmark } from '@/components/wordmark';
import { Spacing } from '@/constants/theme';
import { setArrival } from '@/lib/arrival';
import { useAuth } from '@/lib/auth';

/**
 * A creator's share link (tavie.ai/j/<slug>). Arriving here makes someone a student.
 * Milestone 3 replaces this with the creator's branded join and two-question onboarding.
 */
export default function JoinScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { session, refresh } = useAuth();

  const onContinue = async () => {
    await setArrival({ role: 'student', slug });
    if (session) {
      // Already signed in: the database lookup decides where they land.
      await refresh();
      router.replace('/student');
      return;
    }
    router.push('/sign-in');
  };

  return (
    <Screen footer={<Button title="Continue" onPress={onContinue} />}>
      <Wordmark size={28} />
      <View style={styles.message}>
        <Label>Your coach’s link</Label>
        <Headline>You’re joining {slug}.</Headline>
        <Body muted>Sign in with your email and your first task will be ready.</Body>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  message: {
    flex: 1,
    justifyContent: 'center',
    gap: Spacing.three,
  },
});
