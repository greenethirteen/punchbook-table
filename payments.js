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
// An order can instead be paid through OnePay (onepay.js) when its page asks for gateway "onepay"
// (the /peppermint-v5 menu does), or through PayHere (payhere.js, gateway "payhere", /peppermint-v6).
// The same rules apply: paid only once the gateway confirms the amount.
import crypto from 'crypto';
import express from 'express';
import {createOnepay} from './onepay.js';
import {createPayhere} from './payhere.js';

const API = () => process.env.PAYMENTS_LK_API_BASE || 'https://api.payments.lk/v1'; // overridable for tests
const RECHECK_MS = 60000, RECHECK_WINDOW_MS = 2 * 3600000, SIGNATURE_TOLERANCE_S = 300;
// The app sends where to come back to; only its own scheme is allowed.
const APP_RETURN = /^punchbook:\/\/[\w\-/?=&.%]*$/;

export function createPayments({orders, publicBase, onPaid}) {
  const key = () => process.env.PAYMENTS_LK_SECRET_KEY || '';
  const provider = () => key() ? 'payments.lk' : 'simulated';
  const simulationAllowed = () => !key() && String(process.env.SIMULATE_PAYMENTS || 'true').toLowerCase() !== 'false';
  const cents = o => Math.round(Number(o.total) * 100);
  const onepay = createOnepay(), payhere = createPayhere();
  const isOnepay = o => o.payment?.provider === 'onepay';
  const isPayhere = o => o.payment?.provider === 'payhere';

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

  function markPaid(o, info) {
    if (o.paymentStatus === 'paid' || o.orderStatus === 'cancelled') return;
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
    if (isOnepay(o)) {
      if (!o.payment.txId || !onepay.configured()) return o;
      const r = await onepay.check(o.payment.txId);
      if (r.paid && (r.amount == null || Math.round(r.amount * 100) === cents(o))) markPaid(o, {provider: 'onepay', paymentId: o.payment.txId, feeCents: null});
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

  /** Starts paying for an order: {redirectUrl} for a real checkout, or the order paid when simulated. */
  async function start(o, req, {method, returnUrl, gateway, popup, payhereMethod} = {}) {
    if (o.paymentStatus === 'paid') return {ok: true, order: o};
    if (o.orderStatus === 'cancelled') throw Object.assign(new Error('This order was cancelled.'), {status: 409});
    o.paymentMethod = method === 'justpay' ? 'justpay' : 'card';
    if (gateway === 'payhere') {
      if (!payhere.configured()) throw Object.assign(new Error('PayHere isn’t set up yet.'), {status: 503});
      o.payment = {provider: 'payhere', attempts: (o.payment?.attempts || 0) + 1};
      // The /peppermint-v7 menu opens PayHere as a popup over the page instead of leaving it.
      if (popup) return {ok: true, simulated: false, payhere: payhere.popupPayment(o, publicBase(req), String(payhereMethod || '')), order: o};
      return {ok: true, simulated: false, redirectUrl: `${publicBase(req)}/api/payments/payhere/checkout/${encodeURIComponent(o.id)}`, order: o};
    }
    if (gateway === 'onepay') {
      if (!onepay.configured()) throw Object.assign(new Error('OnePay isn’t set up yet.'), {status: 503});
      if (isOnepay(o)) { await reconcile(o).catch(() => {}); if (o.paymentStatus === 'paid') return {ok: true, order: o}; }
      const {url, txId} = await onepay.start(o, `${publicBase(req)}/payment-return.html?order=${encodeURIComponent(o.id)}`);
      o.payment = {provider: 'onepay', txId, url, attempts: (o.payment?.attempts || 0) + 1};
      return {ok: true, simulated: false, redirectUrl: url, order: o};
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
    // No refund API is set up for OnePay or PayHere: the order is marked for a refund from their dashboard.
    if (isOnepay(o) || isPayhere(o)) {
      o.refund = {status: 'manual', amount: o.total, at: new Date().toISOString(), note: `Refund this in the ${isOnepay(o) ? 'OnePay' : 'PayHere'} merchant dashboard.`};
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
      try { res.json(await start(o, req, {method, returnUrl: b.returnUrl, gateway: b.gateway, popup: b.popup === true, payhereMethod: b.payhereMethod})); }
      catch (e) { console.error('Payment start failed:', e.message); res.status(e.status === 409 || e.status === 503 ? e.status : 502).json({error: e.status === 409 || e.status === 503 ? e.message : 'Couldn’t start the payment. Please try again.'}); }
    };
    app.post('/api/payments/card', pay('card'));
    // Kept under its old name for app builds that call it; it is a real checkout once a key is set.
    app.post('/api/payments/justpay/simulate', pay('justpay'));

    app.post('/api/payments/verify', async (req, res) => {
      const o = find(req, res);
      if (!o) return;
      try { await reconcile(o); } catch (e) { console.error('Payment verify failed:', e.message); }
      res.json({ok: o.paymentStatus === 'paid', simulated: o.payment?.provider === 'simulated', order: o, ...(o.payment?.failureMessage && o.paymentStatus !== 'paid' ? {error: o.payment.failureMessage} : {})});
    });

    // PayHere: the page that posts to PayHere's checkout, and PayHere's signed result (form-encoded).
    app.get('/api/payments/payhere/checkout/:id', (req, res) => {
      const o = orders.find(x => x.id === req.params.id && isPayhere(x));
      if (!o || !payhere.configured()) return res.status(404).send('Payment not found.');
      if (o.paymentStatus === 'paid') return res.redirect(`/payment-return.html?order=${encodeURIComponent(o.id)}`);
      res.set('Cache-Control', 'no-store').type('html').send(payhere.redirectPage(o, publicBase(req)));
    });
    app.post('/api/payments/payhere/notify', express.urlencoded({extended: false}), (req, res) => {
      const r = payhere.readNotify(req.body || {});
      if (!r) { console.error('PayHere notify with a bad signature for', req.body?.order_id); return res.status(400).send('bad signature'); }
      const o = orders.find(x => x.id === r.orderId && isPayhere(x));
      if (o && r.paid && r.currency === 'LKR' && Math.round(r.amount * 100) === cents(o)) markPaid(o, {provider: 'payhere', paymentId: r.paymentId, card: r.method, feeCents: null});
      res.send('ok');
    });

    // OnePay's callback (set in the OnePay portal → APP). Only a nudge: the order is checked with OnePay.
    app.post('/api/payments/onepay/callback', async (req, res) => {
      const tx = String(req.body?.transaction_id || '');
      const o = tx && orders.find(x => isOnepay(x) && x.payment.txId === tx);
      if (o) await reconcile(o).catch(e => console.error('OnePay callback check failed:', e.message));
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
    for (const o of orders.filter(x => x.paymentStatus === 'pending' && Date.parse(x.createdAt) > cutoff && (isOnepay(x) ? onepay.configured() : key() && x.payment?.checkoutId))) {
      await reconcile(o).catch(e => console.error('Payment recheck failed:', o.id, e.message));
    }
  }
  setInterval(recheck, RECHECK_MS).unref();

  return {mount, start, refund, reconcile, provider, simulationAllowed};
}
