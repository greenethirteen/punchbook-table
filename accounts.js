// Daily accounts (page at /accounts): what each restaurant earned from paid orders on a day,
// Punchbook's commission, and what Punchbook owes the restaurant. Marking a payout as sent is
// saved to DATA_DIR/accounts.json together with the commission rate.
// Money model: the restaurant gets food sales (plus any table service charge) minus commission.
// Delivery fees stay with Punchbook to pay riders/PickMe, and Punchbook absorbs card fees.
// Admin only (staff.js). Cancelled and refunded orders don't count. Card fees and rider/PickMe costs
// are shown so Punchbook's own share can be seen after costs.
import fs from 'fs/promises';
import path from 'path';

const TZ = 'Asia/Colombo';
const dayOf = iso => new Intl.DateTimeFormat('en-CA', {timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit'}).format(new Date(iso));
const round = n => Math.round(n * 100) / 100;
const text = (v, max) => String(v ?? '').trim().slice(0, max);

export async function createAccounts({orders, restaurants, dataDir, staff}) {
  const file = path.join(dataDir, 'accounts.json');
  let state = {commissionPct: 10, payouts: []};
  try { state = {...state, ...JSON.parse(await fs.readFile(file, 'utf8'))}; } catch (e) { if (e.code !== 'ENOENT') throw e; }
  async function save() {
    await fs.mkdir(dataDir, {recursive: true});
    await fs.writeFile(file + '.tmp', JSON.stringify(state, null, 2));
    await fs.rename(file + '.tmp', file);
  }

  const auth = staff.requireAdmin;

  // Paid orders, grouped by Sri Lanka day and restaurant. The payout's saved rate wins over today's.
  function day(date) {
    const rows = {};
    for (const o of orders) {
      if (o.paymentStatus !== 'paid' || o.orderStatus === 'cancelled' || dayOf(o.paidAt || o.createdAt) !== date) continue;
      const r = rows[o.restaurantId] ||= {restaurantId: o.restaurantId, name: o.restaurantName || restaurants.find(x => x.id === o.restaurantId)?.name || o.restaurantId, orders: 0, food: 0, service: 0, deliveryFees: 0, cardFees: 0, courierCosts: 0, delivery: 0, pickup: 0, table: 0};
      r.orders++;
      r.food += Number(o.subtotal) || 0;
      r.service += Number(o.service) || 0;
      r.deliveryFees += Number(o.deliveryFee) || 0;
      r.cardFees += (Number(o.payment?.feeCents) || 0) / 100;
      r.courierCosts += Number(o.dispatch?.courierCost) || 0;
      r[o.orderType === 'pickup' ? (o.fulfilment === 'delivery' ? 'delivery' : 'pickup') : 'table']++;
    }
    return Object.values(rows).map(r => {
      const payout = state.payouts.find(p => p.restaurantId === r.restaurantId && p.date === date);
      const pct = payout?.commissionPct ?? state.commissionPct, commission = round(r.food * pct / 100);
      return {...r, commissionPct: pct, commission, owed: round(r.food + r.service - commission), payout: payout || null};
    }).sort((a, b) => b.owed - a.owed);
  }

  function mount(app) {
    app.get('/api/accounts', auth, (req, res) => {
      const date = /^\d{4}-\d{2}-\d{2}$/.test(req.query.date) ? req.query.date : dayOf(new Date().toISOString());
      const rows = day(date);
      // Earlier days with a payout still to send.
      const days = [...new Set(orders.filter(o => o.paymentStatus === 'paid').map(o => dayOf(o.paidAt || o.createdAt)))].filter(d => d < date);
      const unpaid = days.flatMap(d => day(d).filter(r => !r.payout && r.owed > 0).map(r => ({date: d, restaurantId: r.restaurantId, name: r.name, owed: r.owed}))).sort((a, b) => a.date.localeCompare(b.date));
      res.json({date, today: dayOf(new Date().toISOString()), commissionPct: state.commissionPct, rows, unpaid});
    });

    app.post('/api/accounts/settings', auth, async (req, res) => {
      const pct = Number(req.body?.commissionPct);
      if (!(pct >= 0 && pct <= 50)) return res.status(400).json({error: 'Commission must be between 0 and 50%.'});
      state.commissionPct = round(pct);
      await save();
      res.json({commissionPct: state.commissionPct});
    });

    // Record (or undo) that a restaurant's payout for a day was sent.
    app.post('/api/accounts/payouts', auth, async (req, res) => {
      const b = req.body || {}, date = text(b.date, 10), restaurantId = text(b.restaurantId, 40);
      const row = day(date).find(r => r.restaurantId === restaurantId);
      state.payouts = state.payouts.filter(p => !(p.restaurantId === restaurantId && p.date === date));
      if (!b.undo) {
        if (!row) return res.status(404).json({error: 'No paid orders for that restaurant on that day.'});
        state.payouts.push({restaurantId, date, amount: row.owed, commissionPct: row.commissionPct, reference: text(b.reference, 80), sentAt: new Date().toISOString()});
      }
      await save();
      res.json({ok: true});
    });
  }

  return {mount};
}
