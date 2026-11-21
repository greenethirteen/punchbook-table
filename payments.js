// Payments through Payments.lk's hosted checkout (https://payments.lk/developers).
// The server creates a checkout for an order and sends the customer to its page. The order is
// marked paid only after the server reads the checkout back from Payments.lk and sees a succeeded
// payment for the right amount: on the webhook (POST /api/payments/webhook), when the customer
// returns (POST /api/payments/verify), and by a background check of recent unpaid orders.
//
// PAYMENTS_LK_SECRET_KEY   sk_test_… (sandbox) or sk_live_…. Without it payments are simulated,
//                          which is only for testing: any order can be marked paid for free.
// PAYMENTS_LK_WEBHOOK_SECRET  Signing secret of the webhook endpoint registered in the dashboard.
// SIMULATE_PAYMENTS=false  Refuse simulated payments even when no key is set.
//
// An order can instead be paid through PayHere (payhere.js, gateway "payhere", the /peppermint-ph menu)
// PayPlus (payplus.js, gateway "payplus", the /peppermint-pp menu) or DirectPay (directpay.js, gateway
// "directpay", the /peppermint-dp menu) or SriPay's hosted Checkout Session (sripay.js, gateway "sripay", the
// /peppermint-sp menu).
// The same rules apply: paid only once the gateway confirms the amount.
//
// Orders for a sandbox restaurant (o.sandbox, e.g. "Amra Leaf · Demo") never reach a real gateway: the guest
// goes to Punchbook's own test card page (/sandbox-pay) and the order is marked paid as a test payment.
import crypto from 'crypto';
import express from 'express';
import {createPayhere} from './payhere.js';
import {createPayplus} from './payplus.js';
import {createDirectpay} from './directpay.js';
import {createSripay} from './sripay.js';

const API = () => process.env.PAYMENTS_LK_API_BASE || 'https://api.payments.lk/v1'; // overridable for tests
const RECHECK_MS = 60000, RECHECK_WINDOW_MS = 2 * 3600000, SIGNATURE_TOLERANCE_S = 300;
// The app sends where to come back to; only its own scheme is allowed.
const APP_RETURN = /^punchbook:\/\/[\w\-/?=&.%]*$/;

