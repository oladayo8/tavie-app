import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Body, Headline, Label } from '@/components/text';
import { Spacing } from '@/constants/theme';

/** What a student sees on a creator's link: only the public fields get_join_info returns. */
export function JoinCard({
  creatorName,
  agentName,
  goal,
  onStart,
}: {
  creatorName: string;
  agentName: string;
  goal: string;
  onStart?: () => void;
}) {
  return (
    <View style={styles.card}>
      <Label>{creatorName}’s program</Label>
      <Headline>{goal}</Headline>
      <Body muted>{agentName} will tell you exactly what to do next, one task at a time.</Body>
      <Button title="Start" onPress={onStart} />
      <Label style={styles.powered}>Powered by Tavie</Label>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: Spacing.three,
  },
  powered: {
    textAlign: 'center',
  },
});
