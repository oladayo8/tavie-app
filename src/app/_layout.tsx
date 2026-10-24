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
import { areaFor } from '@/lib/navigation';

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
  const area = areaFor(!!session, access);

  useEffect(() => {
    if (!loading) SplashScreen.hideAsync();
  }, [loading]);

  if (loading) return null;

  // Each signed-in screen opens only for the access the database gave this person.
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: Colors.paper } }}>
      <Stack.Protected guard={area === 'signed-out'}>
        <Stack.Screen name="index" />
        <Stack.Screen name="sign-in" />
        <Stack.Screen name="verify" />
      </Stack.Protected>
      <Stack.Protected guard={area === 'creator'}>
        <Stack.Screen name="creator/(tabs)" />
        <Stack.Screen name="creator/new" />
        <Stack.Screen name="creator/drafts" />
        <Stack.Screen name="creator/programs/[id]/index" />
        <Stack.Screen name="creator/programs/[id]/generate" />
        <Stack.Screen name="creator/programs/[id]/milestones/index" />
        <Stack.Screen name="creator/programs/[id]/milestones/[mid]" />
        <Stack.Screen name="creator/programs/[id]/tasks/[tid]" />
        <Stack.Screen name="creator/programs/[id]/agent" />
        <Stack.Screen name="creator/programs/[id]/preview" />
        <Stack.Screen name="creator/programs/[id]/share" />
        <Stack.Screen name="creator/students/[id]" />
      </Stack.Protected>
      <Stack.Protected guard={area === 'needs-name'}>
        <Stack.Screen name="creator/name" />
      </Stack.Protected>
      <Stack.Protected guard={area === 'student'}>
        <Stack.Screen name="student" />
      </Stack.Protected>
      <Stack.Protected guard={area === 'no-access'}>
        <Stack.Screen name="no-access" />
      </Stack.Protected>
      <Stack.Screen name="j/[slug]" />
    </Stack>
  );
}
