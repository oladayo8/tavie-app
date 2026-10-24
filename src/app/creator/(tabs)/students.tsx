import { router } from 'expo-router';
import { useCallback, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/button';
import { ProgramPicker } from '@/components/program-picker';
import { Screen } from '@/components/screen';
import { ErrorState, Loading } from '@/components/states';
import { StudentRowCard } from '@/components/student-row';
import { Body } from '@/components/text';
import { Colors, Fonts } from '@/constants/theme';
import { getDashboard } from '@/lib/dashboard';
import { useSelectedProgram } from '@/lib/selected-program';
import { useLoad } from '@/lib/use-load';

/** Students tab: everyone in the selected program, needs-attention first. Tap one for their record. */
export default function StudentsScreen() {
  const { programId, setProgramId } = useSelectedProgram();
  const load = useCallback(() => getDashboard(programId), [programId]);
  const { data, loading, error, retry } = useLoad(load);
  const selected = data?.programs.find((p) => p.id === data.program_id) ?? null;

  return (
    <Screen tab>
      <Text accessibilityRole="header" maxFontSizeMultiplier={1.3} style={styles.title}>
        Students
      </Text>
      {!data ? (
        error ? (
          <ErrorState message={error} onRetry={retry} />
        ) : (
          <Loading label="Loading students" />
        )
      ) : !selected ? (
        <Empty text="Publish a program and share its link. Everyone who joins will be listed here." />
      ) : (
        <View style={styles.content}>
          {data.programs.length > 1 ? (
            <ProgramPicker programs={data.programs} selected={selected.id} onSelect={setProgramId} busy={loading} />
          ) : (
            <Text maxFontSizeMultiplier={1.3} style={styles.program} numberOfLines={2}>
              {selected.title}
            </Text>
          )}
          {data.students.length ? (
            <>
              <View style={styles.group}>
                {data.students.map((s, i) => (
                  <StudentRowCard
                    key={s.enrollment_id}
                    student={s}
                    first={i === 0}
                    onPress={() => router.push({ pathname: '/creator/students/[id]', params: { id: s.enrollment_id } })}
                  />
                ))}
              </View>
              <Body muted style={styles.footnote}>
                Inactive means no check-in for {data.inactive_days ?? 3} days. Everything here is what students
                reported.
              </Body>
            </>
          ) : (
            <Empty
              text="No one has joined yet. Send your link to your students."
              action={
                <Button
                  variant="secondary"
                  title="Share your link"
                  onPress={() => router.push({ pathname: '/creator/programs/[id]/share', params: { id: selected.id } })}
                />
              }
            />
          )}
        </View>
      )}
    </Screen>
  );
}

function Empty({ text, action }: { text: string; action?: ReactNode }) {
  return (
    <View style={styles.card}>
      <Body muted style={styles.small}>
        {text}
      </Body>
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  title: {
    fontFamily: Fonts.display,
    fontSize: 26,
    lineHeight: 30,
    letterSpacing: -0.5,
    color: Colors.ink,
    paddingBottom: 12,
  },
  content: {
    gap: 12,
  },
  program: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 15,
    color: Colors.inkMuted,
  },
  group: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.line,
    backgroundColor: Colors.white,
    overflow: 'hidden',
  },
  footnote: {
    fontSize: 13,
    lineHeight: 18,
  },
  card: {
    gap: 12,
    padding: 16,
    borderRadius: 16,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.line,
  },
  small: {
    fontSize: 15,
    lineHeight: 21,
  },
});
