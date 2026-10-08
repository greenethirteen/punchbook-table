import { router } from 'expo-router';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Button, StatusPill } from '@/components/ui';
import { dayAndClock, money } from '@/lib/format';
import { colors, radius } from '@/lib/theme';
import { useOrders } from '@/state/orders';

export default function Orders() {
  const { orders } = useOrders();
  const paid = orders.filter(o => o.paymentStatus === 'paid');

  return (
    <FlatList
      data={paid}
      keyExtractor={o => o.id}
      contentContainerStyle={styles.list}
      ListEmptyComponent={
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No orders yet</Text>
          <Text style={styles.muted}>Orders you place will show up here.</Text>
          <Button label="Browse restaurants" onPress={() => router.dismissTo('/')} style={{ marginTop: 20, alignSelf: 'stretch' }} />
        </View>
      }
      renderItem={({ item: o }) => (
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push({ pathname: '/order/[id]', params: { id: o.id } })}
          style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{o.restaurantName}</Text>
            <Text style={styles.muted}>
              {dayAndClock(o.createdAt)} · {o.items.reduce((n, i) => n + i.qty, 0)} items · {money(o.total)}
            </Text>
          </View>
          <StatusPill status={o.orderStatus} />
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: 18, gap: 10, flexGrow: 1 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 16,
  },
  name: { fontSize: 16, fontWeight: '800', color: colors.ink },
  muted: { fontSize: 13, color: colors.muted, marginTop: 3 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28 },
  emptyTitle: { fontSize: 22, fontWeight: '900', color: colors.ink, marginBottom: 4 },
});
