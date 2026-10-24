import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Screen } from '@/components/screen';
import { ErrorState, Loading } from '@/components/states';
import { Body, Headline, Label } from '@/components/text';
import { TopBar } from '@/components/top-bar';
import { Colors, Fonts, Radius, Spacing } from '@/constants/theme';
import { loadProgram } from '@/lib/builder';
import { joinUrl } from '@/lib/program';
import { useLoad } from '@/lib/use-load';

const MESSAGE = 'Open this link. It’ll tell you everything you need to do next.';

/** The program's join link and a Copy button. Only live programs have a link to share. */
export default function ShareScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const load = useCallback(() => loadProgram(id), [id]);
  const { data, error, retry } = useLoad(load);
  const [copied, setCopied] = useState<string | null>(null);
  const parent = { pathname: '/creator/programs/[id]', params: { id } } as const;

  if (!data) {
    return (
      <Screen>
        <TopBar parent={parent} />
        {error ? <ErrorState message={error} onRetry={retry} /> : <Loading />}
      </Screen>
    );
  }

  if (data.program.status === 'draft') {
    return (
      <Screen>
        <TopBar parent={parent} />
        <View style={styles.content}>
          <Headline size="compact">Publish first.</Headline>
          <Body muted>Your link starts working once the program is live.</Body>
        </View>
      </Screen>
    );
  }

  const link = joinUrl(data.program.slug);
  // tavie.ai isn't set up yet, so development builds also show a link that opens this app in Expo Go.
  const testLink = __DEV__ ? Linking.createURL(`j/${data.program.slug}`) : null;

  const copy = async (text: string, what: string) => {
    await Clipboard.setStringAsync(text);
    setCopied(what);
  };

  return (
    <Screen
      footer={
        <>
          <Button title="Copy link" onPress={() => copy(link, 'Link copied.')} />
          <Button
            variant="secondary"
            title="Copy message"
            onPress={() => copy(`${MESSAGE}\n${link}`, 'Message copied.')}
          />
        </>
      }>
      <TopBar parent={parent} />
      <View style={styles.content}>
        <Label style={styles.live}>Live</Label>
        <Headline size="compact">Send this to your students.</Headline>
        <View style={styles.linkBox}>
          <Body style={styles.link} selectable>
            {link}
          </Body>
        </View>
        <Body muted>{MESSAGE}</Body>
        {copied ? (
          <Body accessibilityLiveRegion="polite" style={styles.live}>
            {copied}
          </Body>
        ) : null}
        {testLink ? (
          <View style={styles.test}>
            <Label>Test link (development only)</Label>
            <Body selectable style={styles.link}>
              {testLink}
            </Body>
            <Button variant="link" title="Copy test link" onPress={() => copy(testLink, 'Test link copied.')} />
          </View>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: Spacing.three,
    paddingTop: Spacing.three,
  },
  live: {
    color: Colors.emerald,
  },
  linkBox: {
    padding: Spacing.three,
    borderRadius: Radius.button,
    borderWidth: 1.5,
    borderColor: Colors.ink,
    backgroundColor: Colors.white,
  },
  link: {
    fontFamily: Fonts.mono,
    fontSize: 15,
  },
  test: {
    gap: Spacing.two,
    paddingTop: Spacing.four,
  },
});