export function createPayments({orders, publicBase, onPaid}) {
  const key = () => process.env.PAYMENTS_LK_SECRET_KEY || '';
  const provider = () => key() ? 'payments.lk' : 'simulated';
  const simulationAllowed = () => !key() && String(process.env.SIMULATE_PAYMENTS || 'true').toLowerCase() !== 'false';
  const cents = o => Math.round(Number(o.total) * 100);
  const payhere = createPayhere(), payplus = createPayplus(), directpay = createDirectpay(), sripay = createSripay();
  const isPayhere = o => o.payment?.provider === 'payhere';
  const isPayplus = o => o.payment?.provider === 'payplus';
  const isDirectpay = o => o.payment?.provider === 'directpay';
  const isSripay = o => o.payment?.provider === 'sripay';

  async function call(method, path, body, idempotencyKey) {
    const res = await fetch(API() + path, {
      method,
      headers: {Authorization: `Bearer ${key()}`, 'Content-Type': 'application/json', ...(idempotencyKey ? {'Idempotency-Key': idempotencyKey} : {})},
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data?.error?.message || data?.message || `Payments.lk returned ${res.status}`), {status: res.status});
    return data;
  }

  // Whether a payment is real money: false only for live gateways. Accounts (accounts.js) counts only
  // orders with testPayment === false, so orders paid before this flag existed count as test.
  function testMode(provider) {
    const off = name => String(process.env[name] || '').toLowerCase() === 'false';
    if (provider === 'payments.lk') return !key().startsWith('sk_live_');
    if (provider === 'payhere') return !off('PAYHERE_SANDBOX');
    if (provider === 'payplus') return payplus.sandbox();
    if (provider === 'directpay') return !off('DIRECTPAY_SANDBOX');
    if (provider === 'sripay') return sripay.sandbox();
    return true; // simulated
  }

  function markPaid(o, info) {
    if (o.paymentStatus === 'paid' || o.orderStatus === 'cancelled') return;
    o.testPayment = testMode(info.provider) || Boolean(info.unverified);
    o.paymentStatus = 'paid';
    o.paidAt = new Date().toISOString();
    o.payment = {...o.payment, ...info};
    o.paymentRef = info.paymentId || info.ref || o.paymentRef;
    onPaid(o);
  }

  /** Reads the order's checkout back from Payments.lk and marks the order paid if it succeeded. */
  async function reconcile(o) {
    if (o.paymentStatus === 'paid') return o;
    // PayHere has no lookup without extra API keys: its signed notify_url callback is what marks orders paid.
    if (isPayhere(o)) return o;
    if (isPayplus(o)) {
      if (!payplus.configured()) return o;
      const r = await payplus.check(o.id);
      o.payment.status = r.status;
      if (r.paid && (r.amount == null || Math.round(r.amount * 100) === cents(o))) markPaid(o, {provider: 'payplus', paymentId: r.txId, feeCents: null});
      return o;
    }
    if (isDirectpay(o)) {
      if (!o.payment.transactionId || !directpay.canVerify()) return o;
      const r = await directpay.check(o.id, o.payment.transactionId);
      o.payment.status = r.status;
      if (r.paid && r.currency === 'LKR' && Math.round(r.amount * 100) === cents(o)) markPaid(o, {provider: 'directpay', paymentId: o.payment.transactionId, feeCents: null});
      return o;
    }
    if (isSripay(o)) {
      if (!sripay.configured() || !o.payment.sessionId) return o;
      const r = await sripay.check(o.payment);
      o.payment.status = r.status;
      if (r.reference) o.payment.reference = r.reference;
      const amountOk = r.amounts?.length ? r.amounts.some(a => Math.round(a * 100) === cents(o)) : sripay.sandbox();
      if (r.paid && amountOk && (!r.currency || r.currency.toUpperCase() === 'LKR')) markPaid(o, {provider: 'sripay', paymentId: r.reference || o.payment.sessionId, card: r.method, feeCents: null, ...(r.amounts?.length ? {} : {unverified: true})});
      else if (r.failed) { o.payment.failureMessage = 'The payment didn’t go through.'; o.payment.uncertain = false; }
      return o;
    }
    if (!key() || !o.payment?.checkoutId) return o;
    const checkout = await call('GET', `/checkouts/${encodeURIComponent(o.payment.checkoutId)}`);
    const p = checkout.payment || {};
    o.payment.checkoutStatus = checkout.status;
    if (p.status === 'succeeded' && p.amountCents === cents(o) && p.reference === o.id) {
      markPaid(o, {provider: 'payments.lk', checkoutId: checkout.id, paymentId: p.id, feeCents: p.feeCents ?? null, card: p.card ? `${p.card.brand || p.card.scheme || ''} ${p.card.last4 || ''}`.trim() : null});
    } else if (p.status === 'failed') {
      o.payment.failureMessage = p.failureMessage || 'The payment didn’t go through.';
    }
    return o;
  }

  function checkoutCustomer(o) {
    const c = o.customer || {};
    const name = String(c.name || [c.firstName, c.lastName].filter(Boolean).join(' ')).trim().slice(0, 80);
    const phone = String(c.phone || '').replace(/[\s-]/g, '');
    return {
      name: name.length >= 2 ? name : 'Punchbook Guest',
      email: process.env.PAYMENTS_LK_GUEST_EMAIL || 'orders@punchbook.online',
      ...(/^(\+94|0)7\d{8}$/.test(phone) ? {phone} : {}),
    };
  }

  /** Starts paying for an order: {redirectUrl} for a real checkout, or the order paid when simulated. */
  async function start(o, req, {method, returnUrl, gateway} = {}) {
    if (o.paymentStatus === 'paid') return {ok: true, order: o};
    if (o.orderStatus === 'cancelled') throw Object.assign(new Error('This order was cancelled.'), {status: 409});
    o.paymentMethod = method === 'justpay' ? 'justpay' : 'card';
    if (o.sandbox) {
      o.payment = {provider: 'sandbox', attempts: (o.payment?.attempts || 0) + 1};
      return {ok: true, simulated: false, redirectUrl: `/sandbox-pay?order=${encodeURIComponent(o.id)}`, order: o};
    }
    if (gateway === 'payplus') {
      if (!payplus.configured()) throw Object.assign(new Error('PayPlus isn’t set up yet.'), {status: 503});
      if (isPayplus(o)) { await reconcile(o).catch(() => {}); if (o.paymentStatus === 'paid') return {ok: true, order: o}; }
      const base = publicBase(req), {url, token} = await payplus.start(o, {base, domain: new URL(base).host});
      o.payment = {provider: 'payplus', token, url, attempts: (o.payment?.attempts || 0) + 1};
      return {ok: true, simulated: false, redirectUrl: url, order: o};
    }
    if (gateway === 'sripay') {
      if (!sripay.configured()) throw Object.assign(new Error('SriPay isn’t set up yet.'), {status: 503});
      if (isSripay(o)) {
        await reconcile(o).catch(() => {});
        if (o.paymentStatus === 'paid') return {ok: true, order: o};
        // A payment that may have started is never replaced: it could still go through.
        if (o.payment.uncertain) throw Object.assign(new Error('We’re still checking your last payment. Please wait a moment.'), {status: 409});
        // Each session allows one payment attempt: reuse it only while it hasn't started and hasn't expired.
        if (o.payment.status === 'active' && Date.parse(o.payment.expiresAt) > Date.now() + 60000) return {ok: true, simulated: false, sripay: {methods: o.payment.methods || []}, order: o};
      }
      const s = await sripay.start(o, publicBase(req));
      o.payment = {provider: 'sripay', ...s, status: 'active', attempts: (o.payment?.attempts || 0) + 1};
      // The menu shows its own method picker, then calls /api/payments/sripay/proceed.
      return {ok: true, simulated: false, sripay: {methods: s.methods}, order: o};
    }
    if (gateway === 'directpay') {
      if (!directpay.configured()) throw Object.assign(new Error('DirectPay isn’t set up yet.'), {status: 503});
      o.payment = {provider: 'directpay', attempts: (o.payment?.attempts || 0) + 1};
      // The menu shows DirectPay's card form with these settings.
      return {ok: true, simulated: false, directpay: directpay.cardForm(o), order: o};
    }
    if (gateway === 'payhere') {
      if (!payhere.configured()) throw Object.assign(new Error('PayHere isn’t set up yet.'), {status: 503});
      o.payment = {provider: 'payhere', attempts: (o.payment?.attempts || 0) + 1};
      // The menu opens PayHere as a popup over the page with this payment object.
      return {ok: true, simulated: false, payhere: payhere.popupPayment(o, publicBase(req)), order: o};
    }
    if (!key()) {
      if (!simulationAllowed()) throw Object.assign(new Error('Payments aren’t set up yet.'), {status: 503});
      markPaid(o, {provider: 'simulated', ref: (o.paymentMethod === 'justpay' ? 'JP' : 'CARD') + '-DEMO-' + crypto.randomBytes(3).toString('hex').toUpperCase()});
      return {ok: true, simulated: true, order: o};
    }
    // Reuse a checkout that can still take the payment, so retrying never charges twice.
    if (o.payment?.checkoutId) {
      await reconcile(o).catch(() => {});
      if (o.paymentStatus === 'paid') return {ok: true, order: o};
      if (o.payment.checkoutStatus === 'open' && Date.parse(o.payment.expiresAt) > Date.now() + 60000) return {ok: true, redirectUrl: o.payment.url, order: o};
    }
    const base = publicBase(req), page = `${base}/payment-return.html?order=${encodeURIComponent(o.id)}`;
    const back = returnUrl && APP_RETURN.test(returnUrl) ? returnUrl : null;
    const attempt = (o.payment?.attempts || 0) + 1;
    const checkout = await call('POST', '/checkouts', {
      amountCents: cents(o),
      description: `${o.restaurantName || 'Punchbook'} order ${o.id}`.slice(0, 120),
      reference: o.id,
      // With a name and email, Payments.lk skips its details form and opens the card page straight away
      // ("Straight to the card page" in the dashboard). Table guests give no email, so a Punchbook
      // address stands in (PAYMENTS_LK_GUEST_EMAIL); Payable's receipt goes there.
      customer: checkoutCustomer(o),
      successUrl: back || page,
      cancelUrl: back ? `${back}${back.includes('?') ? '&' : '?'}cancelled=1` : `${page}&cancelled=1`,
      expiresInMinutes: 30,
    }, `checkout-${o.id}-${attempt}`);
    o.payment = {provider: 'payments.lk', checkoutId: checkout.id, url: checkout.url, expiresAt: checkout.expiresAt, checkoutStatus: checkout.status, attempts: attempt};
    return {ok: true, simulated: false, redirectUrl: checkout.url, order: o};
  }

  /** Refunds a paid order in full. Simulated payments are just marked refunded. */
  async function refund(o, reason) {
    if (o.paymentStatus !== 'paid') return;
    // No refund API is set up for PayHere, PayPlus, DirectPay or SriPay: the order is marked for a refund from their dashboard.
    if (isPayhere(o) || isPayplus(o) || isDirectpay(o) || isSripay(o)) {
      o.refund = {status: 'manual', amount: o.total, at: new Date().toISOString(), note: `Refund this in the ${isPayhere(o) ? 'PayHere' : isPayplus(o) ? 'PayPlus' : isDirectpay(o) ? 'DirectPay' : 'SriPay'} merchant dashboard.`};
      o.paymentStatus = 'refund_pending';
      return;
    }
    if (o.payment?.provider === 'payments.lk' && o.payment.paymentId) {
      const r = await call('POST', '/refunds', {paymentId: o.payment.paymentId, reason: String(reason || 'Order cancelled').slice(0, 200)}, `refund-${o.id}`);
      o.refund = {id: r.id, status: r.status, amount: r.amountCents / 100, at: new Date().toISOString()};
      o.paymentStatus = r.status === 'succeeded' ? 'refunded' : 'refund_pending';
    } else {
      o.refund = {status: 'succeeded', amount: o.total, at: new Date().toISOString(), simulated: true};
      o.paymentStatus = 'refunded';
    }
  }

  // Header "t=<unix>,v1=<hex>[,v1=<hex>]": HMAC-SHA256 of "<t>.<raw body>" with the signing secret.
  function signatureValid(raw, header) {
    const secret = process.env.PAYMENTS_LK_WEBHOOK_SECRET;
    if (!secret || !header) return false;
    const parts = header.split(',').map(p => p.trim().split('='));
    const t = parts.find(([k]) => k === 't')?.[1], sigs = parts.filter(([k]) => k === 'v1').map(([, v]) => v);
    if (!t || !sigs.length || Math.abs(Date.now() / 1000 - Number(t)) > SIGNATURE_TOLERANCE_S) return false;
    const expected = Buffer.from(crypto.createHmac('sha256', secret).update(`${t}.${raw}`).digest('hex'));
    return sigs.some(s => { const b = Buffer.from(s); return b.length === expected.length && crypto.timingSafeEqual(b, expected); });
  }

  function mount(app) {
    const find = (req, res) => {
      const o = orders.find(x => x.id === req.body?.orderId);
      if (!o) res.status(404).json({error: 'Order not found'});
      return o;
    };
    const pay = method => async (req, res) => {
      const o = find(req, res);
      if (!o) return;
      const b = req.body || {};
      // Every menu pays through Payments.lk now; the old per-menu gateways are kept only so that
      // orders already started with them can still be confirmed.
      try { res.json(await start(o, req, {method, returnUrl: b.returnUrl})); }
      catch (e) { console.error('Payment start failed:', e.message); res.status(e.status === 409 || e.status === 503 ? e.status : 502).json({error: e.status === 409 || e.status === 503 ? e.message : 'Couldn’t start the payment. Please try again.'}); }
    };
    // The sandbox test card page: shows the amount, then "pays" (test money only) or gives up.
    app.post('/api/payments/sandbox/info', (req, res) => {
      const o = find(req, res);
      if (!o) return;
      if (!o.sandbox) return res.status(404).json({error: 'Order not found'});
      res.json({id: o.id, total: o.total, restaurantName: o.restaurantName, table: o.table, paid: o.paymentStatus === 'paid', cancelled: o.orderStatus === 'cancelled',
        back: o.orderType === 'pickup' ? '/' : `/amraleaf-demo/t/${encodeURIComponent(o.table || '12')}`});
    });
    app.post('/api/payments/sandbox/pay', (req, res) => {
      const o = find(req, res);
      if (!o) return;
      if (!o.sandbox) return res.status(404).json({error: 'Order not found'});
      if (o.orderStatus === 'cancelled') return res.status(409).json({error: 'This order was cancelled.'});
      const last4 = String(req.body?.last4 || '4242').replace(/\D/g, '').slice(-4) || '4242';
      markPaid(o, {provider: 'sandbox', ref: 'TEST-' + crypto.randomBytes(3).toString('hex').toUpperCase(), card: 'Test card ' + last4, feeCents: null});
      res.json({ok: true, order: o});
    });
    app.get('/api/payments/config', (_req, res) => res.json({live: provider() === 'payments.lk'}));
    app.post('/api/payments/card', pay('card'));
    // Kept under its old name for app builds that call it; it is a real checkout once a key is set.
    app.post('/api/payments/justpay/simulate', pay('justpay'));

    app.post('/api/payments/verify', async (req, res) => {
      const o = find(req, res);
      if (!o) return;
      try { await reconcile(o); } catch (e) { console.error('Payment verify failed:', e.message); }
      res.json({ok: o.paymentStatus === 'paid', simulated: o.payment?.provider === 'simulated', order: o, ...(o.payment?.failureMessage && o.paymentStatus !== 'paid' ? {error: o.payment.failureMessage} : {})});
    });

    // PayHere's signed result (form-encoded).
    app.post('/api/payments/payhere/notify', express.urlencoded({extended: false}), (req, res) => {
      const r = payhere.readNotify(req.body || {});
      if (!r) { console.error('PayHere notify with a bad signature for', req.body?.order_id); return res.status(400).send('bad signature'); }
      const o = orders.find(x => x.id === r.orderId && isPayhere(x));
      if (o && r.paid && r.currency === 'LKR' && Math.round(r.amount * 100) === cents(o)) markPaid(o, {provider: 'payhere', paymentId: r.paymentId, card: r.method, feeCents: null});
      res.send('ok');
    });

    // PayPlus's Base64 result. Only a cue: the order is checked with PayPlus's signed status API.
    app.post('/api/payments/payplus/notify', express.text({type: '*/*', limit: '1mb'}), async (req, res) => {
      const id = payplus.notifiedOrderId(req.body);
      const o = id && orders.find(x => x.id === id && isPayplus(x));
      if (o) await reconcile(o).catch(e => console.error('PayPlus notify check failed:', e.message));
      res.json({ok: true});
    });

    // DirectPay's result, from the card form in the menu (orderId, transactionId) or DirectPay's server
    // confirmation set in the portal ({data: {reference, transactionId, ...}}). Neither is signed: with a private
    // key the order is checked with DirectPay's status API; without one only sandbox orders are trusted.
    const directpayResult = async b => {
      const id = String(b.orderId || b.data?.reference || ''), tx = b.transactionId || b.data?.transactionId;
      const o = orders.find(x => x.id === id && isDirectpay(x));
      if (!o || !tx) return o;
      o.payment.transactionId ??= String(tx);
      if (directpay.canVerify()) await reconcile(o).catch(e => console.error('DirectPay check failed:', e.message));
      else if (directpay.sandbox() && String(b.status || b.data?.status).toUpperCase() === 'SUCCESS') markPaid(o, {provider: 'directpay', paymentId: String(tx), feeCents: null, unverified: true});
      return o;
    };
    app.post('/api/payments/directpay/confirm', async (req, res) => {
      const o = await directpayResult(req.body || {});
      if (!o) return res.status(404).json({error: 'Order not found'});
      res.json({ok: o.paymentStatus === 'paid', order: o});
    });
    app.post('/api/payments/directpay/notify', async (req, res) => { await directpayResult(req.body || {}); res.json({ok: true}); });

    // The guest picked a method in the menu: start the payment and send them to the card page or wallet.
    app.post('/api/payments/sripay/proceed', async (req, res) => {
      const o = find(req, res);
      if (!o) return;
      if (!isSripay(o) || o.payment.status !== 'active') return res.status(409).json({error: 'Start the payment again.'});
      const method = String(req.body?.method || '');
      if (!o.payment.methods?.includes(method)) return res.status(400).json({error: 'That payment method isn’t available right now.'});
      o.payment.status = 'started';
      o.payment.method = method;
      try {
        const r = await sripay.proceed(o.payment, method);
        if (r.reference) o.payment.reference = r.reference;
        if (!r.url) { o.payment.uncertain = true; return res.status(502).json({error: 'SriPay didn’t return a payment page.'}); }
        res.json({ok: true, redirectUrl: r.url});
      } catch (e) {
        console.error('SriPay proceed failed:', e.code || '', e.message);
        if (!e.definite) o.payment.uncertain = true;
        const why = e.code === 'API_ACCESS_DISABLED' ? 'SriPay hasn’t turned on online payments for this store yet.' : 'SriPay couldn’t start the payment. Please try again.';
        res.status(502).json({error: why});
      }
    });

    // SriPay's signed webhook. payment.succeeded marks the order paid when the amount matches; any other
    // event for the order triggers a status check. Duplicates still get 2xx, as SriPay asks.
    app.post('/api/payments/sripay/webhook', async (req, res) => {
      const event = sripay.readWebhook(req.headers, req.rawBody || '');
      if (!event) return res.status(401).json({error: 'Bad signature'});
      const d = event.data || {}, refs = [d.paymentId, d.sessionId, d.paymentReference, d.merchantReference, d.orderId].filter(Boolean).map(String);
      const o = orders.find(x => isSripay(x) && (refs.includes(x.id) || refs.includes(x.payment.sessionId) || (x.payment.reference && refs.includes(x.payment.reference))));
      if (o) {
        const amt = d.amount && typeof d.amount === 'object' ? d.amount : {value: d.amount, currency: d.currency};
        if (event.type === 'payment.succeeded' && String(amt.currency || '').toUpperCase() === 'LKR' && Math.round(Number(amt.value) * 100) === cents(o)) markPaid(o, {provider: 'sripay', paymentId: String(d.paymentId || o.payment.sessionId), feeCents: null});
        else if (event.type === 'refund.succeeded' && o.refund) { o.refund.status = 'succeeded'; o.paymentStatus = 'refunded'; }
        else await reconcile(o).catch(e => console.error('SriPay webhook check failed:', e.message));
      }
      res.json({ok: true});
    });

    // The signature is checked, but the order is still only marked paid from Payments.lk's own record.
    app.post('/api/payments/webhook', async (req, res) => {
      if (!signatureValid(req.rawBody || '', req.get('payments-signature'))) return res.status(400).json({error: 'Bad signature'});
      const event = req.body || {}, ref = event.data?.reference;
      const o = ref && orders.find(x => x.id === ref);
      if (o) {
        try {
          if (event.type === 'payment.succeeded') await reconcile(o);
          if (event.type === 'refund.succeeded' && o.refund) { o.refund.status = 'succeeded'; o.paymentStatus = 'refunded'; }
          if (event.type === 'refund.failed' && o.refund) { o.refund.status = 'failed'; o.refund.error = event.data?.failureMessage || 'Refund failed'; }
        } catch (e) { console.error('Webhook reconcile failed:', e.message); return res.status(500).json({error: 'Try again'}); }
      }
      res.json({ok: true});
    });
  }

  // Catches payments whose webhook and return both went missing (e.g. the customer closed the app).
  async function recheck() {
    const cutoff = Date.now() - RECHECK_WINDOW_MS;
    for (const o of orders.filter(x => x.paymentStatus === 'pending' && Date.parse(x.createdAt) > cutoff && (isPayplus(x) ? payplus.configured() : isDirectpay(x) ? x.payment.transactionId && directpay.canVerify() : isSripay(x) ? sripay.configured() && x.payment.sessionId : key() && x.payment?.checkoutId))) {
      await reconcile(o).catch(e => console.error('Payment recheck failed:', o.id, e.message));
    }
  }
  setInterval(recheck, RECHECK_MS).unref();

  return {mount, start, refund, reconcile, provider, simulationAllowed};
}
