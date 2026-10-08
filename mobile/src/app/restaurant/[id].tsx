import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Notice, Stepper } from '@/components/ui';
import { getRestaurant, imageUrl, type MenuItem, type Restaurant } from '@/lib/api';
import { money } from '@/lib/format';
import { colors, radius } from '@/lib/theme';
import { useCart } from '@/state/cart';

type FullRestaurant = Restaurant & { menu: MenuItem[] };

export default function RestaurantScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const cart = useCart();
  const [restaurant, setRestaurant] = useState<FullRestaurant | null>(null);
  const [error, setError] = useState('');
  const [category, setCategory] = useState('All');

  const load = useCallback(async () => {
    try {
      setRestaurant(await getRestaurant(id));
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const categories = useMemo(() => ['All', ...new Set(restaurant?.menu.map(m => m.category))], [restaurant]);
  const items = restaurant?.menu.filter(m => category === 'All' || m.category === category) ?? [];
  const bagHere = cart.restaurant?.id === id && cart.count > 0;

  const add = (item: MenuItem) => {
    if (!restaurant || cart.add(restaurant, item)) return;
    Alert.alert('Start a new bag?', `Your bag has items from ${cart.restaurant?.name}. Clear it to order from ${restaurant.name}?`, [
      { text: 'Keep bag', style: 'cancel' },
      {
        text: 'New bag',
        style: 'destructive',
        onPress: () => cart.startNew(restaurant, item),
      },
    ]);
  };

  const backButton = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Back"
      onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
      style={[styles.back, { top: insets.top + 10 }]}
    >
      <Text style={styles.backText}>←</Text>
    </Pressable>
  );

  if (!restaurant)
    return (
      <View style={[styles.center, { paddingTop: insets.top + 70 }]}>
        {backButton}
        {error ? <Notice message={error} onRetry={load} /> : <ActivityIndicator color={colors.ink} />}
      </View>
    );

  const header = (
    <View>
      <Image source={{ uri: imageUrl(restaurant.cover) }} style={[styles.hero, { height: 230 + insets.top }]} contentFit="cover" />
      <View style={styles.info}>
        <Text style={styles.eyebrow}>{restaurant.area}</Text>
        <Text style={styles.name}>{restaurant.name}</Text>
        <Text style={styles.cuisine}>{restaurant.cuisine}</Text>
        <View style={styles.pickupRow}>
          <Text style={styles.pickupText}>🛍  Pickup · ready in about {restaurant.prepMinutes} min</Text>
        </View>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cats}>
        {categories.map(c => (
          <Pressable
            key={c}
            accessibilityRole="button"
            accessibilityState={{ selected: c === category }}
            onPress={() => setCategory(c)}
            style={[styles.cat, c === category && styles.catActive]}
          >
            <Text style={[styles.catText, c === category && { color: '#fff' }]}>{c}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={items}
        keyExtractor={m => m.id}
        ListHeaderComponent={header}
        contentContainerStyle={{ paddingBottom: insets.bottom + (bagHere ? 110 : 30) }}
        renderItem={({ item }) => (
          <View style={styles.item}>
            <View style={{ flex: 1 }}>
              <Text style={styles.itemName}>{item.name}</Text>
              <Text style={styles.itemDesc} numberOfLines={2}>
                {item.desc}
              </Text>
              <Text style={styles.price}>{money(item.price)}</Text>
            </View>
            <View>
              <Image source={{ uri: imageUrl(item.image) }} style={styles.food} contentFit="cover" transition={150} />
              <View style={styles.stepperSpot}>
                <Stepper
                  label={item.name}
                  qty={cart.restaurant?.id === id ? cart.qtyOf(item.id) : 0}
                  onAdd={() => add(item)}
                  onRemove={() => cart.remove(item.id)}
                />
              </View>
            </View>
          </View>
        )}
      />
      {backButton}
      {bagHere && (
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/checkout')}
          style={[styles.bagBar, { bottom: insets.bottom + 16 }]}
        >
          <View>
            <Text style={styles.bagCount}>
              {cart.count} item{cart.count === 1 ? '' : 's'}
            </Text>
            <Text style={styles.bagTotal}>{money(cart.total)}</Text>
          </View>
          <Text style={styles.bagCta}>View bag →</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, paddingHorizontal: 18 },
  back: {
    position: 'absolute',
    left: 16,
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.94)',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
  },
  backText: { fontSize: 22, fontWeight: '800', color: colors.ink, marginTop: -2 },
  hero: { width: '100%', backgroundColor: colors.line },
  info: { paddingHorizontal: 18, paddingTop: 20 },
  eyebrow: { fontSize: 12, fontWeight: '800', letterSpacing: 1.2, textTransform: 'uppercase', color: colors.muted },
  name: { fontSize: 34, fontWeight: '900', letterSpacing: -1.4, color: colors.ink, marginTop: 6 },
  cuisine: { fontSize: 15, color: colors.muted, marginTop: 4 },
  pickupRow: {
    marginTop: 14,
    backgroundColor: colors.greenSoft,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    alignSelf: 'flex-start',
  },
  pickupText: { color: '#3f5a2e', fontWeight: '700', fontSize: 13 },
  cats: { paddingHorizontal: 18, paddingVertical: 18, gap: 8 },
  cat: {
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: radius.pill,
  },
  catActive: { backgroundColor: colors.ink, borderColor: colors.ink },
  catText: { fontWeight: '700', color: colors.ink },
  item: {
    flexDirection: 'row',
    gap: 14,
    marginHorizontal: 18,
    marginBottom: 12,
    padding: 14,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
  },
  itemName: { fontSize: 16, fontWeight: '800', color: colors.ink },
  itemDesc: { fontSize: 13, lineHeight: 18, color: colors.muted, marginTop: 4 },
  price: { fontSize: 15, fontWeight: '800', color: colors.ink, marginTop: 10 },
  food: { width: 104, height: 104, borderRadius: radius.md, backgroundColor: colors.line },
  stepperSpot: { position: 'absolute', right: -6, bottom: -8 },
  bagBar: {
    position: 'absolute',
    left: 16,
    right: 16,
    backgroundColor: colors.ink,
    borderRadius: radius.lg,
    paddingHorizontal: 20,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    elevation: 8,
  },
  bagCount: { color: '#fff', fontWeight: '800', fontSize: 15 },
  bagTotal: { color: '#bbb', fontSize: 13, marginTop: 2 },
  bagCta: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
