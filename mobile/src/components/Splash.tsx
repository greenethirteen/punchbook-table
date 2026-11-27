import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { colors } from '@/lib/theme';

const GREEN = '#244633'; // same as the native splash, so the hand-over is seamless
const BAG = '#f6efe0';

/**
 * Opening animation, played once over the app: a takeaway bag bounces up,
 * "punchbook." rises under it, then the whole screen fades to reveal the app.
 */
export function Splash({ onDone }: { onDone: () => void }) {
  const [bag] = useState(() => new Animated.Value(0));
  const [name] = useState(() => new Animated.Value(0));
  const [fade] = useState(() => new Animated.Value(1));

  useEffect(() => {
    let anim: Animated.CompositeAnimation | undefined;
    AccessibilityInfo.isReduceMotionEnabled().then(reduce => {
      anim = reduce
        ? Animated.sequence([
            Animated.parallel([
              Animated.timing(bag, { toValue: 1, duration: 1, useNativeDriver: true }),
              Animated.timing(name, { toValue: 1, duration: 300, useNativeDriver: true }),
            ]),
            Animated.timing(fade, { toValue: 0, duration: 300, delay: 600, useNativeDriver: true }),
          ])
        : Animated.sequence([
            Animated.timing(bag, { toValue: 1, duration: 750, delay: 80, easing: Easing.out(Easing.back(1.8)), useNativeDriver: true }),
            Animated.timing(name, { toValue: 1, duration: 380, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
            Animated.timing(fade, { toValue: 0, duration: 320, delay: 450, easing: Easing.in(Easing.quad), useNativeDriver: true }),
          ]);
      anim.start(() => onDone());
    });
    return () => anim?.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- plays once on mount
  }, []);

  const bagStyle = {
    opacity: bag.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 1, 1] }),
    transform: [
      { translateY: bag.interpolate({ inputRange: [0, 1], outputRange: [180, 0] }) },
      { rotate: bag.interpolate({ inputRange: [0, 1], outputRange: ['-12deg', '0deg'] }) },
    ],
  };
  const nameStyle = {
    opacity: name,
    transform: [{ translateY: name.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }],
  };
  const out = { transform: [{ scale: fade.interpolate({ inputRange: [0, 1], outputRange: [1.06, 1] }) }] };

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.screen, { opacity: fade }]} pointerEvents="none" importantForAccessibility="no-hide-descendants">
      <Animated.View style={[styles.center, out]}>
        <Animated.View style={[styles.bag, bagStyle]}>
          <View style={styles.handle} />
          <View style={styles.body}>
            <View style={styles.tag} />
          </View>
        </Animated.View>
        <Animated.View style={nameStyle}>
          <Text style={styles.word}>
            punchbook<Text style={{ color: colors.accent }}>.</Text>
          </Text>
        </Animated.View>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: GREEN, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', zIndex: 100 },
  center: { alignItems: 'center' },
  bag: { width: 96, height: 108, alignItems: 'center', justifyContent: 'flex-end', marginBottom: 26 },
  handle: { position: 'absolute', top: 0, width: 44, height: 38, borderWidth: 7, borderBottomWidth: 0, borderColor: BAG, borderTopLeftRadius: 22, borderTopRightRadius: 22 },
  body: { width: 96, height: 84, backgroundColor: BAG, borderTopLeftRadius: 10, borderTopRightRadius: 10, borderBottomLeftRadius: 18, borderBottomRightRadius: 18, alignItems: 'center', justifyContent: 'center' },
  tag: { width: 20, height: 20, borderRadius: 10, backgroundColor: colors.accent },
  word: { color: '#fff', fontSize: 44, fontWeight: '800', letterSpacing: -1.8 },
});
