import * as Notifications from 'expo-notifications';
import { router, Stack } from 'expo-router';
import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { orderIdOf } from '@/lib/push';
import { colors } from '@/lib/theme';
import { CartProvider } from '@/state/cart';
import { OrdersProvider } from '@/state/orders';

export default function RootLayout() {
  // Tapping an order notification opens that order, whether the app was running or not.
  useEffect(() => {
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
        </CartProvider>
      </OrdersProvider>
    </SafeAreaProvider>
  );
}
