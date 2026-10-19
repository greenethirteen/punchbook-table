// First-launch tour: three swipeable slides, each a coloured scene above a short headline.
// Approved design: design/welcome-tour.html. Shown once; _layout.tsx remembers it was seen.
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type ViewStyle,
  type ViewToken,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { Button } from '@/components/ui';
import { colors } from '@/lib/theme';

const SUN = '#ffc94a';
const MINT = '#3fd18b';

// body and extra are functions so they can use the styles defined at the bottom of the file.
type Slide = { key: string; title: string; highlight: string; body?: () => React.ReactNode; extra?: () => React.ReactNode; scene: () => React.ReactElement; bg: string };

const slides: Slide[] = [
  {
    key: 'pickup',
    title: 'Pickup orders,',
    highlight: 'made easy.',
    body: () => 'Same prices as the counter. No app markups.',
    extra: () => (
      <View style={s.soon}>
        <View style={s.soonDot} />
        <Text style={s.soonText}>Delivery coming soon</Text>
      </View>
    ),
    scene: PickupScene,
    bg: colors.green,
  },
  {
    key: 'wait',
    title: 'No waiting',
    highlight: 'in line.',
    body: () => 'We’ll tell you the moment your food is ready. Just walk in and pick it up.',
    scene: WaitScene,
    bg: SUN,
  },
  {
    key: 'fair',
    title: 'Fair',
    highlight: 'prices.',
    body: () => 'Delivery apps charge restaurants up to 30% of every order, which pushes up menu prices. Punchbook charges far less.',
    scene: FairScene,
    bg: colors.ink,
  },
];

// Gentle up-and-down drift for the floating pieces; off when the phone asks for reduced motion.
function useFloat(delay = 0) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    let loop: Animated.CompositeAnimation | null = null;
    AccessibilityInfo.isReduceMotionEnabled().then(reduce => {
      if (reduce) return;
      loop = Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(v, { toValue: 1, duration: 2000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(v, { toValue: 0, duration: 2000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ]),
      );
      loop.start();
    });
    return () => loop?.stop();
  }, [v, delay]);
  return { transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, -8] }) }] };
}

function Float({ delay, style, children }: { delay?: number; style?: ViewStyle | ViewStyle[]; children?: React.ReactNode }) {
  const motion = useFloat(delay);
  return <Animated.View style={[style, motion]}>{children}</Animated.View>;
}

const Ring = ({ size, color = '#ffffff2e' }: { size: number; color?: string }) => (
  <View style={[s.ring, { width: size, height: size, borderRadius: size / 2, borderColor: color }]} />
);
const Spark = ({ style, color, size = 10, delay }: { style: ViewStyle; color: string; size?: number; delay?: number }) => (
  <Float delay={delay} style={[s.spark, { backgroundColor: color, width: size, height: size }, style]} />
);

function PickupScene() {
  const Step = ({ n, label, color }: { n: number; label: string; color: string }) => (
    <View style={s.step}>
      <View style={[s.stepNum, { backgroundColor: color }]}>
        <Text style={s.stepNumText}>{n}</Text>
      </View>
      <Text style={s.stepText}>{label}</Text>
    </View>
  );
  return (
    <>
      <Ring size={300} />
      <Ring size={200} />
      <View style={[s.blob, { width: 90, height: 90, left: -20, bottom: 30 }]} />
      <Spark color={SUN} style={{ top: '30%', left: 44 }} />
      <Spark color={colors.accent} style={{ bottom: 58, right: 46 }} delay={600} />
      <Spark color={MINT} size={8} style={{ top: '38%', right: 36 }} delay={1200} />
      <Float delay={600} style={s.bag}>
        <View style={s.handle} />
        <Text style={s.bagP}>
          p<Text style={{ color: colors.accent }}>.</Text>
        </Text>
      </Float>
      <Float style={{ position: 'absolute', top: '30%', left: 22 }}>
        <Step n={1} label="Order" color={colors.accent} />
      </Float>
      <Float delay={1200} style={{ position: 'absolute', top: '42%', right: 18 }}>
        <Step n={2} label="Pay" color={colors.green} />
      </Float>
      <Float delay={600} style={{ position: 'absolute', bottom: 34, alignSelf: 'center' }}>
        <Step n={3} label="Collect" color={colors.ink} />
      </Float>
    </>
  );
}

