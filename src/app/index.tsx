import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Screen } from '@/components/screen';
import { Body, Headline } from '@/components/text';
import { Wordmark } from '@/components/wordmark';
import { Spacing } from '@/constants/theme';
import { setArrival } from '@/lib/arrival';

/** Shown when the app is opened without a creator's share link. */
export default function NoLinkScreen() {
  const onCreator = async () => {
    await setArrival({ role: 'creator' });
    router.push('/sign-in');
  };

  return (
    <Screen footer={<Button variant="link" title="I'm a creator" onPress={onCreator} />}>
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
