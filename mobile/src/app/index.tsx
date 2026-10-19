import { Image } from 'expo-image';
import { Link, router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BagIcon, CloseIcon, ReceiptIcon, ScooterIcon, SearchIcon } from '@/components/icons';
import { Notice } from '@/components/ui';
import { DELIVERY_ENABLED, getRestaurants, imageUrl, type PickupOrder, type PickupStatus, type Restaurant } from '@/lib/api';
import { clock } from '@/lib/format';
import { colors, radius } from '@/lib/theme';
import { useCart } from '@/state/cart';
import { useOrders } from '@/state/orders';

// Wide, sharp cover photos shipped with the app (credits in PHOTO-CREDITS.md); others use the server's cover.
const covers: Record<string, number> = {
  peppermint: require('../../assets/covers/peppermint.jpg'),
  amra: require('../../assets/covers/amra.jpg'),
  glounge: require('../../assets/covers/glounge.jpg'),
  kade: require('../../assets/covers/kade.jpg'),
  sunrise: require('../../assets/covers/sunrise.jpg'),
};

// Quick filters, shown when at least one restaurant lists that cuisine.
const cravings = ['Kottu', 'Coffee', 'Hoppers', 'Bakery', 'Burgers', 'Seafood', 'Waffles', 'Pasta'];

const steps: PickupStatus[] = ['new', 'preparing', 'ready', 'collected'];

