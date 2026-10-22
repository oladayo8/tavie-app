import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Screen } from '@/components/screen';
import { Body, Headline, Label } from '@/components/text';
import { Wordmark } from '@/components/wordmark';
import { Spacing } from '@/constants/theme';
import { signOut, useAuth } from '@/lib/auth';

/** Creator home. Milestone 2 puts the builder here. */
export default function CreatorHome() {
  const { session } = useAuth();
  return (
    <Screen footer={<Button variant="secondary" title="Sign out" onPress={signOut} />}>
      <Wordmark size={28} />
      <View style={styles.content}>
        <Label>Creator</Label>
        <Headline>You’re in. Your builder is next.</Headline>
        <Body muted>
          Signed in as {session?.user.email}. Soon you’ll set your course goal here and turn it into a path your
          students can follow.
        </Body>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    justifyContent: 'center',
    gap: Spacing.three,
  },
});
