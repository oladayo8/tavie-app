import { useRef } from 'react';
import { TextInput, View } from 'react-native';

import { TextField } from '@/components/text-field';
import { NAME_MAX } from '@/lib/profile';

/** First name (required) and last name (optional), with the keyboard moving from one to the next. */
export function NameFields({
  first,
  last,
  onFirst,
  onLast,
  onSubmit,
  autoFocus,
}: {
  first: string;
  last: string;
  onFirst: (v: string) => void;
  onLast: (v: string) => void;
  onSubmit: () => void;
  autoFocus?: boolean;
}) {
  const lastRef = useRef<React.ComponentRef<typeof TextInput>>(null);
  return (
    <View style={{ gap: 14 }}>
      <TextField
        label="First name"
        value={first}
        onChangeText={onFirst}
        autoCapitalize="words"
        autoComplete="given-name"
        textContentType="givenName"
        maxLength={NAME_MAX}
        returnKeyType="next"
        submitBehavior="submit"
        onSubmitEditing={() => lastRef.current?.focus()}
        autoFocus={autoFocus}
      />
      <TextField
        ref={lastRef}
        label="Last name (optional)"
        value={last}
        onChangeText={onLast}
        autoCapitalize="words"
        autoComplete="family-name"
        textContentType="familyName"
        maxLength={NAME_MAX}
        returnKeyType="done"
        onSubmitEditing={onSubmit}
      />
    </View>
  );
}
