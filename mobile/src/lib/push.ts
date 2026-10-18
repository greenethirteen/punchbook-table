// Order updates as phone notifications ("Your order is ready", "On the way").
// After a paid order the app asks for permission once, then registers this phone's Firebase token
// for that order with the server (push.js), which sends a notification on each status change.
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { registerOrderPush } from '@/lib/api';

// Show notifications that arrive while the app is open too.
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

/** Never throws: notifications are a bonus, the order screen still updates on its own. */
export async function enableOrderNotifications(orderId: string) {
  if (Platform.OS === 'web') return;
  try {
    // Must match the channel_id the server sends with.
    await Notifications.setNotificationChannelAsync('orders', {
      name: 'Order updates',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 150, 250],
    });
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') ({ status } = await Notifications.requestPermissionsAsync());
    if (status !== 'granted') return;
    const { data } = await Notifications.getDevicePushTokenAsync();
    await registerOrderPush(orderId, String(data));
  } catch {
    // No Google Play services, no network, or permission refused.
  }
}

/** The order a tapped notification belongs to, if any. */
export const orderIdOf = (response: Notifications.NotificationResponse | null) => {
  const id = response?.notification.request.content.data?.orderId;
  return typeof id === 'string' ? id : null;
};
