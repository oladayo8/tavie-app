import { router, type Href } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';

/** A Back link at the top of builder screens. Falls back to `parent` when there's no history (web reloads). */
export function TopBar({ parent, label = 'Back' }: { parent: Href; label?: string }) {
  return (
    <View style={styles.bar}>
      <Button
        variant="link"
        title={`‹ ${label}`}
        accessibilityLabel={label}
        onPress={() => goBackOr(parent)}
        style={styles.back}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    marginTop: -12,
  },
  back: {
    paddingHorizontal: 0,
  },
});

/** Goes back, or to `parent` when there's no history (e.g. after a web reload). */
export function goBackOr(parent: Href) {
  if (router.canGoBack()) router.back();
  else router.replace(parent);
}
