import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { colors } from '@/lib/theme';
import { CartProvider } from '@/state/cart';
import { OrdersProvider } from '@/state/orders';

export default function RootLayout() {
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
          </Stack>
        </CartProvider>
      </OrdersProvider>
    </SafeAreaProvider>
  );
}
