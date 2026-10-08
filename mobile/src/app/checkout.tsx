import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Notice, Stepper } from '@/components/ui';
import { payByCard, payByJustPay, placeOrder, verifyPayment, type PaymentMethod, type PickupOrder } from '@/lib/api';
import { clock, money } from '@/lib/format';
import { colors, radius } from '@/lib/theme';
import { useCart } from '@/state/cart';
import { useOrders } from '@/state/orders';

const SLOT_MINUTES = 15;

/** ASAP plus the next few 15-minute slots after the kitchen's prep time. */
function pickupSlots(prepMinutes: number) {
  const first = Math.ceil((Date.now() + (prepMinutes + 10) * 60000) / (SLOT_MINUTES * 60000)) * SLOT_MINUTES * 60000;
  return Array.from({ length: 5 }, (_, i) => new Date(first + i * SLOT_MINUTES * 60000).toISOString());
}

export default function Checkout() {
  const insets = useSafeAreaInsets();
  const cart = useCart();
  const { profile, saveProfile, saveOrder } = useOrders();
  const [name, setName] = useState(profile.name);
  const [phone, setPhone] = useState(profile.phone);
  const [note, setNote] = useState('');
  const [pickupAt, setPickupAt] = useState<'asap' | string>('asap');
  const [payment, setPayment] = useState<PaymentMethod>('card');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // If payment fails after the order is created, retrying pays for the same order.
  const [unpaid, setUnpaid] = useState<PickupOrder | null>(null);

  // The saved profile loads asynchronously on first launch.
  useEffect(() => {
    setName(n => n || profile.name);
    setPhone(p => p || profile.phone);
  }, [profile]);

  // Any change to the order means the next attempt places a fresh one.
  useEffect(() => setUnpaid(null), [cart.lines, pickupAt, note]);

  const restaurant = cart.restaurant;
  const slots = useMemo(() => (restaurant ? pickupSlots(restaurant.prepMinutes) : []), [restaurant]);

  if (!restaurant || cart.count === 0)
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyTitle}>Your bag is empty</Text>
        <Text style={styles.muted}>Pick a restaurant and add something tasty.</Text>
        <Button label="Browse restaurants" onPress={() => router.dismissTo('/')} style={{ marginTop: 20, alignSelf: 'stretch' }} />
      </View>
    );

  const submit = async () => {
    setError('');
    if (!name.trim()) return setError('Enter your name so the restaurant can call it out.');
    if (phone.replace(/\D/g, '').length < 9) return setError('Enter a valid mobile number.');
    setBusy(true);
    try {
      saveProfile({ name: name.trim(), phone: phone.trim() });
      const order =
        unpaid ??
        (await placeOrder({
          restaurantId: restaurant.id,
          items: cart.lines.map(l => ({ id: l.item.id, qty: l.qty })),
          customer: { name: name.trim(), phone: phone.trim() },
          pickupAt,
          note: note.trim(),
          paymentMethod: payment,
        }));
      setUnpaid(order);

      let result = payment === 'justpay' ? await payByJustPay(order.id) : await payByCard(order.id);
      if (result.redirectUrl) {
        await WebBrowser.openBrowserAsync(result.redirectUrl);
        result = await verifyPayment(order.id);
      }
      if (result.order.paymentStatus !== 'paid') throw new Error('Payment wasn’t completed. You can try again.');

      saveOrder(result.order);
      cart.clear();
      router.dismissTo('/');
      router.push({ pathname: '/order/[id]', params: { id: result.order.id } });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.restaurant}>{restaurant.name}</Text>
        <Text style={styles.muted}>Pickup from {restaurant.area}</Text>

        <View style={styles.card}>
          {cart.lines.map(({ item, qty }) => (
            <View key={item.id} style={styles.line}>
              <View style={{ flex: 1 }}>
                <Text style={styles.lineName}>{item.name}</Text>
                <Text style={styles.muted}>{money(item.price * qty)}</Text>
              </View>
              <Stepper
                label={item.name}
                qty={qty}
                onAdd={() => cart.add(restaurant, item)}
                onRemove={() => cart.remove(item.id)}
              />
            </View>
          ))}
          <Pressable onPress={() => router.back()} accessibilityRole="button">
            <Text style={styles.addMore}>+ Add more items</Text>
          </Pressable>
        </View>

        <Text style={styles.label}>Pickup time</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          <Choice selected={pickupAt === 'asap'} onPress={() => setPickupAt('asap')} title="ASAP" sub={`~${restaurant.prepMinutes} min`} />
          {slots.map(s => (
            <Choice key={s} selected={pickupAt === s} onPress={() => setPickupAt(s)} title={clock(s)} sub="Today" />
          ))}
        </ScrollView>

        <Text style={styles.label}>Your details</Text>
        <View style={styles.card}>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Name for the order"
            placeholderTextColor="#9b9a93"
            autoComplete="name"
            textContentType="name"
            style={styles.input}
          />
          <View style={styles.divider} />
          <TextInput
            value={phone}
            onChangeText={setPhone}
            placeholder="Mobile number (07X XXX XXXX)"
            placeholderTextColor="#9b9a93"
            keyboardType="phone-pad"
            autoComplete="tel"
            textContentType="telephoneNumber"
            style={styles.input}
          />
          <View style={styles.divider} />
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder="Note for the kitchen (optional)"
            placeholderTextColor="#9b9a93"
            maxLength={240}
            style={styles.input}
          />
        </View>

        <Text style={styles.label}>Payment</Text>
        <View style={{ gap: 8 }}>
          <Choice wide selected={payment === 'card'} onPress={() => setPayment('card')} title="Card" sub="Visa · Mastercard" />
          <Choice wide selected={payment === 'justpay'} onPress={() => setPayment('justpay')} title="JustPay" sub="Pay from your bank account" />
        </View>

        <View style={[styles.card, { marginTop: 22 }]}>
          <Row label="Subtotal" value={money(cart.total)} />
          <Row label="Service charge" value="None for pickup" />
          <View style={styles.divider} />
          <Row label="Total" value={money(cart.total)} strong />
        </View>
        <Text style={styles.demo}>This is a demo. Payments are simulated and no money is charged.</Text>
        {!!error && <Notice message={error} />}
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: insets.bottom + 14 }]}>
        <Button label={`Pay ${money(cart.total)}`} onPress={submit} loading={busy} />
      </View>
    </KeyboardAvoidingView>
  );
}

