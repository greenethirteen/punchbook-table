import Svg, { Circle, Path } from 'react-native-svg';
import { colors } from '@/lib/theme';

type IconProps = { size?: number; color?: string };

// Simple stroke icons used on the home screen. Decorative: label the control, not the icon.
function Icon({ size = 20, color = colors.ink, children }: IconProps & { children: React.ReactNode }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" accessible={false}>
      {children}
    </Svg>
  );
}

export const SearchIcon = (p: IconProps) => (
  <Icon {...p}>
    <Circle cx="11" cy="11" r="7" />
    <Path d="m20 20-3.5-3.5" />
  </Icon>
);

export const ReceiptIcon = (p: IconProps) => (
  <Icon {...p}>
    <Path d="M6 3h12v18l-3-2-3 2-3-2-3 2Z" />
    <Path d="M9 8h6M9 12h6" />
  </Icon>
);

export const BagIcon = (p: IconProps) => (
  <Icon {...p}>
    <Path d="M5 8h14l-1.5 12h-11Z" />
    <Path d="M9 8V6a3 3 0 0 1 6 0v2" />
  </Icon>
);

export const ScooterIcon = (p: IconProps) => (
  <Icon {...p}>
    <Circle cx="6" cy="17" r="2.5" />
    <Circle cx="18" cy="17" r="2.5" />
    <Path d="M8.5 17h7M13 6h3l2.5 8.5M6 14.5 9 9h5" />
  </Icon>
);

export const CloseIcon = (p: IconProps) => (
  <Icon {...p}>
    <Path d="M6 6l12 12M18 6 6 18" />
  </Icon>
);
