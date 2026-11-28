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

export const HomeIcon = (p: IconProps) => (
  <Icon {...p}>
    <Path d="M3 11 12 4l9 7v9H3z" />
    <Path d="M9 20v-6h6v6" />
  </Icon>
);

export const UserIcon = (p: IconProps) => (
  <Icon {...p}>
    <Path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" />
    <Path d="M4 21a8 8 0 0 1 16 0" />
  </Icon>
);

export const PinIcon = (p: IconProps) => (
  <Icon {...p}>
    <Path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z" />
    <Path d="M12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z" />
  </Icon>
);

export const ChevronIcon = (p: IconProps) => (
  <Icon {...p}>
    <Path d="M9 6l6 6-6 6" />
  </Icon>
);

export const CheckIcon = (p: IconProps) => (
  <Icon {...p}>
    <Path d="M5 12.5l4.5 4.5L19 7.5" />
  </Icon>
);

export const PhoneIcon = (p: IconProps) => (
  <Icon {...p}>
    <Path d="M8 2h8a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z" />
    <Path d="M11 18h2" />
  </Icon>
);
