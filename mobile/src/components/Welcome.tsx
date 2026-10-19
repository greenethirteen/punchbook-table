// First-launch tour: four swipeable slides on why Punchbook (no queue, no hidden fees, fair to
// restaurants, live updates). Shown once; _layout.tsx remembers it was seen.
import { useRef, useState } from "react";
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type ViewToken,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BagIcon, ScooterIcon } from "@/components/icons";
import { Button } from "@/components/ui";
import { DELIVERY_FEE } from "@/lib/api";
import { money } from "@/lib/format";
import { colors, radius } from "@/lib/theme";

type Slide = {
  key: string;
  title: string;
  highlight: string;
  body: string;
  art: () => React.ReactElement;
};

const slides: Slide[] = [
  {
    key: "queue",
    title: "Skip the queue.",
    highlight: "Eat on time.",
    body: "Order ahead from your favourite local spots and walk in when it’s ready. No waiting at the counter.",
    art: QueueArt,
  },
  {
    key: "fees",
    title: "No hidden fees.",
    highlight: "Ever.",
    body: `Pickup is free, with no service charge. Delivery is a flat ${money(DELIVERY_FEE)}. What you see is what you pay.`,
    art: FeesArt,
  },
  {
    key: "fair",
    title: "Fair to restaurants.",
    highlight: "Fair to you.",
    body: "Big delivery apps can take up to 30% of every order. Punchbook takes a fraction, so more of your money goes to the kitchen.",
    art: FairArt,
  },
  {
    key: "live",
    title: "Know the moment",
    highlight: "it’s ready.",
    body: "Follow your order live and get a nudge on your phone when it’s ready or on its way.",
    art: LiveArt,
  },
];

export function Welcome({ onDone }: { onDone: () => void }) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const list = useRef<FlatList<Slide>>(null);
  const [index, setIndex] = useState(0);
  // Each slide is exactly one screen of the space between the header and the footer.
  const [height, setHeight] = useState(0);
  const last = index === slides.length - 1;

  const onViewable = useRef(
    ({ viewableItems }: { viewableItems: ViewToken<Slide>[] }) => {
      if (viewableItems[0]?.index != null) setIndex(viewableItems[0].index);
    },
  ).current;

  const next = () =>
    last
      ? onDone()
      : list.current?.scrollToIndex({ index: index + 1, animated: true });

  return (
    <View
      style={[
        styles.root,
        { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 16 },
      ]}
    >
      <View style={styles.top}>
        <Text style={styles.brand}>
          punchbook<Text style={{ color: colors.accent }}>.</Text>
        </Text>
        {!last && (
          <Pressable
            accessibilityRole="button"
            onPress={onDone}
            hitSlop={12}
            style={styles.skip}
          >
            <Text style={styles.skipText}>Skip</Text>
          </Pressable>
        )}
      </View>

      <View
        style={styles.pager}
        onLayout={(e) => setHeight(e.nativeEvent.layout.height)}
      >
        <FlatList
          ref={list}
          style={{ width }}
          data={slides}
          horizontal
          pagingEnabled
          bounces={false}
          showsHorizontalScrollIndicator={false}
          keyExtractor={(s) => s.key}
          onViewableItemsChanged={onViewable}
          viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
          getItemLayout={(_, i) => ({
            length: width,
            offset: width * i,
            index: i,
          })}
          renderItem={({ item }) => (
            <View
              style={[styles.slide, { width, height: height || undefined }]}
            >
              <View style={styles.art}>
                <item.art />
              </View>
              <Text style={styles.title} accessibilityRole="header">
                {item.title}
                {"\n"}
                <Text style={{ color: colors.green }}>{item.highlight}</Text>
              </Text>
              <Text style={styles.body}>{item.body}</Text>
            </View>
          )}
        />
      </View>

      <View style={styles.footer}>
        <View
          style={styles.dots}
          accessibilityLabel={`Step ${index + 1} of ${slides.length}`}
        >
          {slides.map((s, i) => (
            <View
              key={s.key}
              style={[styles.dot, i === index && styles.dotOn]}
            />
          ))}
        </View>
        <Button label={last ? "Get started" : "Next"} onPress={next} />
      </View>
    </View>
  );
}

