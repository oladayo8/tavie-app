import { useCallback } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/button';
import { Screen } from '@/components/screen';
import { Label } from '@/components/text';
import { Colors, Fonts } from '@/constants/theme';
import { signOut, useAuth } from '@/lib/auth';
import { getPath } from '@/lib/student';
import { useLoad } from '@/lib/use-load';

/** The student's account: who they're signed in as, the program they joined, and Sign out. */
export default function ProfileScreen() {
  const { session } = useAuth();
  const load = useCallback(() => getPath(), []);
  const { data } = useLoad(load);
  const coach = data ? [data.creator.first_name, data.creator.last_name].filter(Boolean).join(' ') : null;

  return (
    <Screen tab>
      <Text accessibilityRole="header" maxFontSizeMultiplier={1.3} style={styles.title}>
        Profile
      </Text>
      <View style={styles.content}>
        <View style={styles.card}>
          <Item label="Signed in as" value={session?.user.email ?? '–'} />
          {data ? (
            <>
              <Item label="Program" value={data.program.title} divider />
              {coach ? <Item label="Coach" value={coach} divider /> : null}
              <Item
                label="Joined"
                value={new Date(data.joined_at).toLocaleDateString(undefined, {
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric',
                })}
                divider
              />
            </>
          ) : null}
        </View>
        {data && coach ? (
          <Text maxFontSizeMultiplier={1.3} style={styles.small}>
            {data.creator.first_name} can see your progress and check-ins in this program.
          </Text>
        ) : null}
        <Button variant="secondary" title="Sign out" onPress={signOut} />
        <Label style={styles.powered}>Powered by Tavie</Label>
      </View>
    </Screen>
  );
}

function Item({ label, value, divider }: { label: string; value: string; divider?: boolean }) {
  return (
    <View style={[styles.item, divider && styles.divider]}>
      <Label>{label}</Label>
      <Text maxFontSizeMultiplier={1.3} style={styles.value}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  title: {
    fontFamily: Fonts.display,
    fontSize: 26,
    lineHeight: 30,
    letterSpacing: -0.5,
    color: Colors.ink,
    paddingBottom: 16,
  },
  content: {
    gap: 14,
  },
  card: {
    borderRadius: 16,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.line,
  },
  item: {
    gap: 4,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  divider: {
    borderTopWidth: 1,
    borderTopColor: Colors.line,
  },
  value: {
    fontFamily: Fonts.bodyMedium,
    fontSize: 16,
    lineHeight: 21,
    color: Colors.ink,
  },
  small: {
    fontFamily: Fonts.body,
    fontSize: 13,
    lineHeight: 18,
    color: Colors.inkMuted,
  },
  powered: {
    textAlign: 'center',
    paddingTop: 8,
    fontSize: 10,
  },
});
