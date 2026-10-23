import { router, useLocalSearchParams } from 'expo-router';
import { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Screen } from '@/components/screen';
import { ErrorState, Loading } from '@/components/states';
import { Body, Headline, Label } from '@/components/text';
import { Wordmark } from '@/components/wordmark';
import { Spacing } from '@/constants/theme';
import { setArrival } from '@/lib/arrival';
import { useAuth } from '@/lib/auth';
import { getJoinInfo } from '@/lib/student';
import { useLoad } from '@/lib/use-load';

/**
 * A creator's share link (tavie.ai/j/<slug>). Shows the live program's public facts, and the
 * consent line, before sign-in. Continuing makes someone a student; the Today screen enrolls them.
 */
export default function JoinScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { session, refresh } = useAuth();
  const load = useCallback(() => getJoinInfo(slug), [slug]);
  const { data: info, loading, error, retry } = useLoad(load);

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

  if (!info && (loading || error)) {
    return (
      <Screen>
        <Wordmark size={28} />
        {error ? <ErrorState message={error} onRetry={retry} /> : <Loading />}
      </Screen>
    );
  }

  if (!info) {
    return (
      <Screen>
        <View style={styles.message}>
          <Label>Your coach’s link</Label>
          <Headline>This link isn’t active.</Headline>
          <Body muted>Ask your coach for a new link.</Body>
        </View>
        <Label style={styles.powered}>Powered by Tavie</Label>
      </Screen>
    );
  }

  return (
    <Screen
      footer={
        <>
          <Body muted style={styles.consent}>
            {info.firstName} can see your progress and check-ins.
          </Body>
          <Button title="Continue" onPress={onContinue} />
          <Label style={styles.powered}>Powered by Tavie</Label>
        </>
      }>
      <View style={styles.message}>
        <Label>{info.creatorName}</Label>
        <Headline>{info.title}</Headline>
        {info.goal !== info.title ? <Body>{info.goal}</Body> : null}
        <Body muted>
          {info.agentName} will tell you exactly what to do next, one task at a time. Sign in with your email to get
          your first task.
        </Body>
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
  consent: {
    textAlign: 'center',
  },
  powered: {
    textAlign: 'center',
    paddingTop: Spacing.two,
  },
});
