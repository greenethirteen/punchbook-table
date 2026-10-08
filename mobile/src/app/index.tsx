import { Image } from 'expo-image';
import { Link, router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Notice, statusCopy } from '@/components/ui';
import { getRestaurants, imageUrl, type Restaurant } from '@/lib/api';
import { clock } from '@/lib/format';
import { colors, radius } from '@/lib/theme';
import { useOrders } from '@/state/orders';

export default function Home() {
  const insets = useSafeAreaInsets();
  const { activeOrders } = useOrders();
  const [restaurants, setRestaurants] = useState<Restaurant[] | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

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

  const header = (
    <View>
      <View style={styles.brandRow}>
        <Text style={styles.brand}>
          punchbook<Text style={{ color: colors.accent }}>.</Text>
          <Text style={styles.brandSub}> pickup</Text>
        </Text>
        <Link href="/orders" asChild>
          <Pressable accessibilityRole="button" style={styles.ordersButton}>
            <Text style={styles.ordersText}>My orders</Text>
          </Pressable>
        </Link>
      </View>
      <Text style={styles.title}>Order ahead.{'\n'}Skip the queue.</Text>
      <Text style={styles.subtitle}>Pay on your phone, then collect at the counter when it’s ready.</Text>

      {activeOrders.map(o => (
        <Pressable
          key={o.id}
          accessibilityRole="button"
          onPress={() => router.push({ pathname: '/order/[id]', params: { id: o.id } })}
          style={[styles.active, o.orderStatus === 'ready' && { backgroundColor: colors.green }]}
        >
          <View style={{ flex: 1 }}>
            <Text style={[styles.activeTitle, o.orderStatus === 'ready' && { color: '#fff' }]}>
              {statusCopy[o.orderStatus].title} · {o.restaurantName}
            </Text>
            <Text style={[styles.activeSub, o.orderStatus === 'ready' && { color: '#e3f3ea' }]}>
              {o.orderStatus === 'ready' ? `Show ${o.id} at the counter` : `Pickup around ${clock(o.pickupAt)}`}
            </Text>
          </View>
          <Text style={[styles.activeArrow, o.orderStatus === 'ready' && { color: '#fff' }]}>→</Text>
        </Pressable>
      ))}

      <Text style={styles.section}>Restaurants</Text>
      {!!error && <Notice message={error} onRetry={load} />}
      {!restaurants && !error && <ActivityIndicator color={colors.ink} style={{ marginTop: 40 }} />}
    </View>
  );

  return (
    <FlatList
      data={restaurants ?? []}
      keyExtractor={r => r.id}
      ListHeaderComponent={header}
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
      renderItem={({ item }) => <RestaurantCard restaurant={item} />}
    />
  );
}

function RestaurantCard({ restaurant: r }: { restaurant: Restaurant }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${r.name}, ${r.cuisine}, ready in about ${r.prepMinutes} minutes`}
      onPress={() => router.push({ pathname: '/restaurant/[id]', params: { id: r.id } })}
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.9 }]}
    >
      <Image source={{ uri: imageUrl(r.cover) }} style={styles.cover} contentFit="cover" transition={200} />
      <View style={styles.cardBody}>
        <Text style={styles.cardTitle}>{r.name}</Text>
        <Text style={styles.cardMeta}>{r.cuisine}</Text>
        <View style={styles.tags}>
          <Text style={[styles.tag, styles.tagStrong]}>Ready in ~{r.prepMinutes} min</Text>
          <Text style={styles.tag}>{r.area}</Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: 18, gap: 16 },
  brandRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brand: { fontSize: 23, fontWeight: '900', letterSpacing: -0.8, color: colors.ink },
  brandSub: { fontSize: 15, fontWeight: '700', color: colors.muted, letterSpacing: 0 },
  ordersButton: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  ordersText: { fontWeight: '700', color: '#444' },
  title: { fontSize: 38, lineHeight: 40, fontWeight: '900', letterSpacing: -1.6, color: colors.ink, marginTop: 28 },
  subtitle: { fontSize: 15, lineHeight: 21, color: colors.muted, marginTop: 10, marginBottom: 8 },
  active: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.amberSoft,
    borderRadius: radius.md,
    padding: 16,
    marginTop: 14,
  },
  activeTitle: { fontSize: 15, fontWeight: '800', color: colors.ink },
  activeSub: { fontSize: 13, color: '#725529', marginTop: 3 },
  activeArrow: { fontSize: 20, fontWeight: '800', color: colors.ink, marginLeft: 12 },
  section: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: colors.muted,
    marginTop: 28,
    marginBottom: 12,
  },
  card: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' },
  cover: { height: 170, backgroundColor: colors.line },
  cardBody: { padding: 16 },
  cardTitle: { fontSize: 21, fontWeight: '900', letterSpacing: -0.6, color: colors.ink },
  cardMeta: { fontSize: 14, color: colors.muted, marginTop: 4 },
  tags: { flexDirection: 'row', gap: 8, marginTop: 12, flexWrap: 'wrap' },
  tag: {
    fontSize: 12,
    fontWeight: '700',
    color: '#555',
    backgroundColor: colors.paper,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
    overflow: 'hidden',
  },
  tagStrong: { backgroundColor: colors.greenSoft, color: '#3f5a2e' },
});
