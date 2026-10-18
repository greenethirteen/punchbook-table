// Staff access for the restaurant screens (/admin, /pickup-admin, /pos, /accounts, /owner-admin).
// PUNCHBOOK_ADMIN_KEY sees everything. RESTAURANT_KEYS=peppermint:<secret>,amra:<secret> gives each
// restaurant a login that only sees and changes its own orders. Until PUNCHBOOK_ADMIN_KEY is set the
// screens stay open (for testing) and say so in a banner.
// Pages send the key in the x-staff-key header (x-admin-key is accepted too).
import crypto from 'crypto';

const same = (a, b) => {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

export function createStaff({restaurants}) {
  const adminKey = () => process.env.PUNCHBOOK_ADMIN_KEY || '';
  const restaurantKeys = () => (process.env.RESTAURANT_KEYS || '').split(',').map(pair => {
    const i = pair.indexOf(':');
    return i > 0 ? [pair.slice(0, i).trim(), pair.slice(i + 1).trim()] : [];
  }).filter(([id, key]) => id && key);

  /** {role:'admin'} or {role:'restaurant', restaurantId}, or null for a wrong or missing key. */
  function identify(req) {
    if (!adminKey()) return {role: 'admin', open: true};
    const supplied = req.get('x-staff-key') || req.get('x-admin-key') || '';
    if (!supplied) return null;
    if (same(supplied, adminKey())) return {role: 'admin'};
    const match = restaurantKeys().find(([, key]) => same(supplied, key));
    return match ? {role: 'restaurant', restaurantId: match[0]} : null;
  }

  const requireStaff = (req, res, next) => {
    const who = identify(req);
    if (!who) return res.status(401).json({error: 'Sign in with your staff key.'});
    req.staff = who;
    next();
  };
  const requireAdmin = (req, res, next) => requireStaff(req, res, () =>
    req.staff.role === 'admin' ? next() : res.status(403).json({error: 'Only the Punchbook admin can do this.'}));

  /** Whether this staff member may see or change an order. */
  const canSee = (staff, order) => staff.role === 'admin' || staff.restaurantId === order.restaurantId;

  function mount(app) {
    app.get('/api/staff/me', requireStaff, (req, res) => {
      const r = restaurants.find(x => x.id === req.staff.restaurantId);
      res.json({...req.staff, restaurantName: r?.name || null, restaurantArea: r?.area || null,
        persistent: Boolean(process.env.DATA_DIR)});
    });
  }

  return {identify, requireStaff, requireAdmin, canSee, mount, isOpen: () => !adminKey()};
}
