import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Screen } from '@/components/screen';
import { Body, Headline, Label } from '@/components/text';
import { TextField } from '@/components/text-field';
import { Colors, Fonts, Spacing } from '@/constants/theme';
import { authErrorMessage } from '@/lib/errors';
import { CODE_LENGTH, secondsUntilResend, sendCode } from '@/lib/otp';
import { supabase } from '@/lib/supabase';

export default function VerifyScreen() {
  const { email } = useLocalSearchParams<{ email: string }>();
  const [code, setCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(() => secondsUntilResend(email));

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  const onVerify = async () => {
    if (!supabase || code.length < CODE_LENGTH) return;
    setVerifying(true);
    setError(null);
    const { error } = await supabase.auth.verifyOtp({
      email,
      token: code,
      type: 'email',
    });
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
    const { error, skipped } = await sendCode(supabase, email);
    // Always show the real wait, so nobody taps their way into a longer rate limit.
    setCooldown(secondsUntilResend(email));
    if (error) {
      setError(authErrorMessage(error));
      return;
    }
    if (!skipped) setNotice('New code sent.');
  };

  return (
    <Screen
      footer={
        <>
          <Button title="Verify" onPress={onVerify} loading={verifying} disabled={code.length < CODE_LENGTH} />
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
        <Headline>Enter the {CODE_LENGTH}-digit code.</Headline>
        <Body muted>We emailed it to {email}. Type it below.</Body>
        <TextField
          label="Code"
          value={code}
          onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, CODE_LENGTH))}
          placeholder="123456"
          keyboardType="number-pad"
          autoComplete="one-time-code"
          textContentType="oneTimeCode"
          maxLength={CODE_LENGTH}
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
