import { useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Screen } from '@/components/screen';
import { ErrorState, ErrorText, Loading } from '@/components/states';
import { Body, Headline, Label } from '@/components/text';
import { TextField } from '@/components/text-field';
import { goBackOr, TopBar } from '@/components/top-bar';
import { Spacing } from '@/constants/theme';
import { loadProgram, setAgentName } from '@/lib/builder';
import { dataErrorMessage } from '@/lib/errors';
import { LIMITS, suggestedAgentName } from '@/lib/program';
import { useLoad } from '@/lib/use-load';

/** "Name your agent." One name for all of this creator's programs. */
export default function AgentNameScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const load = useCallback(() => loadProgram(id), [id]);
  const { data, error, retry } = useLoad(load);
  const [name, setName] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const parent = { pathname: '/creator/programs/[id]', params: { id } } as const;

  if (!data) {
    return (
      <Screen>
        <TopBar parent={parent} />
        {error ? <ErrorState message={error} onRetry={retry} /> : <Loading />}
      </Screen>
    );
  }

  const value = name ?? data.agentName ?? suggestedAgentName(data.creatorFirstName);
  const valid = value.trim().length > 0 && value.trim().length <= LIMITS.agentName;

  const onSave = async () => {
    if (!valid) return;
    setSaving(true);
    setSaveError(null);
    try {
      await setAgentName(value);
      goBackOr(parent);
    } catch (e) {
      setSaveError(dataErrorMessage(e as { message?: string }));
      setSaving(false);
    }
  };

  return (
    <Screen footer={<Button title="Save" onPress={onSave} loading={saving} disabled={!valid} />}>
      <TopBar parent={parent} />
      <View style={styles.content}>
        <Label>Your agent</Label>
        <Headline>Name your agent.</Headline>
        <Body muted>
          Students see this name on every task, so your brand comes first. It’s the same for all your programs.
        </Body>
        <TextField label="Agent name" value={value} onChangeText={setName} maxLength={LIMITS.agentName} />
        <Body muted>Students will see: “{value.trim() || '…'} will tell you exactly what to do next.”</Body>
        <ErrorText message={saveError} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: Spacing.three,
    paddingTop: Spacing.three,
  },
});