function Choice({ selected, onPress, title, sub, wide }: { selected: boolean; onPress: () => void; title: string; sub: string; wide?: boolean }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={[styles.choice, wide && styles.choiceWide, selected && styles.choiceSelected]}
    >
      {wide && <View style={[styles.radio, selected && styles.radioOn]} />}
      <View>
        <Text style={styles.choiceTitle}>{title}</Text>
        <Text style={styles.choiceSub}>{sub}</Text>
      </View>
    </Pressable>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={[styles.rowText, strong && styles.rowStrong]}>{label}</Text>
      <Text style={[styles.rowText, strong && styles.rowStrong]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 18, paddingBottom: 40 },
  restaurant: { fontSize: 26, fontWeight: '900', letterSpacing: -0.8, color: colors.ink },
  muted: { fontSize: 14, color: colors.muted, marginTop: 2 },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 16,
    marginTop: 14,
  },
  line: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingBottom: 14 },
  lineName: { fontSize: 15, fontWeight: '800', color: colors.ink },
  addMore: { color: colors.green, fontWeight: '800', paddingTop: 2 },
  label: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: colors.muted,
    marginTop: 26,
    marginBottom: 10,
  },
  choice: {
    backgroundColor: colors.card,
    borderWidth: 1.5,
    borderColor: colors.line,
    borderRadius: radius.md,
    paddingHorizontal: 16,
    paddingVertical: 12,
    minWidth: 92,
  },
  choiceWide: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  choiceSelected: { borderColor: colors.ink, backgroundColor: '#fffdf8' },
  choiceTitle: { fontSize: 15, fontWeight: '800', color: colors.ink },
  choiceSub: { fontSize: 12, color: colors.muted, marginTop: 2 },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: '#c9c5b9' },
  radioOn: { borderColor: colors.ink, borderWidth: 6 },
  input: { fontSize: 16, color: colors.ink, paddingVertical: 10 },
  divider: { height: 1, backgroundColor: colors.line, marginVertical: 6 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  rowText: { fontSize: 14, color: colors.muted },
  rowStrong: { fontSize: 17, fontWeight: '900', color: colors.ink },
  demo: { fontSize: 12, color: colors.muted, textAlign: 'center', marginVertical: 14 },
  footer: { paddingHorizontal: 18, paddingTop: 12, backgroundColor: colors.paper, borderTopWidth: 1, borderTopColor: colors.line },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28 },
  emptyTitle: { fontSize: 22, fontWeight: '900', color: colors.ink, marginBottom: 4 },
});
