import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TabIcon } from '@/components/tab-icon';
import { Colors, Fonts } from '@/constants/theme';
import type { TabSpec } from '@/lib/navigation';

/**
 * Tavie's bottom tab bar: white, a hairline on top, Emerald for the active tab. React Navigation
 * adds the home-indicator inset, and the bar hides while the keyboard is up.
 */
export function TavieTabs({ tabs }: { tabs: readonly TabSpec[] }) {
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarHideOnKeyboard: true,
        tabBarActiveTintColor: Colors.emerald,
        tabBarInactiveTintColor: Colors.inkMuted,
        // Room for the icon and label above the home indicator, which the bar pads for itself.
        tabBarStyle: {
          backgroundColor: Colors.white,
          borderTopColor: Colors.line,
          height: 58 + insets.bottom,
          paddingTop: 6,
        },
        tabBarLabelStyle: { fontFamily: Fonts.bodySemiBold, fontSize: 11, lineHeight: 14 },
        tabBarAllowFontScaling: false,
        sceneStyle: { backgroundColor: Colors.paper },
      }}>
      {tabs.map((t) => (
        <Tabs.Screen
          key={t.name}
          name={t.name}
          options={{
            title: t.title,
            tabBarAccessibilityLabel: t.title,
            tabBarIcon: ({ color }) => <TabIcon name={t.icon} color={String(color)} />,
          }}
        />
      ))}
    </Tabs>
  );
}
