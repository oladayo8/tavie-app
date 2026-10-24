import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/button';
import { Icon } from '@/components/icons';
import { NameFields } from '@/components/name-fields';
import { Label } from '@/components/text';
import { Colors, Fonts } from '@/constants/theme';
import { dataErrorMessage } from '@/lib/errors';
import { cleanName, fullName, saveName, type MyProfile } from '@/lib/profile';

/** The person's name with an Edit button that opens the two name fields in place. */
export function NameEditor({
  role,
  profile,
  onSaved,
}: {
  role: 'creator' | 'student';
  profile: MyProfile;
  onSaved: (p: MyProfile) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [first, setFirst] = useState(profile.first_name);
  const [last, setLast] = useState(profile.last_name);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valid = !!cleanName(first, last);

  const open = () => {
    setFirst(profile.first_name);
    setLast(profile.last_name);
    setError(null);
    setEditing(true);
  };

  const save = async () => {
    if (!valid || saving) return;
    setSaving(true);
    setError(null);
    try {
      await saveName(role, first, last);
      const name = cleanName(first, last)!;
      onSaved({ ...profile, ...name });
      setEditing(false);
    } catch (e) {
      setError(dataErrorMessage(e as { message?: string }));
    }
    setSaving(false);
  };

  if (!editing) {
    return (
      <View style={styles.row}>
        <View style={styles.flex}>
          <Label>Name</Label>
          <Text maxFontSizeMultiplier={1.3} style={styles.value} numberOfLines={2}>
            {fullName(profile) || 'Not added yet'}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Edit name"
          onPress={open}
          hitSlop={8}
          style={({ pressed }) => [styles.edit, pressed && { opacity: 0.6 }]}>
          <Icon name="edit" color={Colors.forest} size={16} />
          <Text maxFontSizeMultiplier={1.2} style={styles.editText}>
            Edit
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.form}>
      <NameFields first={first} last={last} onFirst={setFirst} onLast={setLast} onSubmit={save} autoFocus />
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}
      <View style={styles.actions}>
        <Button variant="secondary" title="Cancel" onPress={() => setEditing(false)} style={styles.flex} />
        <Button title="Save" onPress={save} loading={saving} disabled={!valid} style={styles.flex} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  flex: {
    flex: 1,
  },
  value: {
    fontFamily: Fonts.bodyMedium,
    fontSize: 16,
    lineHeight: 21,
    color: Colors.ink,
    marginTop: 4,
  },
  edit: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: Colors.paper,
  },
  editText: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 14,
    color: Colors.forest,
  },
  form: {
    gap: 14,
    padding: 16,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
  },
  error: {
    fontFamily: Fonts.body,
    fontSize: 14,
    color: Colors.error,
  },
});
