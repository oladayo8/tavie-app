import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Screen } from '@/components/screen';
import { Body, Headline, Label } from '@/components/text';
import { Spacing } from '@/constants/theme';
import { getArrival } from '@/lib/arrival';
import { signOut } from '@/lib/auth';

/**
 * Student home. Milestone 3 puts the Today card here.
 * Student-facing screens carry the creator's brand; Tavie is only "Powered by Tavie".
 */
export default function StudentHome() {
  const [slug, setSlug] = useState<string | null>(null);

  useEffect(() => {
    getArrival().then((a) => setSlug(a?.role === 'student' ? a.slug : null));
  }, []);

  return (
    <Screen
      footer={
        <>
          <Button variant="secondary" title="Sign out" onPress={signOut} />
          <Label style={styles.powered}>Powered by Tavie</Label>
        </>
      }>
      <View style={styles.content}>
        <Label>Today</Label>
        <Headline>You’re in.</Headline>
        <Body muted>{slug ? `Your plan for ${slug} will show up here.` : 'Your plan will show up here.'}</Body>
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
  powered: {
    textAlign: 'center',
    paddingTop: Spacing.two,
  },
});