function WaitScene() {
  // The bell gives a little shake every couple of seconds.
  const swing = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    let loop: Animated.CompositeAnimation | null = null;
    AccessibilityInfo.isReduceMotionEnabled().then(reduce => {
      if (reduce) return;
      const to = (v: number) => Animated.timing(swing, { toValue: v, duration: 110, useNativeDriver: true });
      loop = Animated.loop(Animated.sequence([Animated.delay(1400), to(1), to(-0.8), to(0.55), to(-0.3), to(0)]));
      loop.start();
    });
    return () => loop?.stop();
  }, [swing]);
  const rotate = swing.interpolate({ inputRange: [-1, 1], outputRange: ['-12deg', '12deg'] });
  return (
    <>
      <Ring size={280} color="#17171324" />
      <Ring size={190} color="#17171324" />
      <Spark color={colors.ink} size={8} style={{ top: '30%', left: 48 }} />
      <Spark color={colors.accent} style={{ top: '26%', right: 58 }} delay={700} />
      <Animated.View style={[s.bell, { transform: [{ rotate }] }]}>
        <Svg width={54} height={54} viewBox="0 0 24 24" fill="none" stroke={SUN} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <Path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </Svg>
      </Animated.View>
      <Float delay={900} style={s.toast}>
        <View style={s.toastIcon}>
          <Text style={s.toastP}>p</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.toastApp}>Punchbook · now</Text>
          <Text style={s.toastTitle}>Your order is ready! Walk in and collect.</Text>
        </View>
      </Float>
    </>
  );
}

function FairScene() {
  return (
    <>
      <View style={[s.blob, { width: 240, height: 240, top: -60, left: -70, backgroundColor: '#ffffff08' }]} />
      <Spark color={MINT} style={{ top: '30%', left: 40 }} />
      <Spark color={SUN} size={8} style={{ bottom: 40, right: 40 }} delay={800} />
      <View style={s.stamp}>
        <Text style={s.stampText}>FAIRER</Text>
      </View>
      <View style={s.bars}>
        <View style={s.col}>
          <Text style={[s.val, s.valOld]}>30%</Text>
          <View style={[s.fill, { height: 120, backgroundColor: colors.accent }]} />
          <Text style={s.who}>DELIVERY APPS</Text>
        </View>
        <View style={s.col}>
          <Text style={s.val}>10%</Text>
          <Float style={[s.fill, { height: 40, backgroundColor: MINT }]} />
          <Text style={s.who}>PUNCHBOOK</Text>
        </View>
      </View>
    </>
  );
}

