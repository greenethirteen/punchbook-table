import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Dimensions, Easing, StyleSheet, Text, View } from 'react-native';
import { colors } from '@/lib/theme';

const GREEN = '#244633'; // same as the native splash, so the hand-over is seamless
const DOT = 14;

/**
 * Opening animation, played once over the app: "punch" and "book" slide up, the orange
 * dot pops in, then grows to fill the screen and fades away to reveal the app.
 */
export function Splash({ onDone }: { onDone: () => void }) {
  const [line1] = useState(() => new Animated.Value(0));
  const [line2] = useState(() => new Animated.Value(0));
  const [dot] = useState(() => new Animated.Value(0));
  const [fade] = useState(() => new Animated.Value(1));

  useEffect(() => {
    const { width, height } = Dimensions.get('window');
    const fill = (2 * Math.hypot(width, height)) / DOT; // big enough to cover from anywhere
    const slide = (v: Animated.Value, delay: number) =>
      Animated.timing(v, { toValue: 1, duration: 450, delay, easing: Easing.out(Easing.cubic), useNativeDriver: true });
    let anim: Animated.CompositeAnimation | undefined;
    AccessibilityInfo.isReduceMotionEnabled().then(reduce => {
      anim = reduce
        ? Animated.sequence([
            Animated.parallel([slide(line1, 0), slide(line2, 0), Animated.timing(dot, { toValue: 1, duration: 1, useNativeDriver: true })]),
            Animated.timing(fade, { toValue: 0, duration: 300, delay: 500, useNativeDriver: true }),
          ])
        : Animated.sequence([
            Animated.parallel([slide(line1, 50), slide(line2, 180)]),
            Animated.timing(dot, { toValue: 1, duration: 320, easing: Easing.out(Easing.back(3)), useNativeDriver: true }),
            Animated.timing(dot, { toValue: fill, duration: 480, delay: 120, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
            Animated.timing(fade, { toValue: 0, duration: 280, useNativeDriver: true }),
          ]);
      anim.start(() => onDone());
    });
    return () => anim?.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- plays once on mount
  }, []);

  const rise = (v: Animated.Value) => ({
    opacity: v,
    transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }],
  });

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.screen, { opacity: fade }]} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View>
        <Animated.Text style={[styles.word, rise(line1)]}>punch</Animated.Text>
        <Animated.View style={[styles.row, rise(line2)]}>
          <Text style={styles.word}>book</Text>
          <Animated.View style={[styles.dot, { transform: [{ scale: dot }] }]} />
        </Animated.View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: GREEN, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', zIndex: 100 },
  word: { color: '#fff', fontSize: 64, lineHeight: 60, fontWeight: '800', letterSpacing: -2.6 },
  row: { flexDirection: 'row', alignItems: 'flex-end' },
  dot: { width: DOT, height: DOT, borderRadius: DOT / 2, backgroundColor: colors.accent, marginLeft: 3, marginBottom: 6 },
});