export default function Home() {
  const insets = useSafeAreaInsets();
  const { activeOrders } = useOrders();
  const { fulfilment, setFulfilment } = useCart();
  const [restaurants, setRestaurants] = useState<Restaurant[] | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [craving, setCraving] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setRestaurants(await getRestaurants());
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const chips = useMemo(() => cravings.filter(c => restaurants?.some(r => r.cuisine.includes(c))), [restaurants]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (restaurants ?? []).filter(
      r => (!craving || r.cuisine.includes(craving)) && (!q || `${r.name} ${r.cuisine} ${r.area}`.toLowerCase().includes(q)),
    );
  }, [restaurants, query, craving]);

  const delivery = fulfilment === 'delivery';

  const header = (
    <View>
      <View style={styles.brandRow}>
        <Text style={styles.brand}>
          punchbook<Text style={{ color: colors.accent }}>.</Text>
        </Text>
        <Link href="/orders" asChild>
          <Pressable accessibilityRole="button" accessibilityLabel="My orders" style={styles.ordersButton}>
            <ReceiptIcon size={18} />
            <Text style={styles.ordersText}>Orders</Text>
          </Pressable>
        </Link>
      </View>

      <Text style={styles.title}>
        Skip the queue.{'\n'}
        <Text style={{ color: colors.green }}>Eat on time.</Text>
      </Text>

      <View style={styles.search}>
        <SearchIcon color={colors.muted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search restaurants or food"
          placeholderTextColor="#8a8980"
          accessibilityLabel="Search restaurants or food"
          returnKeyType="search"
          style={styles.searchInput}
        />
        {!!query && (
          <Pressable accessibilityRole="button" accessibilityLabel="Clear search" onPress={() => setQuery('')} hitSlop={10}>
            <CloseIcon size={18} color={colors.muted} />
          </Pressable>
        )}
      </View>

      <View style={styles.toggle} accessibilityRole="radiogroup" accessibilityLabel="Pickup or delivery">
        {(['pickup', 'delivery'] as const).map(f => {
          const on = fulfilment === f;
          const soon = f === 'delivery' && !DELIVERY_ENABLED;
          const Glyph = f === 'pickup' ? BagIcon : ScooterIcon;
          return (
            <Pressable
              key={f}
              accessibilityRole="radio"
              accessibilityState={{ checked: on, disabled: soon }}
              accessibilityLabel={soon ? 'Delivery, coming soon' : undefined}
              disabled={soon}
              onPress={() => setFulfilment(f)}
              style={[styles.toggleOption, on && styles.toggleOn]}
            >
              <Glyph size={18} color={on ? '#fff' : soon ? '#a3a198' : '#3d3c36'} />
              <Text style={[styles.toggleText, on && { color: '#fff' }, soon && { color: '#a3a198' }]}>{f === 'pickup' ? 'Pickup' : 'Delivery'}</Text>
              {soon && <Text style={styles.soonTag}>SOON</Text>}
            </Pressable>
          );
        })}
      </View>

      {/* Newest live order only; the rest are a tap away so the menu isn't pushed off screen. */}
      {activeOrders[0] && <LiveOrder order={activeOrders[0]} />}
      {activeOrders.length > 1 && (
        <Link href="/orders" asChild>
          <Pressable accessibilityRole="link" style={styles.liveMore}>
            <Text style={styles.liveMoreText}>
              +{activeOrders.length - 1} more live order{activeOrders.length > 2 ? 's' : ''} →
            </Text>
          </Pressable>
        </Link>
      )}

      {chips.length > 0 && (
        <>
          <Text style={styles.section}>Craving</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} style={styles.chipsRow}>
            {[null, ...chips].map(c => {
              const on = craving === c;
              return (
                <Pressable
                  key={c ?? 'all'}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  onPress={() => setCraving(c)}
                  style={[styles.chip, on && styles.chipOn]}
                >
                  <Text style={[styles.chipText, on && { color: '#fff' }]}>{c ?? 'All'}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </>
      )}

      <Text style={styles.heading}>{craving || query ? 'Results' : 'All restaurants'}</Text>
      {!!error && <Notice message={error} onRetry={load} />}
      {!restaurants && !error && <ActivityIndicator color={colors.ink} style={{ marginTop: 40 }} />}
      {restaurants && shown.length === 0 && (
        <Text style={styles.empty}>No restaurants match. Try another dish or clear the filters.</Text>
      )}
    </View>
  );

  return (
    <FlatList
      data={shown}
      keyExtractor={r => r.id}
      ListHeaderComponent={header}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={[styles.list, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 32 }]}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={async () => {
            setRefreshing(true);
            await load();
            setRefreshing(false);
          }}
        />
      }
      renderItem={({ item }) => <RestaurantCard restaurant={item} delivery={delivery} />}
    />
  );
}

function LiveOrder({ order: o }: { order: PickupOrder }) {
  const delivery = o.fulfilment === 'delivery';
  const labels = delivery ? ['Received', 'Preparing', 'On the way', 'Delivered'] : ['Received', 'Preparing', 'Ready', 'Collected'];
  const current = steps.indexOf(o.orderStatus);
  const waitingForRider = delivery && o.orderStatus === 'preparing' && !!o.kitchenReadyAt;
  const title = {
    new: `Order received by ${o.restaurantName}`,
    preparing: waitingForRider ? `Packed at ${o.restaurantName}` : `Being prepared at ${o.restaurantName}`,
    ready: delivery ? `On its way from ${o.restaurantName}` : `Ready at ${o.restaurantName}`,
    collected: 'Enjoy your food',
    cancelled: 'Order cancelled',
  }[o.orderStatus];
  const sub =
    o.orderStatus === 'ready'
      ? delivery
        ? `The rider is on the way · arriving around ${clock(o.deliverBy || o.pickupAt)}`
        : `Show ${o.id} at the counter`
      : `${waitingForRider ? 'Waiting for the rider · ' : ''}${delivery ? 'Arriving' : 'Ready'} around ${clock(delivery && o.deliverBy ? o.deliverBy : o.pickupAt)}${o.pos?.status === 'synced' && !waitingForRider ? ' · Sent to the kitchen ✓' : ''}`;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${sub}. Open order.`}
      onPress={() => router.push({ pathname: '/order/[id]', params: { id: o.id } })}
      style={({ pressed }) => [styles.live, pressed && { opacity: 0.92 }]}
    >
      <View style={styles.liveTop}>
        <View style={styles.liveTag}>
          <View style={styles.liveDot} />
          <Text style={styles.liveTagText}>Live order</Text>
        </View>
        <Text style={styles.liveCode}>{o.id}</Text>
      </View>
      <Text style={styles.liveTitle}>{title}</Text>
      <Text style={styles.liveSub}>{sub}</Text>
      <View style={styles.progress}>
        {labels.map((l, i) => (
          <View key={l} style={{ flex: 1 }}>
            <View style={[styles.bar, i <= current && styles.barDone]} />
            <Text style={[styles.barLabel, i === current && styles.barLabelNow]}>{l}</Text>
          </View>
        ))}
      </View>
    </Pressable>
  );
}

function RestaurantCard({ restaurant: r, delivery }: { restaurant: Restaurant; delivery: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${r.name}, ${r.cuisine}, ${r.area}, ready in about ${r.prepMinutes} minutes`}
      onPress={() => router.push({ pathname: '/restaurant/[id]', params: { id: r.id } })}
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.9 }]}
    >
      <Image source={covers[r.id] ?? { uri: imageUrl(r.cover) }} style={styles.cover} contentFit="cover" transition={200} />
      <View style={styles.cardBody}>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>{r.name}</Text>
          <Text style={styles.cardMeta} numberOfLines={1}>
            {r.cuisine}
          </Text>
          <Text style={styles.cardArea} numberOfLines={1}>
            {r.area}
          </Text>
          {r.accepting === false && <Text style={styles.closed}>Not taking orders right now</Text>}
        </View>
        <View style={styles.minutes}>
          <Text style={styles.minutesValue}>{r.prepMinutes}</Text>
          <Text style={styles.minutesUnit}>{delivery ? 'min prep' : 'min'}</Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: 18, gap: 14 },
  closed: { marginTop: 4, fontSize: 12, fontWeight: '800', color: colors.error },
  brandRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brand: { fontSize: 24, fontWeight: '900', letterSpacing: -0.8, color: colors.ink },
  ordersButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    minHeight: 44,
  },
  ordersText: { fontWeight: '700', fontSize: 14, color: colors.ink },
  title: { fontSize: 34, lineHeight: 36, fontWeight: '900', letterSpacing: -1.2, color: colors.ink, marginTop: 22 },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    minHeight: 52,
    marginTop: 18,
  },
  searchInput: { flex: 1, fontSize: 15, color: colors.ink, paddingVertical: 12 },
  toggle: { flexDirection: 'row', gap: 4, backgroundColor: '#e8e4d8', borderRadius: 14, padding: 4, marginTop: 12 },
  toggleOption: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 44, borderRadius: 11 },
  toggleOn: { backgroundColor: colors.ink },
  soonTag: { fontSize: 10, fontWeight: '900', letterSpacing: 0.6, color: colors.accent, backgroundColor: '#ffe9e1', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, overflow: 'hidden' },
  toggleText: { fontSize: 14, fontWeight: '700', color: '#3d3c36' },
  live: { backgroundColor: colors.ink, borderRadius: 20, padding: 16, marginTop: 16 },
  liveTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  liveTag: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#3fd18b' },
  liveTagText: { fontSize: 12, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase', color: '#a8e3c6' },
  liveCode: { fontSize: 12, color: '#c9c7bd' },
  liveTitle: { fontSize: 21, fontWeight: '900', letterSpacing: -0.5, color: '#fff', marginTop: 8 },
  liveSub: { fontSize: 14, color: '#d8d6cc', marginTop: 4 },
  liveMore: { alignSelf: 'flex-start', paddingVertical: 10, paddingHorizontal: 4, minHeight: 44, justifyContent: 'center' },
  liveMoreText: { fontSize: 14, fontWeight: '800', color: colors.green },
  progress: { flexDirection: 'row', gap: 6, marginTop: 14 },
  bar: { height: 6, borderRadius: 3, backgroundColor: '#4a4a43' },
  barDone: { backgroundColor: '#3fd18b' },
  barLabel: { fontSize: 11, color: '#b5b3a9', marginTop: 6 },
  barLabelNow: { color: '#fff', fontWeight: '800' },
  section: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    color: colors.muted,
    marginTop: 24,
  },
  chipsRow: { marginHorizontal: -18, marginTop: 10 },
  chips: { gap: 8, paddingHorizontal: 18 },
  chip: {
    minHeight: 44,
    paddingHorizontal: 16,
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
  },
  chipOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  chipText: { fontSize: 14, fontWeight: '700', color: colors.ink },
  heading: { fontSize: 22, fontWeight: '900', letterSpacing: -0.5, color: colors.ink, marginTop: 26, marginBottom: 2 },
  empty: { fontSize: 14, color: colors.muted, marginTop: 10 },
  card: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' },
  cover: { height: 170, backgroundColor: colors.line },
  cardBody: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 16 },
  cardTitle: { fontSize: 20, fontWeight: '900', letterSpacing: -0.4, color: colors.ink },
  cardMeta: { fontSize: 14, color: colors.muted, marginTop: 3 },
  cardArea: { fontSize: 13, color: colors.muted, marginTop: 3 },
  minutes: { alignItems: 'center', backgroundColor: colors.paper, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 8, minWidth: 52 },
  minutesValue: { fontSize: 18, fontWeight: '900', color: colors.ink, lineHeight: 20 },
  minutesUnit: { fontSize: 11, color: colors.muted, marginTop: 2 },
});
