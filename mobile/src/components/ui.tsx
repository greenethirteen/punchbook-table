import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import type { PickupStatus } from '@/lib/api';
import { colors, radius } from '@/lib/theme';

export function Button({
  label,
  onPress,
  disabled,
  loading,
  variant = 'primary',
  trailing,
  style,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: 'primary' | 'secondary';
  trailing?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const primary = variant === 'primary';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        primary ? styles.primary : styles.secondary,
        (disabled || loading) && { opacity: 0.55 },
        pressed && { opacity: 0.85 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={primary ? '#fff' : colors.ink} />
      ) : (
        <>
          <Text style={[styles.buttonLabel, { color: primary ? '#fff' : colors.ink }]}>{label}</Text>
          {trailing}
        </>
      )}
    </Pressable>
  );
}

export function Stepper({ qty, onAdd, onRemove, label }: { qty: number; onAdd: () => void; onRemove: () => void; label: string }) {
  if (qty === 0)
    return (
      <Pressable accessibilityRole="button" accessibilityLabel={`Add ${label}`} onPress={onAdd} hitSlop={8} style={styles.addButton}>
        <Text style={styles.addText}>+</Text>
      </Pressable>
    );
  return (
    <View style={styles.stepper}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Remove one ${label}`} onPress={onRemove} hitSlop={8} style={styles.stepButton}>
        <Text style={styles.stepText}>−</Text>
      </Pressable>
      <Text style={styles.stepQty} accessibilityLabel={`${qty} in bag`}>
        {qty}
      </Text>
      <Pressable accessibilityRole="button" accessibilityLabel={`Add another ${label}`} onPress={onAdd} hitSlop={8} style={styles.stepButton}>
        <Text style={styles.stepText}>+</Text>
      </Pressable>
    </View>
  );
}

export function Notice({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={styles.notice}>
      <Text style={styles.noticeText}>{message}</Text>
      {onRetry && <Button label="Try again" variant="secondary" onPress={onRetry} style={{ marginTop: 12 }} />}
    </View>
  );
}

export const statusCopy: Record<PickupStatus, { label: string; title: string; tone: string; bg: string }> = {
  new: { label: 'Received', title: 'Order received', tone: '#725529', bg: colors.amberSoft },
  preparing: { label: 'Preparing', title: 'Being prepared', tone: '#3f5a2e', bg: colors.greenSoft },
  ready: { label: 'Ready', title: 'Ready for pickup', tone: '#fff', bg: colors.green },
  collected: { label: 'Collected', title: 'Collected', tone: colors.muted, bg: '#eceae3' },
};

export function StatusPill({ status, pending }: { status: PickupStatus; pending?: boolean }) {
  const s = pending ? { label: 'Unpaid', tone: colors.error, bg: colors.errorSoft } : statusCopy[status];
  return (
    <View style={[styles.pill, { backgroundColor: s.bg }]}>
      <Text style={[styles.pillText, { color: s.tone }]}>{s.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 54,
    borderRadius: radius.md,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  primary: { backgroundColor: colors.ink },
  secondary: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line },
  buttonLabel: { fontSize: 16, fontWeight: '800' },
  addButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addText: { color: '#fff', fontSize: 22, fontWeight: '700', marginTop: -2 },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.ink,
    borderRadius: radius.pill,
    height: 36,
    paddingHorizontal: 4,
  },
  stepButton: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  stepText: { color: '#fff', fontSize: 20, fontWeight: '700', marginTop: -2 },
  stepQty: { color: '#fff', fontWeight: '800', minWidth: 18, textAlign: 'center' },
  notice: { backgroundColor: colors.errorSoft, borderRadius: radius.md, padding: 16 },
  noticeText: { color: colors.error, fontSize: 14, lineHeight: 20 },
  pill: { borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 5, alignSelf: 'flex-start' },
  pillText: { fontSize: 12, fontWeight: '800' },
});
