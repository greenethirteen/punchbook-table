import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Notice, statusCopy } from '@/components/ui';
import { getOrder, type PickupStatus } from '@/lib/api';
import { clock, dayAndClock, money } from '@/lib/format';
import { colors, radius } from '@/lib/theme';
import { useOrders } from '@/state/orders';

const pickupSteps: { status: PickupStatus; label: string }[] = [
  { status: 'new', label: 'Order received' },
  { status: 'preparing', label: 'Being prepared' },
  { status: 'ready', label: 'Ready at the counter' },
  { status: 'collected', label: 'Collected' },
];

// Delivery orders move through the same statuses; "ready" means it has left the kitchen.
const deliverySteps: { status: PickupStatus; label: string }[] = [
  { status: 'new', label: 'Order received' },
  { status: 'preparing', label: 'Being prepared' },
  { status: 'ready', label: 'Out for delivery' },
  { status: 'collected', label: 'Delivered' },
];

export default function OrderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { orders, stale, saveOrder } = useOrders();
  const order = orders.find(o => o.id === id);
  const [missing, setMissing] = useState(false);

  // Orders opened from history may not be in the active poll; fetch once on open.
  useEffect(() => {
    getOrder(id)
      .then(saveOrder)
      .catch(e => e.status === 404 && setMissing(true));
  }, [id, saveOrder]);

  if (!order)
    return (
      <View style={{ padding: 18 }}>
        {missing ? <Notice message="We couldn’t find this order." /> : <ActivityIndicator color={colors.ink} style={{ marginTop: 40 }} />}
      </View>
    );

  const delivery = order.fulfilment === 'delivery';
  const steps = delivery ? deliverySteps : pickupSteps;
  const current = steps.findIndex(s => s.status === order.orderStatus);
  const copy = delivery
    ? { ...statusCopy[order.orderStatus], title: { new: 'Order received', preparing: 'Being prepared', ready: 'On its way', collected: 'Delivered' }[order.orderStatus] }
    : statusCopy[order.orderStatus];
  const headline = delivery
    ? {
        new: `Waiting for ${order.restaurantName} to start your order.`,
        preparing: `The kitchen is on it. Arriving around ${clock(order.pickupAt)}.`,
        ready: 'Your order has left the kitchen and is on its way to you.',
        collected: 'Enjoy your food! Thanks for ordering with Punchbook.',
      }[order.orderStatus]
    : {
    new: `Waiting for ${order.restaurantName} to start your order.`,
    preparing: `The kitchen is on it. Pickup around ${clock(order.pickupAt)}.`,
    ready: `Head to the counter at ${order.restaurantName} and show your code.`,
        collected: 'Enjoy your food! Thanks for ordering ahead.',
      }[order.orderStatus];

  return (
    <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 30 }]}>
      <View style={[styles.hero, { backgroundColor: copy.bg }]}>
        <Text style={[styles.heroTitle, { color: order.orderStatus === 'ready' ? '#fff' : colors.ink }]}>{copy.title}</Text>
        <Text style={[styles.heroText, { color: order.orderStatus === 'ready' ? '#e3f3ea' : '#4d4c45' }]}>{headline}</Text>
        {order.pos?.status === 'synced' && ['new', 'preparing'].includes(order.orderStatus) && (
          <Text style={styles.kitchen}>✓ Sent to the kitchen{order.pos.ticketNumber ? ` · ticket #${order.pos.ticketNumber}` : ''}</Text>
        )}
        <View style={styles.codeBox}>
          <Text style={styles.codeLabel}>{delivery ? 'Order code' : 'Pickup code'}</Text>
          <Text style={styles.code} selectable>
            {order.id}
          </Text>
          <Text style={styles.codeName}>for {order.customer.name}</Text>
        </View>
      </View>

      {stale.has(order.id) && order.orderStatus !== 'collected' && (
        <View style={{ marginTop: 14 }}>
          <Notice message="Live updates stopped because the demo server restarted. This is the last status we saw." />
        </View>
      )}

      <View style={styles.card}>
        {steps.map((s, i) => {
          const done = i <= current;
          return (
            <View key={s.status} style={styles.step}>
              <View style={styles.rail}>
                <View style={[styles.dot, done && styles.dotDone, i === current && styles.dotCurrent]} />
                {i < steps.length - 1 && <View style={[styles.bar, i < current && styles.barDone]} />}
              </View>
              <Text style={[styles.stepText, done ? styles.stepDone : null, i === current && { fontWeight: '900' }]}>{s.label}</Text>
            </View>
          );
        })}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>{order.restaurantName}</Text>
        <Text style={styles.muted}>{order.restaurantArea}</Text>
        <Text style={[styles.muted, { marginTop: 8 }]}>
          {delivery ? 'Delivery' : 'Pickup'} {order.asap ? 'ASAP · ' : ''}
          {dayAndClock(order.pickupAt)}
        </Text>
        {delivery && order.customer.address && (
          <Text style={[styles.muted, { marginTop: 4 }]}>
            To {order.customer.address.line}
            {order.customer.address.details ? ` · ${order.customer.address.details}` : ''}
          </Text>
        )}
        <View style={styles.divider} />
        {order.items.map(i => (
          <View key={i.id} style={styles.row}>
            <Text style={styles.rowText}>
              {i.qty} × {i.name}
            </Text>
            <Text style={styles.rowText}>{money(i.price * i.qty)}</Text>
          </View>
        ))}
        {!!order.deliveryFee && (
          <View style={styles.row}>
            <Text style={styles.rowText}>Delivery</Text>
            <Text style={styles.rowText}>{money(order.deliveryFee)}</Text>
          </View>
        )}
        {!!order.note && <Text style={styles.note}>“{order.note}”</Text>}
        <View style={styles.divider} />
        <View style={styles.row}>
          <Text style={styles.total}>Paid · {order.paymentMethod === 'justpay' ? 'JustPay' : 'Card'}</Text>
          <Text style={styles.total}>{money(order.total)}</Text>
        </View>
      </View>

      <Button label="Back to restaurants" variant="secondary" onPress={() => router.dismissTo('/')} style={{ marginTop: 18 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 18 },
  hero: { borderRadius: radius.lg, padding: 22 },
  heroTitle: { fontSize: 30, fontWeight: '900', letterSpacing: -1 },
  heroText: { fontSize: 15, lineHeight: 21, marginTop: 6 },
  kitchen: { fontSize: 13, fontWeight: '800', color: colors.green, marginTop: 8 },
  codeBox: { backgroundColor: '#fff', borderRadius: radius.md, padding: 16, marginTop: 18, alignItems: 'center' },
  codeLabel: { fontSize: 12, fontWeight: '800', letterSpacing: 1.2, textTransform: 'uppercase', color: colors.muted },
  code: { fontSize: 32, fontWeight: '900', letterSpacing: 2, color: colors.ink, marginTop: 4 },
  codeName: { fontSize: 14, color: colors.muted, marginTop: 2 },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 18,
    marginTop: 14,
  },
  step: { flexDirection: 'row', gap: 14, minHeight: 44 },
  rail: { alignItems: 'center', width: 18 },
  dot: { width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: '#cfcbbf', backgroundColor: '#fff', marginTop: 2 },
  dotDone: { backgroundColor: colors.green, borderColor: colors.green },
  dotCurrent: { transform: [{ scale: 1.25 }] },
  bar: { flex: 1, width: 2, backgroundColor: '#e2ded3', marginVertical: 3 },
  barDone: { backgroundColor: colors.green },
  stepText: { fontSize: 15, color: '#9b9a93', paddingTop: 0 },
  stepDone: { color: colors.ink, fontWeight: '700' },
  cardTitle: { fontSize: 18, fontWeight: '900', color: colors.ink },
  muted: { fontSize: 14, color: colors.muted, marginTop: 2 },
  divider: { height: 1, backgroundColor: colors.line, marginVertical: 12 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3, gap: 12 },
  rowText: { fontSize: 14, color: colors.ink, flexShrink: 1 },
  note: { fontSize: 13, color: colors.muted, fontStyle: 'italic', marginTop: 8 },
  total: { fontSize: 16, fontWeight: '900', color: colors.ink },
});
