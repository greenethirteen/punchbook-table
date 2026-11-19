// Daily accounts (page at /accounts): what each restaurant earned from paid orders on a day,
// Punchbook's commission, and what Punchbook owes the restaurant. Marking a payout as sent is
// saved to DATA_DIR/accounts.json together with the commission rate.
// Money model: the restaurant gets food sales (plus any table service charge) minus commission.
// Delivery fees stay with Punchbook to pay riders/PickMe, and Punchbook absorbs card fees.
// Admin only (staff.js). Only real payments count (testPayment === false, set in payments.js): simulated,
// sandbox and test-key payments are left out. The page's Demo switch shows made-up data instead.
// Cancelled and refunded orders don't count. Card fees and rider/PickMe costs
// are shown so Punchbook's own share can be seen after costs.
// Each restaurant's bank account is saved here too (typed in, or copied from its signup application),
// so the page can make one bank bulk-transfer file for a day. Every morning at 9 (Sri Lanka time) the
// admin's phone gets a push alert listing payouts still to send (alerts turned on from /admin or /accounts).
import fs from 'fs/promises';
import path from 'path';

const TZ = 'Asia/Colombo';
const dayOf = iso => new Intl.DateTimeFormat('en-CA', {timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit'}).format(new Date(iso));
const round = n => Math.round(n * 100) / 100;
const text = (v, max) => String(v ?? '').trim().slice(0, max);
// Restaurants are paid each day's money two days later (T+2).
const SETTLE_DAYS = 2;
const addDays = (d, n) => new Date(Date.parse(d + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);

export async function createAccounts({orders, restaurants, dataDir, staff, push, applications}) {
  const file = path.join(dataDir, 'accounts.json');
  let state = {commissionPct: 10, payouts: [], banks: {}, lastSummary: ''};
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
      if (o.paymentStatus !== 'paid' || o.testPayment !== false || o.orderStatus === 'cancelled' || dayOf(o.paidAt || o.createdAt) !== date) continue;
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
      return {...r, commissionPct: pct, commission, owed: round(r.food + r.service - commission), payout: payout || null, bank: state.banks[r.restaurantId] || null};
    }).sort((a, b) => b.owed - a.owed);
  }

  const today = () => dayOf(new Date().toISOString());
  // Payouts still to send from days before `date`.
  function unsentBefore(date) {
    const days = [...new Set(orders.filter(o => o.paymentStatus === 'paid' && o.testPayment === false).map(o => dayOf(o.paidAt || o.createdAt)))].filter(d => d < date);
    return days.flatMap(d => day(d).filter(r => !r.payout && r.owed > 0).map(r => ({date: d, restaurantId: r.restaurantId, name: r.name, owed: r.owed, bank: r.bank}))).sort((a, b) => a.date.localeCompare(b.date));
  }

  // Morning summary: once a day from 9am Sri Lanka time.
  async function morningSummary() {
    const hour = Number(new Intl.DateTimeFormat('en-GB', {timeZone: TZ, hour: '2-digit', hourCycle: 'h23'}).format(new Date()));
    const date = today();
    if (hour < 9 || state.lastSummary === date || !push?.sendAdmin) return;
    state.lastSummary = date;
    await save();
    const list = unsentBefore(date);
    if (!list.length) return;
    const by = {};
    for (const u of list) (by[u.restaurantId] ||= {name: u.name, owed: 0}).owed += u.owed;
    const total = round(list.reduce((n, u) => n + u.owed, 0)), names = Object.values(by);
    const lkr = n => 'LKR ' + n.toLocaleString('en-LK', {maximumFractionDigits: 2});
    await push.sendAdmin({title: `Payouts to send: ${lkr(total)}`, body: names.map(r => `${r.name} ${lkr(round(r.owed))}`).join(' · ').slice(0, 220), url: '/accounts', tag: 'payouts-' + date});
  }
  setInterval(() => morningSummary().catch(e => console.error('Payout summary failed:', e.message)), 10 * 60000).unref();
  setTimeout(() => morningSummary().catch(e => console.error('Payout summary failed:', e.message)), 30000).unref();

  function mount(app) {
    app.get('/api/accounts', auth, (req, res) => {
      const date = /^\d{4}-\d{2}-\d{2}$/.test(req.query.date) ? req.query.date : today();
      res.json({date, today: today(), commissionPct: state.commissionPct, rows: day(date), unpaid: unsentBefore(date), banks: state.banks});
    });

    app.post('/api/accounts/settings', auth, async (req, res) => {
      const pct = Number(req.body?.commissionPct);
      if (!(pct >= 0 && pct <= 50)) return res.status(400).json({error: 'Commission must be between 0 and 50%.'});
      state.commissionPct = round(pct);
      await save();
      res.json({commissionPct: state.commissionPct});
    });

    // Record (or undo) that restaurants' payouts for a day were sent: one restaurantId, or restaurantIds
    // for everything in a bank transfer file.
    app.post('/api/accounts/payouts', auth, async (req, res) => {
      const b = req.body || {}, date = text(b.date, 10);
      const ids = Array.isArray(b.restaurantIds) ? b.restaurantIds.slice(0, 200).map(x => text(x, 40)) : [text(b.restaurantId, 40)];
      const rows = day(date);
      if (!b.undo && ids.some(id => !rows.find(r => r.restaurantId === id))) return res.status(404).json({error: 'No paid orders for that restaurant on that day.'});
      for (const restaurantId of ids) {
        const row = rows.find(r => r.restaurantId === restaurantId);
        if (Array.isArray(b.restaurantIds) && row?.payout) continue; // already sent: keep its record
        state.payouts = state.payouts.filter(p => !(p.restaurantId === restaurantId && p.date === date));
        if (!b.undo) state.payouts.push({restaurantId, date, amount: row.owed, commissionPct: row.commissionPct, reference: text(b.reference, 80), sentAt: new Date().toISOString()});
      }
      await save();
      res.json({ok: true});
    });

    // A restaurant's own earnings, day by day, with when each day is paid (T+2). Restaurant keys see only
    // their restaurant; the admin picks one with ?restaurant=.
    app.get('/api/accounts/mine', staff.requireStaff, (req, res) => {
      const id = req.staff.role === 'admin' ? text(req.query.restaurant, 40) || restaurants[0]?.id : req.staff.restaurantId;
      const r = restaurants.find(x => x.id === id);
      if (!r) return res.status(404).json({error: 'Restaurant not found.'});
      const t = today(), n = Math.min(90, Math.max(7, Number(req.query.days) || 30)), days = [];
      for (let i = 0; i < n; i++) {
        const d = new Date(Date.parse(t + 'T12:00:00Z') - i * 864e5).toISOString().slice(0, 10), dueDate = addDays(d, SETTLE_DAYS);
        const row = day(d).find(x => x.restaurantId === id);
        if (!row) continue;
        const status = row.payout ? 'paid' : d === t ? 'today' : dueDate < t ? 'overdue' : dueDate === t ? 'due' : 'upcoming';
        days.push({date: d, dueDate, status, orders: row.orders, food: row.food, service: row.service, commission: row.commission, commissionPct: row.commissionPct, owed: row.owed,
          payout: row.payout ? {amount: row.payout.amount, sentAt: row.payout.sentAt, reference: row.payout.reference} : null});
      }
      const b = state.banks[id];
      res.json({restaurant: {id: r.id, name: r.name, area: r.area}, restaurants: req.staff.role === 'admin' ? restaurants.map(x => ({id: x.id, name: x.name})) : null,
        today: t, settleDays: SETTLE_DAYS, commissionPct: state.commissionPct, days, bank: b ? {bankName: b.bankName, last4: b.accountNumber.slice(-4)} : null});
    });

    // Payouts already marked sent, newest first, for the history list.
    app.get('/api/accounts/history', auth, (_req, res) => {
      const name = id => restaurants.find(r => r.id === id)?.name || orders.find(o => o.restaurantId === id)?.restaurantName || id;
      res.json({payouts: [...state.payouts].sort((a, b) => String(b.sentAt).localeCompare(String(a.sentAt))).slice(0, 300).map(p => ({...p, name: name(p.restaurantId)}))});
    });

    // A restaurant's bank account for payouts. Empty fields remove it.
    app.post('/api/accounts/banks', auth, async (req, res) => {
      const b = req.body || {}, restaurantId = text(b.restaurantId, 40);
      if (!restaurants.some(r => r.id === restaurantId) && !orders.some(o => o.restaurantId === restaurantId)) return res.status(404).json({error: 'Unknown restaurant.'});
      const bank = {accountName: text(b.accountName, 120), bankName: text(b.bankName, 80), branch: text(b.branch, 80), accountNumber: text(b.accountNumber, 30).replace(/[\s-]/g, '')};
      if (!Object.values(bank).some(Boolean)) delete state.banks[restaurantId];
      else {
        if (!bank.accountName || !bank.bankName || !bank.accountNumber) return res.status(400).json({error: 'Add the account name, bank and account number.'});
        if (!/^\d{6,20}$/.test(bank.accountNumber)) return res.status(400).json({error: 'The account number should be 6 to 20 digits.'});
        state.banks[restaurantId] = {...bank, updatedAt: new Date().toISOString()};
      }
      await save();
      res.json({ok: true, bank: state.banks[restaurantId] || null});
    });

    // Bank details from signup applications, to copy into a restaurant's payout account.
    app.get('/api/accounts/applications', auth, async (_req, res) => {
      const list = await applications().catch(() => []);
      res.json({applications: list.filter(c => c.bankAccountNumber).map(c => ({id: c.id, name: c.tradingName || c.companyName, accountName: c.bankAccountName, bankName: c.bankName, branch: c.bankBranch, accountNumber: c.bankAccountNumber}))});
    });
  }

  return {mount};
}
