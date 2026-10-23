import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Screen } from '@/components/screen';
import { ErrorText } from '@/components/states';
import { Body, Headline, Label } from '@/components/text';
import { TextField } from '@/components/text-field';
import { TopBar } from '@/components/top-bar';
import { Spacing } from '@/constants/theme';
import { createProgram } from '@/lib/builder';
import { dataErrorMessage } from '@/lib/errors';
import { goalIsValid, LIMITS, parseWeeks } from '@/lib/program';

/** Goal, then length: one question per screen, as in the Brief. */
export default function NewProgramScreen() {
  const [step, setStep] = useState<'goal' | 'weeks'>('goal');
  const [goal, setGoal] = useState('');
  const [weeks, setWeeks] = useState('8');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsedWeeks = parseWeeks(weeks);

  const onCreate = async () => {
    if (!parsedWeeks || !goalIsValid(goal)) return;
    setSaving(true);
    setError(null);
    try {
      const program = await createProgram(goal, parsedWeeks);
      router.replace({ pathname: '/creator/programs/[id]', params: { id: program.id } });
      router.push({ pathname: '/creator/programs/[id]/milestones', params: { id: program.id } });
    } catch (e) {
      setSaving(false);
      setError(dataErrorMessage(e as { message?: string }));
    }
  };

  if (step === 'goal') {
    return (
      <Screen footer={<Button title="Next" onPress={() => setStep('weeks')} disabled={!goalIsValid(goal)} />}>
        <TopBar parent="/creator" />
        <View style={styles.content}>
          <Label>New program · 1 of 2</Label>
          <Headline>What will your students achieve?</Headline>
          <Body muted>One sentence. Students see it on their plan.</Body>
          <TextField
            label="Goal"
            value={goal}
            onChangeText={setGoal}
            placeholder="Close your first wholesale deal"
            maxLength={LIMITS.goal.max}
            multiline
            autoFocus
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen
      footer={
        <>
          <Button title="Create program" onPress={onCreate} loading={saving} disabled={!parsedWeeks} />
          <Button variant="link" title="Back" onPress={() => setStep('goal')} />
        </>
      }>
      <View style={styles.content}>
        <Label>New program · 2 of 2</Label>
        <Headline>How many weeks does it usually take?</Headline>
        <Body muted>A number from 1 to 52. Students see it as their target date.</Body>
        <TextField
          label="Weeks"
          value={weeks}
          onChangeText={(t) => setWeeks(t.replace(/\D/g, '').slice(0, 2))}
          keyboardType="number-pad"
          maxLength={2}
          returnKeyType="done"
          onSubmitEditing={onCreate}
          autoFocus
        />
        {weeks && !parsedWeeks ? <ErrorText message="Use a number from 1 to 52." /> : null}
        <ErrorText message={error} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: Spacing.three,
    paddingTop: Spacing.four,
  },
});
