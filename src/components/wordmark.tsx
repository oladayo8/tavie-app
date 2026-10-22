import { StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { Colors, Fonts } from '@/constants/theme';

/**
 * Lowercase "tavie" with a mint check in place of the dot on the "i".
 * The "i" is a dotless ı so the check can sit where the dot would be.
 */
export function Wordmark({ size = 40, color = Colors.ink }: { size?: number; color?: string }) {
  const text = { fontSize: size, lineHeight: size * 1.15, color };
  const check = size * 0.42;
  return (
    <View accessible accessibilityRole="image" accessibilityLabel="tavie" style={styles.row}>
      <Text style={[styles.text, text]}>tav</Text>
      <View>
        <Text style={[styles.text, text]}>ı</Text>
        <Svg
          width={check}
          height={check * 0.8}
          viewBox="0 0 20 16"
          style={[styles.check, { top: size * 0.09, left: -check * 0.26 }]}>
          <Path d="M2.5 8.5 L7.5 13 L17.5 3" stroke={Colors.mint} strokeWidth={3.6} strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </Svg>
      </View>
      <Text style={[styles.text, text]}>e</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    alignSelf: 'flex-start',
  },
  text: {
    fontFamily: Fonts.display,
    letterSpacing: -1,
  },
  check: {
    position: 'absolute',
  },
});
