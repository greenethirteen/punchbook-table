// Local POS bridge API. A small program on the restaurant's POS computer (see bridge/ for
// SambaPOS) polls these endpoints: it fetches paid orders, creates them in the POS, acknowledges
// each one, and reports kitchen progress ("ready") back so customers and drivers are updated.
// Each restaurant gets its own secret: BRIDGE_KEYS=amra:<secret>,peppermint:<secret>
import crypto from 'crypto';

const RANK = {pickup: ['new', 'preparing', 'ready', 'collected'], table: ['new', 'preparing', 'served']};
const DONE = new Set(['collected', 'served', 'cancelled']);
const ONLINE_MS = 60000;
const kind = o => o.orderType === 'pickup' ? 'pickup' : 'table';
const text = (v, max) => String(v ?? '').trim().slice(0, max);

export function createPosBridge({orders, restaurants, staff}) {
  const seen = {}; // restaurantId -> {at, pos, version}
  const env = n => process.env[n] || '';

  function keys() {
    return Object.fromEntries(env('BRIDGE_KEYS').split(',').map(pair => {
      const i = pair.indexOf(':');
      return i > 0 ? [pair.slice(0, i).trim(), pair.slice(i + 1).trim()] : [];
    }).filter(([id, key]) => id && key));
  }

  function auth(req, res, next) {
    const supplied = Buffer.from((req.get('authorization') || '').replace(/^Bearer\s+/i, ''));
    const match = Object.entries(keys()).find(([, key]) => {
      const expected = Buffer.from(key);
      return expected.length === supplied.length && crypto.timingSafeEqual(expected, supplied);
    });
    if (!match) return res.status(401).json({error: 'Invalid bridge key.'});
    req.restaurantId = match[0];
    seen[match[0]] = {at: new Date().toISOString(), pos: text(req.get('x-bridge-pos'), 40) || 'pos', version: text(req.get('x-bridge-version'), 40)};
    next();
  }

  // Square has its own push integration in pos-square.js; leave those orders alone.
  const handledElsewhere = o => o.pos?.provider === 'square';
  const own = req => orders.find(o => o.id === req.params.id && o.restaurantId === req.restaurantId && !handledElsewhere(o));

  // The shape the bridge sees. Kept explicit so internal fields never leak to the POS.
  function forBridge(o) {
    return {
      id: o.id,
      type: o.orderType === 'pickup' ? (o.fulfilment === 'delivery' ? 'delivery' : 'pickup') : 'table',
      table: o.table || null,
      customer: {name: o.customer?.name || '', phone: o.customer?.phone || '', address: o.customer?.address || null},
      note: o.note || '',
      items: o.items.map(i => ({id: i.id, name: i.name, qty: i.qty, price: i.price})),
      subtotal: o.subtotal, service: o.service || 0, deliveryFee: o.deliveryFee || 0, total: o.total,
      paymentMethod: o.paymentMethod, paymentRef: o.paymentRef || null,
      readyBy: o.pickupAt || null, asap: Boolean(o.asap),
      orderStatus: o.orderStatus, createdAt: o.createdAt
    };
  }

  function setStatus(o, next, source) {
    const rank = RANK[kind(o)];
    if (!rank.includes(next)) return `"${next}" is not a valid status for ${kind(o)} orders.`;
    if (o.orderStatus === 'cancelled') return '';
    // A delivery order the kitchen calls ready is waiting for its rider; the rider page moves it on.
    if (o.fulfilment === 'delivery' && next === 'ready') {
      o.kitchenReadyAt ||= new Date().toISOString();
      next = 'preparing';
    }
    if (rank.indexOf(next) > rank.indexOf(o.orderStatus)) {
      o.orderStatus = next;
      o.statusSource = source;
      o.statusChangedAt = new Date().toISOString();
    }
    return '';
  }

  function mount(app) {
    app.get('/api/bridge/ping', auth, (req, res) => {
      const r = restaurants.find(x => x.id === req.restaurantId);
      res.json({ok: true, restaurant: {id: req.restaurantId, name: r?.name || req.restaurantId}, serverTime: new Date().toISOString()});
    });

    // Paid orders not yet in the POS, oldest first. Orders that failed stay out until retried.
    app.get('/api/bridge/orders', auth, (req, res) => {
      const pending = orders.filter(o => o.restaurantId === req.restaurantId && o.paymentStatus === 'paid'
        && !o.pos?.status && !handledElsewhere(o) && !DONE.has(o.orderStatus));
      res.json({orders: pending.sort((a, b) => a.createdAt.localeCompare(b.createdAt)).slice(0, 50).map(forBridge)});
    });

    // The bridge created the ticket (or failed to). A ticket in the kitchen means "preparing".
    app.post('/api/bridge/orders/:id/ack', auth, (req, res) => {
      const o = own(req);
      if (!o) return res.status(404).json({error: 'Order not found.'});
      const b = req.body || {}, provider = seen[req.restaurantId].pos, now = new Date().toISOString();
      if (b.error) {
        o.pos = {provider, status: 'error', error: text(b.error, 300), updatedAt: now};
      } else {
        o.pos = {provider, status: 'synced', error: '', orderId: text(b.ticketId, 60), ticketNumber: text(b.ticketNumber, 30), updatedAt: now};
        setStatus(o, 'preparing', provider);
      }
      res.json({order: forBridge(o)});
    });

    // Kitchen progress from the POS, e.g. staff pressed "Ready" in SambaPOS. Forward only.
    app.post('/api/bridge/orders/:id/status', auth, (req, res) => {
      const o = own(req);
      if (!o) return res.status(404).json({error: 'Order not found.'});
      const error = setStatus(o, text(req.body?.orderStatus, 20), seen[req.restaurantId].pos);
      if (error) return res.status(400).json({error});
      res.json({order: forBridge(o)});
    });

    // Lets restaurant screens show whether each bridge is connected. No secrets here.
    app.get('/api/bridge/health', (_req, res) => {
      const configured = keys(), now = Date.now();
      res.json({restaurants: Object.keys(configured).map(id => ({
        id, lastSeenAt: seen[id]?.at || null, pos: seen[id]?.pos || null,
        online: Boolean(seen[id] && now - Date.parse(seen[id].at) < ONLINE_MS)
      }))});
    });

    // Send a failed order to the POS again (from the pickup admin screen).
    app.post('/api/orders/:id/pos-retry', staff.requireStaff, (req, res) => {
      const o = orders.find(x => x.id === req.params.id);
      if (!o || handledElsewhere(o) || !staff.canSee(req.staff, o)) return res.status(404).json({error: 'Order not found.'});
      if (o.pos?.status === 'error') o.pos = {};
      res.json(o);
    });
  }

  // If the kitchen forgets to press "Ready", assume the order is ready a few minutes after
  // its promised time so customers and drivers aren't left waiting. BRIDGE_AUTO_READY_MINUTES=off disables.
  function autoReady() {
    const setting = env('BRIDGE_AUTO_READY_MINUTES');
    if (setting === 'off') return;
    const graceMs = (Number(setting) || 10) * 60000, now = Date.now();
    for (const o of orders) {
      if (o.orderType === 'pickup' && o.pos?.status === 'synced' && !handledElsewhere(o)
        && ['new', 'preparing'].includes(o.orderStatus) && !o.kitchenReadyAt && now > Date.parse(o.pickupAt) + graceMs) {
        setStatus(o, 'ready', 'timer');
      }
    }
  }
  setInterval(autoReady, 30000).unref();

  return {mount, autoReady};
}
