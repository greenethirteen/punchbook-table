import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { router, Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Welcome } from '@/components/Welcome';
import { orderIdOf } from '@/lib/push';
import { colors } from '@/lib/theme';
import { CartProvider } from '@/state/cart';
import { OrdersProvider } from '@/state/orders';

// Set once the customer has finished or skipped the welcome tour.
const WELCOME_KEY = 'punchbook.welcomeSeen';

export default function RootLayout() {
  const [welcomed, setWelcomed] = useState<boolean | null>(null);
  useEffect(() => {
    AsyncStorage.getItem(WELCOME_KEY)
      .then(v => setWelcomed(v === '1'))
      .catch(() => setWelcomed(true));
  }, []);
  const finishWelcome = () => {
    setWelcomed(true);
    AsyncStorage.setItem(WELCOME_KEY, '1').catch(() => {});
  };

  // Tapping an order notification opens that order, whether the app was running or not.
  useEffect(() => {
    if (Platform.OS === 'web') return; // no push on the web build
    const open = (id: string | null) => id && router.push({ pathname: '/order/[id]', params: { id } });
    open(orderIdOf(Notifications.getLastNotificationResponse()));
    const sub = Notifications.addNotificationResponseReceivedListener(r => open(orderIdOf(r)));
    return () => sub.remove();
  }, []);

  return (
    <SafeAreaProvider>
      <OrdersProvider>
        <CartProvider>
          <StatusBar style="dark" />
          <Stack
            screenOptions={{
              headerStyle: { backgroundColor: colors.paper },
              headerShadowVisible: false,
              headerTintColor: colors.ink,
              headerTitleStyle: { fontWeight: '800' },
              contentStyle: { backgroundColor: colors.paper },
            }}
          >
            <Stack.Screen name="index" options={{ headerShown: false }} />
            <Stack.Screen name="restaurant/[id]" options={{ headerShown: false }} />
            <Stack.Screen name="checkout" options={{ title: 'Your bag' }} />
            <Stack.Screen name="order/[id]" options={{ title: 'Your order' }} />
            <Stack.Screen name="orders" options={{ title: 'My orders' }} />
            <Stack.Screen name="address" options={{ title: 'Set your address' }} />
          </Stack>
          {/* Covers the home screen until we know whether to show the tour, so it never flashes. */}
          {welcomed === null && <View style={{ position: 'absolute', inset: 0, backgroundColor: colors.paper }} />}
          {welcomed === false && <Welcome onDone={finishWelcome} />}
        </CartProvider>
      </OrdersProvider>
    </SafeAreaProvider>
  );
}
