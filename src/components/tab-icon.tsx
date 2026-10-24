import Svg, { Circle, Path, Rect } from 'react-native-svg';

import type { TabIconName } from '@/lib/navigation';

/** Simple line icons drawn the same on iOS, Android, and web. */
export function TabIcon({ name, color, size = 24 }: { name: TabIconName; color: string; size?: number }) {
  const line = {
    stroke: color,
    strokeWidth: 1.9,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none',
  };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {name === 'today' ? (
        <>
          <Circle cx={12} cy={12} r={8.5} {...line} />
          <Path d="M8.2 12.3l2.6 2.5 5-5.3" {...line} />
        </>
      ) : name === 'path' ? (
        <>
          <Circle cx={6} cy={18} r={2} {...line} />
          <Circle cx={18} cy={6} r={2} {...line} />
          <Path d="M8 18h7a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h7" {...line} />
        </>
      ) : name === 'profile' ? (
        <>
          <Circle cx={12} cy={8.5} r={3.5} {...line} />
          <Path d="M5 19.5c1.2-3.3 3.9-5 7-5s5.8 1.7 7 5" {...line} />
        </>
      ) : name === 'overview' ? (
        <>
          <Rect x={4} y={4} width={7} height={7} rx={1.8} {...line} />
          <Rect x={13} y={4} width={7} height={7} rx={1.8} {...line} />
          <Rect x={4} y={13} width={7} height={7} rx={1.8} {...line} />
          <Rect x={13} y={13} width={7} height={7} rx={1.8} {...line} />
        </>
      ) : name === 'students' ? (
        <>
          <Circle cx={9} cy={9} r={3} {...line} />
          <Path d="M3.5 19c.9-2.9 3-4.4 5.5-4.4s4.6 1.5 5.5 4.4" {...line} />
          <Path d="M15.5 6.3a3 3 0 0 1 0 5.4M17 14.8c1.7.5 2.9 1.9 3.5 4.2" {...line} />
        </>
      ) : (
        <>
          <Path d="M5 5.5A1.5 1.5 0 0 1 6.5 4H18v14H6.5A1.5 1.5 0 0 0 5 19.5z" {...line} />
          <Path d="M5 19.5A1.5 1.5 0 0 0 6.5 21H18v-3" {...line} />
          <Path d="M9 8h5" {...line} />
        </>
      )}
    </Svg>
  );
}
