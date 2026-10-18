// Punchbook Rider: the /rider page (public/rider.html) in an app, plus native alerts for new jobs.
// Web push doesn't work inside an app's web view, so the app registers its own Firebase token
// with the server (/api/push/rider-app, see push.js) using the access code the rider typed on the page.
import * as Notifications from 'expo-notifications';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

const SITE = (process.env.EXPO_PUBLIC_SITE_URL || 'https://punchbook.online').replace(/\/$/, '');
const START = `${SITE}/rider`;
const INK = '#244633';

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

// Runs in the page: reports whether a rider is signed in and their access code (rider-app.js keeps
// both in localStorage as pb-rider-me / pb-rider-key).
const BRIDGE = `(function(){
  function send(){try{
    var key=JSON.parse(localStorage.getItem('pb-rider-key')||'""')||'';
    window.ReactNativeWebView.postMessage(JSON.stringify({type:'rider',key:key,signedIn:!!localStorage.getItem('pb-rider-me')}));
  }catch(e){}}
  send();setInterval(send,5000);
})();true;`;

async function registerForJobs(key: string) {
  await Notifications.setNotificationChannelAsync('jobs', {
    name: 'New delivery jobs',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 400, 200, 400, 200, 400],
  });
  let { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') ({ status } = await Notifications.requestPermissionsAsync());
  if (status !== 'granted') return false;
  const { data } = await Notifications.getDevicePushTokenAsync();
  const res = await fetch(`${SITE}/api/push/rider-app`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-rider-key': key },
    body: JSON.stringify({ token: String(data) }),
  });
  return res.ok;
}

export default function App() {
  const web = useRef<WebView>(null);
  const canGoBack = useRef(false);
  const registeredKey = useRef<string | null>(null);
  const [failed, setFailed] = useState(false);

  // Android back button goes back in the page before leaving the app.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!canGoBack.current) return false;
      web.current?.goBack();
      return true;
    });
    return () => sub.remove();
  }, []);

  // Tapping a job alert brings the jobs list up to date.
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener(() => web.current?.reload());
    return () => sub.remove();
  }, []);

  const onMessage = useCallback((e: WebViewMessageEvent) => {
    try {
      const msg = JSON.parse(e.nativeEvent.data);
      if (msg.type !== 'rider' || !msg.signedIn || registeredKey.current === msg.key) return;
      registeredKey.current = msg.key;
      registerForJobs(msg.key).then(ok => { if (!ok) registeredKey.current = null; }).catch(() => { registeredKey.current = null; });
    } catch {}
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
        {failed ? (
          <View style={styles.center}>
            <Text style={styles.title}>Can’t reach Punchbook</Text>
            <Text style={styles.body}>Check your internet connection and try again.</Text>
            <Pressable accessibilityRole="button" style={styles.button} onPress={() => { setFailed(false); web.current?.reload(); }}>
              <Text style={styles.buttonText}>Try again</Text>
            </Pressable>
          </View>
        ) : (
          <WebView
            ref={web}
            source={{ uri: START }}
            style={styles.web}
            injectedJavaScript={BRIDGE}
            onMessage={onMessage}
            onNavigationStateChange={s => { canGoBack.current = s.canGoBack; }}
            onError={() => setFailed(true)}
            // Calls, maps and anything off our site open in the phone's own apps.
            setSupportMultipleWindows={false}
            onShouldStartLoadWithRequest={req => {
              if (req.url.startsWith(SITE)) return true;
              Linking.openURL(req.url).catch(() => {});
              return false;
            }}
            startInLoadingState
            renderLoading={() => (
              <View style={styles.center}>
                <ActivityIndicator color={INK} size="large" />
              </View>
            )}
            pullToRefreshEnabled
            domStorageEnabled
          />
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: INK },
  web: { flex: 1, backgroundColor: '#f7f8f1' },
  center: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', padding: 28, backgroundColor: '#f7f8f1' },
  title: { fontSize: 22, fontWeight: '900', color: INK, marginBottom: 6 },
  body: { fontSize: 15, color: '#697468', textAlign: 'center' },
  button: { marginTop: 20, backgroundColor: INK, borderRadius: 12, paddingHorizontal: 24, minHeight: 50, justifyContent: 'center' },
  buttonText: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
