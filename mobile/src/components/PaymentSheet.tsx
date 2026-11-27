import { useState } from 'react';
import { ActivityIndicator, Linking, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { CloseIcon } from '@/components/icons';
import { colors } from '@/lib/theme';

/**
 * Shows the gateway's hosted card page inside the app, in a sheet over checkout.
 * Card details are typed into the gateway's own page and never reach Punchbook.
 * Closes itself when the page sends the customer to `returnUrl` (paid or cancelled);
 * the caller then asks the server whether the order was paid.
 */
export function PaymentSheet({ url, returnUrl, summary, amount, onClose }: {
  url: string | null;
  returnUrl: string;
  summary: string;
  amount: string;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [host, setHost] = useState('');
  const [loading, setLoading] = useState(true);

  const hostOf = (u: string) => { try { return new URL(u).host; } catch { return ''; } };

  // Return true to let the page load. Our return link closes the sheet; any other
  // non-web link (a bank's app, tel:, intent:) is handed to the phone.
  const allow = (next: string) => {
    if (next.startsWith(returnUrl)) { onClose(); return false; }
    if (/^(https?:|about:|data:|blob:)/i.test(next)) return true;
    Linking.openURL(next).catch(() => {});
    return false;
  };

  return (
    <Modal
      visible={!!url}
      animationType="slide"
      presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : 'fullScreen'}
      onRequestClose={onClose}
      onShow={() => setLoading(true)}
    >
      <View style={[styles.sheet, Platform.OS === 'android' && { paddingTop: insets.top }]}>
        {Platform.OS === 'ios' && <View style={styles.grab} />}
        <View style={styles.header}>
          <Pressable accessibilityRole="button" accessibilityLabel="Cancel payment" onPress={onClose} hitSlop={10} style={styles.close}>
            <CloseIcon size={16} color={colors.ink} />
          </Pressable>
          <View style={styles.titleWrap}>
            <Text style={styles.title}>Secure payment</Text>
            <Text style={styles.host} numberOfLines={1}>🔒 {host || hostOf(url ?? '')}</Text>
          </View>
          <View style={{ width: 32 }} />
        </View>
        <View style={styles.summary}>
          <Text style={styles.summaryText} numberOfLines={1}>{summary}</Text>
          <Text style={styles.amount}>{amount}</Text>
        </View>
        {url && (
          <WebView
            source={{ uri: url }}
            originWhitelist={['*']}
            onShouldStartLoadWithRequest={r => allow(r.url)}
            onNavigationStateChange={s => {
              if (s.url.startsWith(returnUrl)) onClose();
              else if (s.url) setHost(hostOf(s.url));
            }}
            onLoadEnd={() => setLoading(false)}
            sharedCookiesEnabled
            setSupportMultipleWindows={false}
            style={{ flex: 1 }}
          />
        )}
        {loading && (
          <View style={styles.loading} pointerEvents="none">
            <ActivityIndicator color={colors.green} />
          </View>
        )}
        <View style={{ height: insets.bottom, backgroundColor: '#fff' }} />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1, backgroundColor: '#fff' },
  grab: { width: 40, height: 5, borderRadius: 3, backgroundColor: '#d6d3ca', alignSelf: 'center', marginTop: 8 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.line },
  close: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.paper, alignItems: 'center', justifyContent: 'center' },
  titleWrap: { flex: 1, alignItems: 'center' },
  title: { fontSize: 15, fontWeight: '800', color: colors.ink },
  host: { fontSize: 12, fontWeight: '600', color: colors.green, marginTop: 1 },
  summary: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, backgroundColor: colors.paper, paddingHorizontal: 16, paddingVertical: 10 },
  summaryText: { flex: 1, fontSize: 13, fontWeight: '700', color: colors.ink },
  amount: { fontSize: 13, fontWeight: '900', color: colors.ink },
  loading: { position: 'absolute', left: 0, right: 0, top: 140, alignItems: 'center' },
});
