import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Screen } from '@/components/screen';
import { SetupNotice } from '@/components/setup-notice';
import { Body, Headline, Label } from '@/components/text';
import { TextField } from '@/components/text-field';
import { Colors, Spacing } from '@/constants/theme';
import { getArrival, type Arrival } from '@/lib/arrival';
import { authErrorMessage } from '@/lib/errors';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function SignInScreen() {
  const [arrival, setArrivalState] = useState<Arrival | null>(null);
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getArrival().then(setArrivalState);
  }, []);

  const trimmed = email.trim().toLowerCase();
  const valid = EMAIL.test(trimmed);

  const onSend = async () => {
    if (!supabase || !valid) return;
    setSending(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOtp({
      email: trimmed,
      options: { shouldCreateUser: true },
    });
    setSending(false);
    if (error) {
      setError(authErrorMessage(error));
      return;
    }
    router.push({ pathname: '/verify', params: { email: trimmed } });
  };

  return (
    <Screen
      footer={
        <>
          <Button title="Send code" onPress={onSend} loading={sending} disabled={!valid || !isSupabaseConfigured} />
          {router.canGoBack() ? <Button variant="link" title="Back" onPress={() => router.back()} /> : null}
        </>
      }>
      <View style={styles.content}>
        <Label>{arrival?.role === 'student' ? 'Join your coach' : 'Creator sign in'}</Label>
        <Headline>What’s your email?</Headline>
        <Body muted>We’ll send you a one-time code. No password needed.</Body>
        {!isSupabaseConfigured ? <SetupNotice /> : null}
        <TextField
          label="Email"
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          textContentType="emailAddress"
          returnKeyType="send"
          onSubmitEditing={onSend}
          autoFocus
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
