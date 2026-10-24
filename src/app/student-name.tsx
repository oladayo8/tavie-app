import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { NameFields } from '@/components/name-fields';
import { Screen } from '@/components/screen';
import { Body, Headline, Label } from '@/components/text';
import { Colors, Spacing } from '@/constants/theme';
import { signOut, useAuth } from '@/lib/auth';
import { dataErrorMessage } from '@/lib/errors';
import { cleanName, saveName } from '@/lib/profile';

/**
 * Every student gives their first name before anything else: new students right after signing in,
 * existing students the next time they open the app. Their coach sees this name, never a guess
 * made from their email. The join link stays saved, so Today enrolls them right after.
 */
export default function StudentNameScreen() {
  const { refresh } = useAuth();
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valid = !!cleanName(first, last);

  const onContinue = async () => {
    if (!valid || saving) return;
    setSaving(true);
    setError(null);
    try {
      await saveName('student', first, last);
      // The route guards open Today once the database has the name.
      await refresh();
    } catch (e) {
      setSaving(false);
      setError(dataErrorMessage(e as { message?: string }));
    }
  };

  return (
    <Screen
      footer={
        <>
          <Button title="Continue" onPress={onContinue} loading={saving} disabled={!valid} />
          <Button variant="link" title="Sign out" onPress={signOut} />
        </>
      }>
      <View style={styles.content}>
        <Label>Your profile</Label>
        <Headline>What’s your name?</Headline>
        <Body muted>Your coach sees it next to your progress and check-ins.</Body>
        <NameFields first={first} last={last} onFirst={setFirst} onLast={setLast} onSubmit={onContinue} autoFocus />
        {error ? (
          <Body accessibilityRole="alert" style={styles.error}>
            {error}
          </Body>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: Spacing.three,
    paddingTop: Spacing.five,
  },
  error: {
    color: Colors.error,
  },
});
