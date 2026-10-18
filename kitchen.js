// Restaurant-side order controls used by /admin and /pickup-admin: the order list, status changes,
// cancelling with a refund, and pausing new orders. All of it needs a staff key (see staff.js), and a
// restaurant's key only reaches its own orders.
//
// Delivery orders have one extra kitchen step: "food ready" (kitchenReadyAt) while the order waits
// for a rider. orderStatus "ready" means it has left with the rider, which the customer's app shows
// as "On the way", and "collected" means delivered.
import fs from 'fs/promises';
import path from 'path';

const STATUSES = {pickup: ['new', 'preparing', 'ready', 'collected'], table: ['new', 'preparing', 'served']};
const FINISHED = new Set(['collected', 'served', 'cancelled']);
const kind = o => o.orderType === 'pickup' ? 'pickup' : 'table';

export async function createKitchen({orders, restaurants, dataDir, staff, payments, onStatus}) {
  const file = path.join(dataDir, 'restaurant-status.json');
  let state = {paused: {}};
  try { state = {...state, ...JSON.parse(await fs.readFile(file, 'utf8'))}; } catch (e) { if (e.code !== 'ENOENT') throw e; }
  const save = async () => {
    await fs.mkdir(dataDir, {recursive: true});
    await fs.writeFile(file + '.tmp', JSON.stringify(state));
    await fs.rename(file + '.tmp', file);
  };

  const accepting = id => !state.paused[id];

  const own = (req, res) => {
    const o = orders.find(x => x.id === req.params.id);
    if (!o || !staff.canSee(req.staff, o)) { res.status(404).json({error: 'Order not found'}); return null; }
    return o;
  };

  function mount(app) {
    app.get('/api/orders', staff.requireStaff, (req, res) => {
      res.json(orders.filter(o => staff.canSee(req.staff, o)).reverse());
    });

    app.post('/api/orders/:id/status', staff.requireStaff, (req, res) => {
      const o = own(req, res);
      if (!o) return;
      const next = String(req.body?.orderStatus || '');
      if (o.orderStatus === 'cancelled') return res.status(409).json({error: 'This order was cancelled.'});
      if (o.paymentStatus !== 'paid') return res.status(409).json({error: 'Wait until the order is paid.'});
      const now = new Date().toISOString();
      if (next === 'food_ready' && o.fulfilment === 'delivery') {
        o.kitchenReadyAt ||= now;
        if (o.orderStatus === 'new') o.orderStatus = 'preparing';
      } else if (STATUSES[kind(o)].includes(next)) {
        o.orderStatus = next;
        if (o.fulfilment === 'delivery' && ['ready', 'collected'].includes(next)) o.kitchenReadyAt ||= now;
      } else {
        return res.status(400).json({error: 'Invalid status.'});
      }
      o.statusChangedAt = now;
      o.statusSource = req.staff.role === 'admin' ? 'punchbook' : 'restaurant';
      onStatus(o);
      res.json(o);
    });

    // Cancels an unfinished order and refunds it in full if it was paid.
    app.post('/api/orders/:id/cancel', staff.requireStaff, async (req, res) => {
      const o = own(req, res);
      if (!o) return;
      if (FINISHED.has(o.orderStatus)) return res.status(409).json({error: o.orderStatus === 'cancelled' ? 'Already cancelled.' : 'This order is already finished.'});
      if (o.dispatch?.status === 'picked_up') return res.status(409).json({error: 'A rider already has this order.'});
      const reason = String(req.body?.reason || '').trim().slice(0, 200) || 'Cancelled by the restaurant';
      try { await payments.refund(o, reason); }
      catch (e) { console.error('Refund failed:', o.id, e.message); return res.status(502).json({error: 'The refund didn’t go through, so the order was not cancelled. Try again.'}); }
      o.orderStatus = 'cancelled';
      o.cancelledAt = new Date().toISOString();
      o.cancelReason = reason;
      onStatus(o);
      res.json(o);
    });

    app.get('/api/restaurants/status', staff.requireStaff, (req, res) => {
      res.json({restaurants: restaurants.filter(r => req.staff.role === 'admin' || r.id === req.staff.restaurantId)
        .map(r => ({id: r.id, name: r.name, area: r.area, accepting: accepting(r.id)}))});
    });

    app.post('/api/restaurants/:id/pause', staff.requireStaff, async (req, res) => {
      const r = restaurants.find(x => x.id === req.params.id);
      if (!r || !(req.staff.role === 'admin' || req.staff.restaurantId === r.id)) return res.status(404).json({error: 'Restaurant not found.'});
      if (req.body?.paused) state.paused[r.id] = new Date().toISOString(); else delete state.paused[r.id];
      await save();
      res.json({id: r.id, accepting: accepting(r.id)});
    });
  }

  return {mount, accepting};
}
