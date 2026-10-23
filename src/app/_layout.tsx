import { BricolageGrotesque_800ExtraBold } from '@expo-google-fonts/bricolage-grotesque';
import {
  InstrumentSans_400Regular,
  InstrumentSans_500Medium,
  InstrumentSans_600SemiBold,
} from '@expo-google-fonts/instrument-sans';
import { JetBrainsMono_500Medium } from '@expo-google-fonts/jetbrains-mono';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Colors } from '@/constants/theme';
import { AuthProvider, useAuth } from '@/lib/auth';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    BricolageGrotesque_800ExtraBold,
    InstrumentSans_400Regular,
    InstrumentSans_500Medium,
    InstrumentSans_600SemiBold,
    JetBrainsMono_500Medium,
  });

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="dark" />
        {fontsLoaded || fontError ? <RootStack /> : null}
      </AuthProvider>
    </SafeAreaProvider>
  );
}

function RootStack() {
  const { session, access, loading } = useAuth();

  useEffect(() => {
    if (!loading) SplashScreen.hideAsync();
  }, [loading]);

  if (loading) return null;

  // Each signed-in screen opens only for the access the database gave this person.
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: Colors.paper } }}>
      <Stack.Protected guard={!session}>
        <Stack.Screen name="index" />
        <Stack.Screen name="sign-in" />
        <Stack.Screen name="verify" />
      </Stack.Protected>
      <Stack.Protected guard={!!session && access === 'creator'}>
        <Stack.Screen name="creator/index" />
      </Stack.Protected>
      <Stack.Protected guard={!!session && access === 'needs-name'}>
        <Stack.Screen name="creator/name" />
      </Stack.Protected>
      <Stack.Protected guard={!!session && access === 'student'}>
        <Stack.Screen name="student/index" />
      </Stack.Protected>
      <Stack.Protected guard={!!session && access === 'none'}>
        <Stack.Screen name="no-access" />
      </Stack.Protected>
      <Stack.Screen name="j/[slug]" />
    </Stack>
  );
}
