import { Platform } from 'react-native';

/**
 * Tavie brand palette (Build Brief, section 5).
 * The UI is black and white (Ink and Paper). Green is only for action buttons
 * and progress or success states.
 */
export const Colors = {
  ink: '#15211C',
  paper: '#EEF1EC',
  emerald: '#0B7A50',
  forest: '#0A3D2B',
  mint: '#5FD8A0',

  // Neutrals derived from Ink and Paper.
  white: '#FFFFFF',
  inkMuted: '#4E5A54',
  line: '#D3D9D1',
  error: '#B42318',
} as const;

/** Font family names, as registered by `useFonts` in the root layout. */
export const Fonts = {
  display: 'BricolageGrotesque_800ExtraBold',
  body: 'InstrumentSans_400Regular',
  bodyMedium: 'InstrumentSans_500Medium',
  bodySemiBold: 'InstrumentSans_600SemiBold',
  mono: 'JetBrainsMono_500Medium',
} as const;

export const Spacing = {
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

/** Minimum tap target (Build Brief, section 10: 44px or more). */
export const MinTapTarget = 52;

export const Radius = {
  card: 16,
  button: 14,
} as const;

export const MaxContentWidth = 480;

export const isWeb = Platform.OS === 'web';
