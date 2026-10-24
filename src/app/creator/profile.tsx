import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { Button } from '@/components/button';
import { NameEditor } from '@/components/name-editor';
import { Screen } from '@/components/screen';
import { ErrorState, Loading } from '@/components/states';
import { Label } from '@/components/text';
import { TopBar } from '@/components/top-bar';
import { Colors, Fonts } from '@/constants/theme';
import { signOut } from '@/lib/auth';
import { fullName, getProfile, type MyProfile } from '@/lib/profile';
import { useLoad } from '@/lib/use-load';

/**
 * The creator's profile and settings, opened from their avatar on Overview: their name (which
 * students see on the plan), the email they sign in with, and Sign out.
 */
export default function CreatorProfileScreen() {
  const load = useCallback(() => getProfile('creator'), []);
  const { data, error, retry } = useLoad(load);
  const [saved, setSaved] = useState<MyProfile | null>(null);
  const me = saved ?? data;

  if (!me) {
    return (
      <Screen>
        <TopBar parent="/creator" />
        {error ? <ErrorState message={error} onRetry={retry} /> : <Loading label="Loading your profile" />}
      </Screen>
    );
  }

  const name = fullName(me);

  return (
    <Screen>
      <TopBar parent="/creator" />
      <View style={styles.head}>
        <Avatar name={name} size={72} ring />
        <View style={styles.flex}>
          <Text accessibilityRole="header" maxFontSizeMultiplier={1.3} style={styles.name} numberOfLines={2}>
            {name}
          </Text>
          <Text maxFontSizeMultiplier={1.3} style={styles.email} numberOfLines={1} ellipsizeMode="middle">
            {me.email}
          </Text>
        </View>
      </View>

      <Label style={styles.section}>Profile</Label>
      <View style={styles.card}>
        <NameEditor role="creator" profile={me} onSaved={setSaved} />
        <View style={[styles.item, styles.divider]}>
          <Label>Email</Label>
          <Text maxFontSizeMultiplier={1.3} style={styles.value} numberOfLines={1} ellipsizeMode="middle">
            {me.email}
          </Text>
          <Text maxFontSizeMultiplier={1.3} style={styles.hint}>
            You sign in with this email. Students see your name, not your email.
          </Text>
        </View>
      </View>

      <Label style={styles.section}>Account</Label>
      <Button variant="secondary" title="Sign out" onPress={signOut} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingTop: 8,
    paddingBottom: 8,
  },
  flex: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    fontFamily: Fonts.display,
    fontSize: 24,
    lineHeight: 28,
    letterSpacing: -0.4,
    color: Colors.ink,
  },
  email: {
    fontFamily: Fonts.body,
    fontSize: 14,
    color: Colors.inkMuted,
    marginTop: 4,
  },
  section: {
    marginTop: 24,
    marginBottom: 10,
  },
  card: {
    borderRadius: 20,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.line,
    overflow: 'hidden',
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
  hint: {
    fontFamily: Fonts.body,
    fontSize: 13,
    lineHeight: 18,
    color: Colors.inkMuted,
    marginTop: 2,
  },
});