// ---- Illustrations, drawn with the app's own cards so they look like the real thing.

function QueueArt() {
  return (
    <View style={art.stage}>
      <View style={[art.blob, { backgroundColor: colors.greenSoft }]} />
      <View style={[art.liveCard, { transform: [{ rotate: "-3deg" }] }]}>
        <View style={art.liveTop}>
          <View style={art.liveDot} />
          <Text style={art.liveTag}>LIVE ORDER</Text>
        </View>
        <Text style={art.liveTitle}>Ready at G Lounge</Text>
        <Text style={art.liveSub}>Show PB-7KQ2M at the counter</Text>
        <View style={art.progress}>
          {[0, 1, 2, 3].map((i) => (
            <View key={i} style={[art.bar, i < 3 && art.barOn]} />
          ))}
        </View>
      </View>
      <View
        style={[
          art.badge,
          { right: 18, top: 6, backgroundColor: colors.accent },
        ]}
      >
        <BagIcon size={26} color="#fff" />
      </View>
    </View>
  );
}

function FeesArt() {
  const Row = ({
    label,
    value,
    free,
  }: {
    label: string;
    value: string;
    free?: boolean;
  }) => (
    <View style={art.row}>
      <Text style={art.rowLabel}>{label}</Text>
      {free ? (
        <View style={art.freeTag}>
          <Text style={art.freeText}>{value}</Text>
        </View>
      ) : (
        <Text style={art.rowValue}>{value}</Text>
      )}
    </View>
  );
  return (
    <View style={art.stage}>
      <View style={[art.blob, { backgroundColor: colors.amberSoft }]} />
      <View style={[art.receipt, { transform: [{ rotate: "2deg" }] }]}>
        <Text style={art.receiptTitle}>Your bag</Text>
        <Row label="Kottu & a mojito" value={money(2680)} />
        <Row label="Service charge" value="LKR 0" free />
        <Row label="Pickup" value="Free" free />
        <View style={art.divider} />
        <View style={art.row}>
          <Text style={art.total}>Total</Text>
          <Text style={art.total}>{money(2680)}</Text>
        </View>
      </View>
    </View>
  );
}

function FairArt() {
  return (
    <View style={art.stage}>
      <View style={[art.blob, { backgroundColor: "#fde3da" }]} />
      <View style={art.compare}>
        <Text style={art.compareTitle}>What the restaurant pays the app</Text>
        <Text style={art.compareLabel}>Big delivery apps</Text>
        <View style={art.track}>
          <View
            style={[
              art.fill,
              { width: "100%", backgroundColor: colors.accent },
            ]}
          >
            <Text style={art.fillText}>up to 30%</Text>
          </View>
        </View>
        <Text style={[art.compareLabel, { marginTop: 14 }]}>Punchbook</Text>
        <View style={art.track}>
          <View
            style={[art.fill, { width: "34%", backgroundColor: colors.green }]}
          >
            <Text style={art.fillText}>10%</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

function LiveArt() {
  return (
    <View style={art.stage}>
      <View style={[art.blob, { backgroundColor: "#e3ecf7" }]} />
      <View style={[art.note, { top: 30, transform: [{ rotate: "-2deg" }] }]}>
        <View style={[art.noteIcon, { backgroundColor: colors.ink }]}>
          <Text style={art.noteP}>p</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={art.noteApp}>Punchbook · now</Text>
          <Text style={art.noteTitle}>Your order is ready! 🛍</Text>
          <Text style={art.noteBody}>Show PB-7KQ2M at the counter.</Text>
        </View>
      </View>
      <View
        style={[
          art.note,
          {
            top: 128,
            left: 34,
            right: 6,
            opacity: 0.92,
            transform: [{ rotate: "2deg" }],
          },
        ]}
      >
        <View style={[art.noteIcon, { backgroundColor: colors.green }]}>
          <ScooterIcon size={18} color="#fff" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={art.noteApp}>Punchbook · 2 min ago</Text>
          <Text style={art.noteTitle}>Your order is on the way</Text>
          <Text style={art.noteBody}>Arriving around 7:45 PM.</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.paper,
    zIndex: 10,
    overflow: "hidden",
  },
  top: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 22,
    minHeight: 44,
  },
  brand: {
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: -0.8,
    color: colors.ink,
  },
  skip: { paddingHorizontal: 12, paddingVertical: 8 },
  skipText: { fontSize: 15, fontWeight: "700", color: colors.muted },
  pager: { flex: 1, overflow: "hidden" },
  slide: { paddingHorizontal: 26, paddingBottom: 8 },
  art: { flex: 1, justifyContent: "center", minHeight: 240 },
  title: {
    fontSize: 34,
    lineHeight: 38,
    fontWeight: "900",
    letterSpacing: -1.2,
    color: colors.ink,
  },
  body: {
    fontSize: 16,
    lineHeight: 23,
    color: colors.muted,
    marginTop: 12,
    marginBottom: 8,
  },
  footer: { paddingHorizontal: 22, gap: 18, paddingTop: 12 },
  dots: { flexDirection: "row", gap: 6, alignSelf: "center" },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#d6d2c6" },
  dotOn: { width: 22, backgroundColor: colors.ink },
});