export function Welcome({ onDone }: { onDone: () => void }) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const list = useRef<FlatList<Slide>>(null);
  const [index, setIndex] = useState(0);
  // Each slide fills exactly the space above the footer.
  const [height, setHeight] = useState(0);
  const last = index === slides.length - 1;

  const onViewable = useRef(({ viewableItems }: { viewableItems: ViewToken<Slide>[] }) => {
    if (viewableItems[0]?.index != null) setIndex(viewableItems[0].index);
  }).current;
  const next = () => (last ? onDone() : list.current?.scrollToIndex({ index: index + 1, animated: true }));

  return (
    <View style={[s.root, { paddingBottom: insets.bottom + 16 }]}>
      <StatusBar style={index === 1 ? 'dark' : 'light'} />
      <View style={s.pager} onLayout={e => setHeight(e.nativeEvent.layout.height)}>
        <FlatList
          ref={list}
          style={{ width }}
          data={slides}
          horizontal
          pagingEnabled
          bounces={false}
          showsHorizontalScrollIndicator={false}
          keyExtractor={sl => sl.key}
          onViewableItemsChanged={onViewable}
          viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
          getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
          renderItem={({ item }) => (
            <View style={{ width, height: height || undefined }}>
              <View style={[s.scene, { backgroundColor: item.bg, paddingTop: insets.top }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                <item.scene />
              </View>
              <View style={s.copy}>
                <Text style={s.title} accessibilityRole="header">
                  {item.title} <Text style={{ color: colors.green }}>{item.highlight}</Text>
                </Text>
                {item.body ? <Text style={s.body}>{item.body()}</Text> : null}
                {item.extra?.()}
              </View>
            </View>
          )}
        />
      </View>

      {/* Brand and Skip sit on top of the coloured scene. */}
      <View style={[s.top, { top: insets.top + 8 }]} pointerEvents="box-none">
        <Text style={[s.brand, index === 1 && { color: colors.ink }]}>
          punchbook<Text style={{ color: index === 1 ? colors.accent : SUN }}>.</Text>
        </Text>
        {!last && (
          <Pressable accessibilityRole="button" onPress={onDone} hitSlop={12} style={[s.skip, index === 1 && { backgroundColor: '#17171318' }]}>
            <Text style={[s.skipText, index === 1 && { color: colors.ink }]}>Skip</Text>
          </Pressable>
        )}
      </View>

      <View style={s.footer}>
        <View style={s.dots} accessibilityLabel={`Step ${index + 1} of ${slides.length}`}>
          {slides.map((sl, i) => (
            <View key={sl.key} style={[s.dot, i === index && s.dotOn]} />
          ))}
        </View>
        <Button label={last ? 'Get started' : 'Next'} onPress={next} />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { ...StyleSheet.absoluteFill, backgroundColor: colors.paper, zIndex: 10, overflow: 'hidden' },
  pager: { flex: 1, overflow: 'hidden' },
  top: { position: 'absolute', left: 22, right: 22, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 40 },
  brand: { fontSize: 21, fontWeight: '900', letterSpacing: -0.8, color: '#fff' },
  skip: { backgroundColor: '#ffffff26', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  skipText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  scene: { flex: 1.15, overflow: 'hidden', borderBottomLeftRadius: 36, borderBottomRightRadius: 36, alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28, gap: 12 },
  title: { fontSize: 34, lineHeight: 37, fontWeight: '900', letterSpacing: -1.3, color: colors.ink, textAlign: 'center' },
  body: { fontSize: 15.5, lineHeight: 23, color: colors.muted, textAlign: 'center', maxWidth: 290 },
  soon: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, borderRadius: 999, paddingVertical: 7, paddingLeft: 10, paddingRight: 14 },
  soonDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent },
  soonText: { fontSize: 13, fontWeight: '800', color: colors.ink },
  footer: { paddingHorizontal: 22, gap: 16, paddingTop: 8 },
  dots: { flexDirection: 'row', gap: 6, alignSelf: 'center' },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#d6d2c6' },
  dotOn: { width: 22, backgroundColor: colors.ink },

  ring: { position: 'absolute', borderWidth: 2 },
  blob: { position: 'absolute', borderRadius: 999, backgroundColor: '#ffffff14' },
  spark: { position: 'absolute', borderRadius: 3, transform: [{ rotate: '45deg' }] },
  bag: { width: 132, height: 138, backgroundColor: colors.paper, borderTopLeftRadius: 22, borderTopRightRadius: 22, borderBottomLeftRadius: 30, borderBottomRightRadius: 30, alignItems: 'center', justifyContent: 'center', elevation: 10 },
  handle: { position: 'absolute', top: -34, width: 64, height: 50, borderWidth: 9, borderBottomWidth: 0, borderColor: colors.paper, borderTopLeftRadius: 40, borderTopRightRadius: 40 },
  bagP: { fontSize: 54, fontWeight: '900', letterSpacing: -2, color: colors.ink, marginTop: 4 },
  step: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.card, borderRadius: 999, paddingVertical: 8, paddingLeft: 8, paddingRight: 14, elevation: 6 },
  stepNum: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  stepNumText: { color: '#fff', fontWeight: '900', fontSize: 12 },
  stepText: { fontWeight: '900', fontSize: 14, color: colors.ink },
  bell: { width: 112, height: 112, borderRadius: 56, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center', marginTop: -70, elevation: 10 },
  toast: { position: 'absolute', left: 22, right: 22, bottom: 24, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.card, borderRadius: 18, padding: 12, elevation: 8 },
  toastIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  toastP: { color: '#fff', fontWeight: '900', fontSize: 20, marginTop: -3 },
  toastApp: { fontSize: 11, color: colors.muted },
  toastTitle: { fontSize: 14.5, fontWeight: '800', color: colors.ink },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 22, marginTop: 30 },
  col: { alignItems: 'center', gap: 8 },
  val: { fontWeight: '900', fontSize: 30, letterSpacing: -1, color: '#fff' },
  valOld: { color: '#ffffff80', textDecorationLine: 'line-through', textDecorationColor: colors.accent },
  fill: { width: 78, borderTopLeftRadius: 14, borderTopRightRadius: 14, borderBottomLeftRadius: 6, borderBottomRightRadius: 6 },
  who: { fontSize: 11, fontWeight: '800', letterSpacing: 1, color: '#ffffffb3' },
  stamp: { position: 'absolute', top: '24%', right: 26, transform: [{ rotate: '10deg' }], borderWidth: 3, borderColor: MINT, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  stampText: { color: MINT, fontWeight: '900', fontSize: 14, letterSpacing: 1 },
});
