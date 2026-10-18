import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { getOrder, type PickupOrder } from '@/lib/api';

// The phone keeps its own copy of each order and the customer's contact details between launches,
// so order history shows even when offline.
const ORDERS_KEY = 'punchbook.pickup.orders';
const PROFILE_KEY = 'punchbook.pickup.profile';
const MAX_ORDERS = 30;
const POLL_MS = 5000;

/** A spot picked on the map. `line` comes from reverse geocoding; `details` is what the customer types. */
export type Address = { line: string; area: string; details: string; lat: number; lng: number; accuracy: number | null };
export type Profile = { name: string; phone: string; address?: Address };

type Store = {
  ready: boolean;
  orders: PickupOrder[];
  /** IDs the server no longer knows. */
  stale: Set<string>;
  activeOrders: PickupOrder[];
  profile: Profile;
  saveOrder: (order: PickupOrder) => void;
  /** Merges the given fields into the saved profile. */
  saveProfile: (patch: Partial<Profile>) => void;
};

const StoreContext = createContext<Store | null>(null);

export const isActive = (o: PickupOrder) => o.paymentStatus === 'paid' && o.orderStatus !== 'collected' && o.orderStatus !== 'cancelled';

export function OrdersProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [orders, setOrders] = useState<PickupOrder[]>([]);
  const [profile, setProfile] = useState<Profile>({ name: '', phone: '' });

  useEffect(() => {
    AsyncStorage.multiGet([ORDERS_KEY, PROFILE_KEY])
      .then(([[, o], [, p]]) => {
        if (o) setOrders(JSON.parse(o));
        if (p) setProfile(JSON.parse(p));
      })
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);

  const saveOrder = useCallback((order: PickupOrder) => {
    setOrders(prev => {
      const existing = prev.find(o => o.id === order.id);
      if (existing && JSON.stringify(existing) === JSON.stringify(order)) return prev;
      const next = [order, ...prev.filter(o => o.id !== order.id)]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, MAX_ORDERS);
      AsyncStorage.setItem(ORDERS_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const saveProfile = useCallback((patch: Partial<Profile>) => {
    setProfile(prev => {
      const next = { ...prev, ...patch };
      AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  // Keep unfinished orders fresh so the home banner and order screen show the kitchen's progress.
  const [stale, setStale] = useState<Set<string>>(new Set());
  const activeIds = orders.filter(o => isActive(o) && !stale.has(o.id)).map(o => o.id).join(',');
  useEffect(() => {
    if (!activeIds) return;
    const refresh = () =>
      activeIds.split(',').forEach(id =>
        getOrder(id)
          .then(saveOrder)
          .catch(e => {
            if (e.status === 404) setStale(prev => new Set(prev).add(id));
          }),
      );
    refresh();
    const timer = setInterval(refresh, POLL_MS);
    return () => clearInterval(timer);
  }, [activeIds, saveOrder]);

  const value = useMemo(
    () => ({ ready, orders, stale, activeOrders: orders.filter(o => isActive(o) && !stale.has(o.id)), profile, saveOrder, saveProfile }),
    [ready, orders, stale, profile, saveOrder, saveProfile],
  );
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useOrders() {
  const store = useContext(StoreContext);
  if (!store) throw new Error('useOrders must be used inside OrdersProvider');
  return store;
}
