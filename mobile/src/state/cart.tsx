import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import type { MenuItem, Restaurant } from '@/lib/api';

type CartRestaurant = Pick<Restaurant, 'id' | 'name' | 'area' | 'prepMinutes'>;
type Line = { item: MenuItem; qty: number };

type Cart = {
  restaurant: CartRestaurant | null;
  lines: Line[];
  count: number;
  total: number;
  qtyOf: (itemId: string) => number;
  /** Adds one of the item. Returns false (and changes nothing) if the bag holds another restaurant's items. */
  add: (restaurant: CartRestaurant, item: MenuItem) => boolean;
  /** Empties the bag and starts a new one with this item. */
  startNew: (restaurant: CartRestaurant, item: MenuItem) => void;
  remove: (itemId: string) => void;
  clear: () => void;
};

const CartContext = createContext<Cart | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [restaurant, setRestaurant] = useState<CartRestaurant | null>(null);
  const [lines, setLines] = useState<Line[]>([]);

  const value = useMemo<Cart>(() => {
    const count = lines.reduce((n, l) => n + l.qty, 0);
    return {
      restaurant,
      lines,
      count,
      total: lines.reduce((n, l) => n + l.item.price * l.qty, 0),
      qtyOf: id => lines.find(l => l.item.id === id)?.qty ?? 0,
      add(r, item) {
        if (restaurant && restaurant.id !== r.id && count > 0) return false;
        setRestaurant(r);
        setLines(prev =>
          prev.some(l => l.item.id === item.id)
            ? prev.map(l => (l.item.id === item.id ? { ...l, qty: l.qty + 1 } : l))
            : [...prev, { item, qty: 1 }],
        );
        return true;
      },
      startNew(r, item) {
        setRestaurant(r);
        setLines([{ item, qty: 1 }]);
      },
      remove(id) {
        setLines(prev => prev.map(l => (l.item.id === id ? { ...l, qty: l.qty - 1 } : l)).filter(l => l.qty > 0));
      },
      clear() {
        setLines([]);
        setRestaurant(null);
      },
    };
  }, [restaurant, lines]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const cart = useContext(CartContext);
  if (!cart) throw new Error('useCart must be used inside CartProvider');
  return cart;
}
