import Svg, { Circle, Path } from 'react-native-svg';

export type IconName =
  | 'plus'
  | 'link'
  | 'edit'
  | 'dots'
  | 'users'
  | 'check'
  | 'alert'
  | 'share'
  | 'chevron'
  | 'person'
  | 'settings';

/** Small line icons for buttons and labels, drawn the same on every platform. */
export function Icon({ name, color, size = 18 }: { name: IconName; color: string; size?: number }) {
  const line = {
    stroke: color,
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none',
  };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {name === 'plus' ? (
        <Path d="M12 5v14M5 12h14" {...line} />
      ) : name === 'link' ? (
        <>
          <Path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" {...line} />
          <Path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" {...line} />
        </>
      ) : name === 'edit' ? (
        <>
          <Path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z" {...line} />
          <Path d="M13.5 6.5l4 4" {...line} />
        </>
      ) : name === 'dots' ? (
        <>
          <Circle cx={12} cy={5} r={1.6} fill={color} />
          <Circle cx={12} cy={12} r={1.6} fill={color} />
          <Circle cx={12} cy={19} r={1.6} fill={color} />
        </>
      ) : name === 'users' ? (
        <>
          <Circle cx={9} cy={8.5} r={3.2} {...line} />
          <Path
            d="M3 19c.9-3 3.2-4.6 6-4.6s5.1 1.6 6 4.6M16 5.5a3.2 3.2 0 0 1 0 6M18 14.6c1.6.6 2.6 2 3 4.4"
            {...line}
          />
        </>
      ) : name === 'person' ? (
        <>
          <Circle cx={12} cy={8.5} r={3.6} {...line} />
          <Path d="M5 20c1-3.6 3.8-5.6 7-5.6s6 2 7 5.6" {...line} />
        </>
      ) : name === 'settings' ? (
        <>
          <Circle cx={12} cy={12} r={3} {...line} />
          <Path
            d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7"
            {...line}
          />
        </>
      ) : name === 'check' ? (
        <>
          <Circle cx={12} cy={12} r={9} fill={color} />
          <Path
            d="M8 12.3l2.7 2.6L16 9.6"
            stroke="#FFFFFF"
            strokeWidth={2.2}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </>
      ) : name === 'alert' ? (
        <>
          <Path d="M12 3.5L2.5 20h19z" fill={color} stroke={color} strokeWidth={1.5} strokeLinejoin="round" />
          <Path d="M12 10v4.2M12 17.2v.1" stroke="#FFFFFF" strokeWidth={2.2} strokeLinecap="round" />
        </>
      ) : name === 'share' ? (
        <>
          <Circle cx={18} cy={5.5} r={2.5} fill={color} />
          <Circle cx={6} cy={12} r={2.5} fill={color} />
          <Circle cx={18} cy={18.5} r={2.5} fill={color} />
          <Path d="M8.2 10.8l7.6-4.1M8.2 13.2l7.6 4.1" {...line} />
        </>
      ) : (
        <Path d="M9 5l7 7-7 7" {...line} />
      )}
    </Svg>
  );
}
