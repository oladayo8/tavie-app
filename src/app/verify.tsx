import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Screen } from '@/components/screen';
import { Body, Headline, Label } from '@/components/text';
import { TextField } from '@/components/text-field';
import { Colors, Fonts, Spacing } from '@/constants/theme';
import { authErrorMessage } from '@/lib/errors';
import { supabase } from '@/lib/supabase';

const RESEND_SECONDS = 60;
// Supabase codes are 6 digits by default; the length is configurable up to 10.
const MIN_CODE = 6;
const MAX_CODE = 10;

export default function VerifyScreen() {
  const { email } = useLocalSearchParams<{ email: string }>();
  const [code, setCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(RESEND_SECONDS);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  const onVerify = async () => {
    if (!supabase || code.length < MIN_CODE) return;
    setVerifying(true);
    setError(null);
    const { error } = await supabase.auth.verifyOtp({ email, token: code, type: 'email' });
    // On success the auth listener updates the session and the route guards take over.
    if (error) {
      setVerifying(false);
      setError(authErrorMessage(error));
    }
  };

  const onResend = async () => {
    if (!supabase) return;
    setError(null);
    setNotice(null);
    const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
    if (error) {
      setError(authErrorMessage(error));
      return;
    }
    setCooldown(RESEND_SECONDS);
    setNotice('New code sent.');
  };

  return (
    <Screen
      footer={
        <>
          <Button title="Verify" onPress={onVerify} loading={verifying} disabled={code.length < MIN_CODE} />
          <Button
            variant="link"
            title={cooldown > 0 ? `Send a new code in ${cooldown}s` : 'Send a new code'}
            onPress={onResend}
            disabled={cooldown > 0}
          />
          <Button variant="link" title="Use a different email" onPress={() => router.back()} />
        </>
      }>
      <View style={styles.content}>
        <Label>Check your email</Label>
        <Headline>Enter your code.</Headline>
        <Body muted>We sent it to {email}.</Body>
        <TextField
          label="Code"
          value={code}
          onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, MAX_CODE))}
          placeholder="123456"
          keyboardType="number-pad"
          autoComplete="one-time-code"
          textContentType="oneTimeCode"
          maxLength={MAX_CODE}
          returnKeyType="done"
          onSubmitEditing={onVerify}
          style={styles.code}
          autoFocus
        />
        {error ? (
          <Body accessibilityRole="alert" style={styles.error}>
            {error}
          </Body>
        ) : null}
        {notice ? <Body muted>{notice}</Body> : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: Spacing.three,
    paddingTop: Spacing.five,
  },
  code: {
    fontFamily: Fonts.mono,
    fontSize: 24,
    letterSpacing: 6,
  },
  error: {
    color: Colors.error,
  },
});