const art = StyleSheet.create({
  stage: { height: 280, justifyContent: "center" },
  blob: {
    position: "absolute",
    alignSelf: "center",
    width: 250,
    height: 250,
    borderRadius: 125,
  },
  badge: {
    position: "absolute",
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    elevation: 4,
  },
  liveCard: {
    backgroundColor: colors.ink,
    borderRadius: 22,
    padding: 18,
    marginHorizontal: 6,
    elevation: 6,
  },
  liveTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#3fd18b" },
  liveTag: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.8,
    color: "#a8e3c6",
  },
  liveTitle: {
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: -0.5,
    color: "#fff",
    marginTop: 10,
  },
  liveSub: { fontSize: 14, color: "#d8d6cc", marginTop: 4 },
  progress: { flexDirection: "row", gap: 6, marginTop: 16 },
  bar: { flex: 1, height: 5, borderRadius: 3, backgroundColor: "#4a4a43" },
  barOn: { backgroundColor: "#3fd18b" },
  receipt: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: 20,
    marginHorizontal: 18,
    borderWidth: 1,
    borderColor: colors.line,
    elevation: 6,
  },
  receiptTitle: {
    fontSize: 17,
    fontWeight: "900",
    color: colors.ink,
    marginBottom: 10,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 6,
  },
  rowLabel: { fontSize: 14, color: colors.muted },
  rowValue: { fontSize: 14, fontWeight: "700", color: colors.ink },
  freeTag: {
    backgroundColor: colors.greenSoft,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  freeText: { fontSize: 13, fontWeight: "800", color: colors.green },
  divider: { height: 1, backgroundColor: colors.line, marginVertical: 6 },
  total: { fontSize: 18, fontWeight: "900", color: colors.ink },
  compare: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: 20,
    marginHorizontal: 12,
    borderWidth: 1,
    borderColor: colors.line,
    elevation: 6,
  },
  compareTitle: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: colors.muted,
    marginBottom: 14,
  },
  compareLabel: {
    fontSize: 15,
    fontWeight: "800",
    color: colors.ink,
    marginBottom: 6,
  },
  track: {
    height: 34,
    borderRadius: 10,
    backgroundColor: "#f1eee6",
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    borderRadius: 10,
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  fillText: { color: "#fff", fontWeight: "900", fontSize: 14 },
  note: {
    position: "absolute",
    left: 6,
    right: 30,
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
    backgroundColor: colors.card,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.line,
    elevation: 6,
  },
  noteIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  noteP: { color: "#fff", fontWeight: "900", fontSize: 20, marginTop: -3 },
  noteApp: { fontSize: 11, color: colors.muted },
  noteTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: colors.ink,
    marginTop: 1,
  },
  noteBody: { fontSize: 13, color: colors.muted, marginTop: 1 },
});
