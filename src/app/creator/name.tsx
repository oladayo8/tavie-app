import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Screen } from '@/components/screen';
import { Body, Headline, Label } from '@/components/text';
import { TextField } from '@/components/text-field';
import { Colors, Spacing } from '@/constants/theme';
import { signOut, useAuth } from '@/lib/auth';
import { dataErrorMessage } from '@/lib/errors';
import { supabase } from '@/lib/supabase';

/**
 * The explicit creator step. Only someone who tapped "I'm a creator" reaches it,
 * and only this screen's Continue makes them a creator in the database.
 */
export default function CreatorNameScreen() {
  const { refresh } = useAuth();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const first = firstName.trim();
  const valid = first.length > 0 && first.length <= 60 && lastName.trim().length <= 60;

  const onContinue = async () => {
    if (!supabase || !valid) return;
    setSaving(true);
    setError(null);
    const { error } = await supabase.rpc('register_creator', { first_name: first, last_name: lastName.trim() });
    if (error) {
      setSaving(false);
      setError(dataErrorMessage(error));
      return;
    }
    // The route guards move to the creator side once the database says so.
    await refresh();
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
        <Label>Creator</Label>
        <Headline>What’s your name?</Headline>
        <Body muted>Students see it on their plan, so use the name they know you by.</Body>
        <TextField
          label="First name"
          value={firstName}
          onChangeText={setFirstName}
          placeholder="Marcus"
          autoCapitalize="words"
          autoComplete="given-name"
          textContentType="givenName"
          maxLength={60}
          returnKeyType="next"
          autoFocus
        />
        <TextField
          label="Last name"
          value={lastName}
          onChangeText={setLastName}
          placeholder="Reed"
          autoCapitalize="words"
          autoComplete="family-name"
          textContentType="familyName"
          maxLength={60}
          returnKeyType="done"
          onSubmitEditing={onContinue}
        />
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
