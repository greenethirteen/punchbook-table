import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FloatingNav, NAV_SPACE } from '@/components/FloatingNav';
import { BagIcon, CheckIcon, ChevronIcon, PinIcon, UserIcon } from '@/components/icons';
import { API_URL, deleteMe, updateMe } from '@/lib/api';
import { colors, serif } from '@/lib/theme';
import { useOrders } from '@/state/orders';

export default function Account() {
  const insets = useSafeAreaInsets();
  const { profile, orders, activeOrders, saveProfile, signOut } = useOrders();
  const signedIn = !!profile.token;
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(profile.name);
  const [busy, setBusy] = useState(false);
  const paid = orders.filter(o => o.paymentStatus === 'paid').length;
  const initials = profile.name.trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase() || '?';

  const saveName = async () => {
    const n = name.trim();
    if (!n) return;
    setBusy(true);
    try {
      if (profile.token) await updateMe(profile.token, n);
      saveProfile({ name: n });
      setEditing(false);
    } catch (e) {
      Alert.alert('Couldn’t save', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = () =>
    Alert.alert('Delete your account?', 'This removes your name and number from Punchbook. Past receipts stay with the restaurant for their records.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            if (profile.token) await deleteMe(profile.token);
            signOut();
          } catch (e) {
            Alert.alert('Couldn’t delete', (e as Error).message);
          }
        },
      },
    ]);

  const open = (path: string) => WebBrowser.openBrowserAsync(API_URL + path);

  return (
    <View style={{ flex: 1, backgroundColor: colors.paper }}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 12, paddingHorizontal: 18, paddingBottom: insets.bottom + NAV_SPACE }}>
        <Text style={styles.h1}>
          Your <Text style={styles.serif}>account.</Text>
        </Text>

        {signedIn ? (
          <View style={styles.profile}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials}</Text>
            </View>
            <View style={{ flex: 1 }}>
              {editing ? (
                <View style={styles.editRow}>
                  <TextInput value={name} onChangeText={setName} autoFocus style={styles.nameInput} returnKeyType="done" onSubmitEditing={saveName} />
                  <Pressable accessibilityRole="button" onPress={saveName} style={styles.saveBtn}>
                    {busy ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveText}>Save</Text>}
                  </Pressable>
                </View>
              ) : (
                <Pressable accessibilityRole="button" accessibilityHint="Edit your name" onPress={() => { setName(profile.name); setEditing(true); }}>
                  <Text style={styles.name}>{profile.name}</Text>
                </Pressable>
              )}
              <View style={styles.phoneRow}>
                <Text style={styles.phone}>{profile.phone}</Text>
                {profile.verified && (
                  <View style={styles.verified}>
                    <CheckIcon size={11} color="#fff" />
                    <Text style={styles.verifiedText}>Verified</Text>
                  </View>
                )}
              </View>
            </View>
          </View>
        ) : (
          <View style={styles.signInCard}>
            <Text style={styles.signInTitle}>Sign in with your mobile</Text>
            <Text style={styles.signInSub}>Your name and number, saved for every order. No password.</Text>
            <Pressable accessibilityRole="button" onPress={() => router.push('/signin')} style={styles.signInBtn}>
              <Text style={styles.signInBtnText}>Sign in</Text>
            </Pressable>
          </View>
        )}

        <View style={styles.stats}>
          <View style={styles.stat}>
            <Text style={styles.statNum}>{paid}</Text>
            <Text style={styles.statLabel}>{paid === 1 ? 'order' : 'orders'}</Text>
          </View>
          <View style={styles.stat}>
            <Text style={[styles.statNum, { color: colors.green }]}>LKR 0</Text>
            <Text style={styles.statLabel}>app markup, ever</Text>
          </View>
        </View>

        <Text style={styles.label}>Your stuff</Text>
        <View style={styles.group}>
          <Row icon={<BagIcon size={20} color={colors.ink} />} title="Your orders" sub={activeOrders.length ? `${activeOrders.length} live now` : undefined} onPress={() => router.navigate('/orders')} />
          <Row icon={<PinIcon size={20} color={colors.ink} />} title="Saved address" sub={profile.address?.line ?? 'For delivery, when it launches'} onPress={() => router.push('/address')} last />
        </View>

        <Text style={styles.label}>Help</Text>
        <View style={styles.group}>
          <Row title="Help & support" onPress={() => open('/support/')} />
          <Row title="Privacy policy" onPress={() => open('/privacy-policy/')} />
          <Row title="Terms" onPress={() => open('/terms/')} last />
        </View>

        {signedIn && (
          <View style={[styles.group, { marginTop: 22 }]}>
            <Row icon={<UserIcon size={20} color={colors.ink} />} title="Sign out" onPress={signOut} />
            <Row title="Delete account" danger onPress={confirmDelete} last />
          </View>
        )}
        <Text style={styles.footer}>Punchbook · The pick up order app</Text>
      </ScrollView>
      <FloatingNav active="account" badge={activeOrders.length} />
    </View>
  );
}

