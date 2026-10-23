import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Screen } from '@/components/screen';
import { Body, Headline } from '@/components/text';
import { Wordmark } from '@/components/wordmark';
import { Spacing } from '@/constants/theme';
import { setArrival } from '@/lib/arrival';
import { signOut, useAuth } from '@/lib/auth';

/**
 * Signed in, but with no role in the database and no link. Signing in never makes
 * someone a creator; they have to choose "I'm a creator" and enter their name.
 */
export default function NoAccessScreen() {
  const { failed, refresh } = useAuth();
  const [retrying, setRetrying] = useState(false);

  const onRetry = async () => {
    setRetrying(true);
    await refresh();
    setRetrying(false);
  };

  const onCreator = async () => {
    await setArrival({ role: 'creator' });
    await refresh();
  };

  if (failed) {
    return (
      <Screen
        footer={
          <>
            <Button title="Try again" onPress={onRetry} loading={retrying} />
            <Button variant="link" title="Sign out" onPress={signOut} />
          </>
        }>
        <Wordmark size={36} />
        <View style={styles.message}>
          <Headline>Can’t reach Tavie.</Headline>
          <Body muted>Check your connection and try again.</Body>
        </View>
      </Screen>
    );
  }

  return (
    <Screen
      footer={
        <>
          <Button variant="link" title="I'm a creator" onPress={onCreator} />
          <Button variant="link" title="Sign out" onPress={signOut} />
        </>
      }>
      <Wordmark size={36} />
      <View style={styles.message}>
        <Headline>Ask your coach for your Tavie link.</Headline>
        <Body muted>
          Tavie works through your coach. Open the link they sent you and your plan will be waiting.
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
});
