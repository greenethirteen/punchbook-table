// Client for the pickup endpoints in ../server.js.
// Debug builds talk to the local server through the Android emulator's host alias;
// set EXPO_PUBLIC_API_URL to point at another server (e.g. a phone on your Wi-Fi or production).
export const API_URL = (
  process.env.EXPO_PUBLIC_API_URL || (__DEV__ ? 'http://10.0.2.2:3000' : 'https://punchbook.online')
).replace(/\/$/, '');

export type MenuItem = { id: string; category: string; name: string; desc: string; price: number; image?: string };

export type Restaurant = {
  id: string;
  name: string;
  area: string;
  cuisine: string;
  prepMinutes: number;
  accent: string;
  cover: string;
  itemCount: number;
  menu?: MenuItem[];
};

export type PickupStatus = 'new' | 'preparing' | 'ready' | 'collected';
export type PaymentMethod = 'card' | 'justpay';

export type PickupOrder = {
  id: string;
  restaurantId: string;
  restaurantName: string;
  restaurantArea: string;
  items: { id: string; name: string; price: number; qty: number }[];
  total: number;
  customer: { name: string; phone: string };
  note: string;
  pickupAt: string;
  asap: boolean;
  paymentMethod: PaymentMethod;
  paymentStatus: 'pending' | 'paid';
  orderStatus: PickupStatus;
  createdAt: string;
};

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

/** Server images may be paths on the Punchbook server or full URLs. */
export const imageUrl = (src?: string) => (src && src.startsWith('/') ? API_URL + src : src);

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(API_URL + path, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...init?.headers },
    });
  } catch {
    throw new ApiError('Can’t reach Punchbook. Check your connection and try again.', 0);
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(data.error || 'Something went wrong. Please try again.', response.status);
  return data as T;
}

export const getRestaurants = () =>
  request<{ restaurants: Restaurant[] }>('/api/pickup/restaurants').then(d => d.restaurants);

export const getRestaurant = (id: string) =>
  request<{ restaurant: Restaurant & { menu: MenuItem[] } }>(`/api/pickup/restaurants/${encodeURIComponent(id)}`).then(
    d => d.restaurant,
  );

export const placeOrder = (body: {
  restaurantId: string;
  items: { id: string; qty: number }[];
  customer: { name: string; phone: string };
  pickupAt: 'asap' | string;
  note: string;
  paymentMethod: PaymentMethod;
}) => request<PickupOrder>('/api/pickup/orders', { method: 'POST', body: JSON.stringify(body) });

export const getOrder = (id: string) => request<PickupOrder>(`/api/pickup/orders/${encodeURIComponent(id)}`);

type PaymentResult = { ok: boolean; simulated?: boolean; redirectUrl?: string; order: PickupOrder };

export const payByCard = (orderId: string) =>
  request<PaymentResult>('/api/payments/card', { method: 'POST', body: JSON.stringify({ orderId }) });

export const payByJustPay = (orderId: string) =>
  request<PaymentResult>('/api/payments/justpay/simulate', { method: 'POST', body: JSON.stringify({ orderId }) });

export const verifyPayment = (orderId: string) =>
  request<PaymentResult>('/api/payments/verify', { method: 'POST', body: JSON.stringify({ orderId }) });