function Row({ icon, title, sub, onPress, last, danger }: { icon?: React.ReactNode; title: string; sub?: string; onPress: () => void; last?: boolean; danger?: boolean }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.row, !last && styles.rowLine, pressed && { opacity: 0.7 }]}>
      {icon}
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowTitle, danger && { color: colors.error }]}>{title}</Text>
        {!!sub && <Text style={styles.rowSub} numberOfLines={1}>{sub}</Text>}
      </View>
      {!danger && <ChevronIcon size={18} color={colors.muted} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  h1: { fontSize: 38, fontWeight: '800', letterSpacing: -1.8, color: colors.ink, marginTop: 10 },
  serif: { fontFamily: serif, fontWeight: '400', fontSize: 44, color: colors.green },
  profile: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 20, padding: 16, borderRadius: 24, backgroundColor: colors.night },
  avatar: { width: 60, height: 60, borderRadius: 30, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 22, fontWeight: '900', color: colors.night },
  name: { fontSize: 22, fontWeight: '800', letterSpacing: -0.5, color: '#fff' },
  editRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  nameInput: { flex: 1, fontSize: 18, color: '#fff', borderBottomWidth: 1.5, borderBottomColor: colors.gold, paddingVertical: 4 },
  saveBtn: { backgroundColor: colors.green, borderRadius: 12, paddingHorizontal: 12, height: 34, justifyContent: 'center' },
  saveText: { color: '#fff', fontWeight: '800' },
  phoneRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  phone: { fontSize: 15, color: 'rgba(255,255,255,0.75)' },
  verified: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.green, borderRadius: 99, paddingHorizontal: 8, paddingVertical: 3 },
  verifiedText: { fontSize: 11, fontWeight: '800', color: '#fff' },
  signInCard: { marginTop: 20, padding: 20, borderRadius: 24, backgroundColor: colors.night },
  signInTitle: { fontSize: 22, fontWeight: '800', color: '#fff', letterSpacing: -0.4 },
  signInSub: { fontSize: 14, color: 'rgba(255,255,255,0.75)', marginTop: 6, lineHeight: 20 },
  signInBtn: { marginTop: 16, backgroundColor: colors.gold, borderRadius: 16, height: 50, alignItems: 'center', justifyContent: 'center' },
  signInBtnText: { fontSize: 16, fontWeight: '800', color: colors.night },
  stats: { flexDirection: 'row', gap: 10, marginTop: 12 },
  stat: { flex: 1, padding: 16, borderRadius: 20, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line },
  statNum: { fontSize: 24, fontWeight: '900', color: colors.ink, letterSpacing: -0.6 },
  statLabel: { fontSize: 13, color: colors.muted, marginTop: 2 },
  label: { fontSize: 12, fontWeight: '800', letterSpacing: 1.2, textTransform: 'uppercase', color: colors.muted, marginTop: 24, marginBottom: 10 },
  group: { backgroundColor: colors.card, borderRadius: 20, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 58 },
  rowLine: { borderBottomWidth: 1, borderBottomColor: colors.line },
  rowTitle: { fontSize: 16, fontWeight: '700', color: colors.ink },
  rowSub: { fontSize: 13, color: colors.muted, marginTop: 2 },
  footer: { textAlign: 'center', fontSize: 12, color: colors.muted, marginTop: 26 },
});
