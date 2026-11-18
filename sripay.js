// SriPay hosted Checkout Session, used by payments.js when an order is paid with gateway "sripay" (the
// /peppermint-sp menu). Follows SriPay's Merchant API guide (developer console, reviewed 2026-11-03):
//   POST /aps/merchant/checkout-session/{env}/create        → {sessionId, token, checkoutUrl}
//   GET  /aps/merchant/checkout-session/{env}/result/{id}   → the started payment's provider result
//   GET  /aps/merchant/checkout-session/{env}/status/{id}   → session state (not the money outcome)
//   POST /aps/merchant/checkout-session/proceed/{id}        → starts the payment with the chosen method
// The menu shows its own method picker and calls proceed, so guests skip SriPay's method page and go
// straight to the card page or wallet. Each session allows one proceed attempt.
// Every request is signed: base64 ECDSA P-256 / SHA-256 (DER) of METHOD + path + x-timestamp + raw body,
// sent with clientId, x-timestamp and x-signature. SriPay signs its responses the same way with its public key.
// SriPay also sends signed webhooks (payment.succeeded …). An order is marked paid from a verified
// payment.succeeded webhook for the right amount, or from the signed result check.
//
// SRIPAY_CLIENT_ID          Developer console → Details Summary → Client ID.
// SRIPAY_PRIVATE_KEY        Developer console → Keys → Developer Private Key (PEM, "\n" allowed).
// SRIPAY_PUBLIC_KEY         Developer console → Keys → SriPay Public Key; checks SriPay's response signatures.
// SRIPAY_OUTLET_ID          Optional; overrides the store ID configured for the application (x-outlet-id).
// SRIPAY_WEBHOOK_KEY_ID, SRIPAY_WEBHOOK_PUBLIC_KEY  Developer console → Webhooks, after saving the endpoint
//                           https://<your domain>/api/payments/sripay/webhook.
// SRIPAY_ENV=prod           Live payments (needs production approval); default sandbox.
import crypto from 'crypto';

const BASE = 'https://gateway-api.sripay.lk';
const PAID = new Set(['SUCCESS', 'SUCCEEDED', 'SUCCESSFUL', 'TRADE_SUCCESS', 'PAID', 'COMPLETED', 'APPROVED', 'CAPTURED']);
const FAILED = new Set(['FAILED', 'FAIL', 'FAILURE', 'DECLINED', 'CANCELLED', 'CANCELED', 'EXPIRED', 'CLOSED', 'TRADE_CLOSED', 'REJECTED']);

export function createSripay() {
  const env = n => process.env[n] || '';
  const pem = n => env(n).replace(/\\n/g, '\n');
  const configured = () => Boolean(env('SRIPAY_CLIENT_ID') && env('SRIPAY_PRIVATE_KEY'));
  const environment = () => env('SRIPAY_ENV').toLowerCase() === 'prod' ? 'prod' : 'sandbox';
  const sandbox = () => environment() === 'sandbox';
  const base = () => (env('SRIPAY_BASE_URL') || BASE).replace(/\/+$/, '');

  function responseSigned(method, pathname, res, raw) {
    const key = pem('SRIPAY_PUBLIC_KEY');
    if (!key) return true; // no key configured: unchecked (sandbox only, see call())
    const ts = res.headers.get('x-timestamp'), sig = res.headers.get('x-signature'), t = Date.parse(ts || '');
    if (!sig || !Number.isFinite(t) || Math.abs(Date.now() - t) > 120000) return false;
    try { return crypto.verify('sha256', Buffer.from(method + pathname + ts + raw, 'utf8'), {key, dsaEncoding: 'der'}, Buffer.from(sig, 'base64')); }
    catch { return false; }
  }

  async function call(method, path, body) {
    const url = new URL(base() + path), raw = body ? JSON.stringify(body) : '', timestamp = new Date().toISOString();
    const signature = crypto.sign('sha256', Buffer.from(method + url.pathname + timestamp + raw, 'utf8'), {key: pem('SRIPAY_PRIVATE_KEY'), dsaEncoding: 'der'}).toString('base64');
    const res = await fetch(url, {
      method,
      headers: {clientId: env('SRIPAY_CLIENT_ID'), 'x-timestamp': timestamp, 'x-signature': signature, ...(env('SRIPAY_OUTLET_ID') ? {'x-outlet-id': env('SRIPAY_OUTLET_ID')} : {}), ...(body ? {'Content-Type': 'application/json'} : {})},
      body: body ? raw : undefined,
    });
    const text = await res.text();
    let data = {};
    try { data = JSON.parse(text); } catch {}
    if (!res.ok || data.success === false) {
      const why = data?.message || data?.result?.resultMessage || data?.error?.message || `SriPay returned ${res.status}`;
      throw Object.assign(new Error(why), {status: res.status, code: data?.code || data?.result?.resultCode});
    }
    if (!responseSigned(method, url.pathname, res, text)) throw new Error('SriPay’s response signature didn’t check out.');
    if (!pem('SRIPAY_PUBLIC_KEY') && !sandbox()) throw new Error('Set SRIPAY_PUBLIC_KEY before taking live payments.');
    return data;
  }

  /** Creates a hosted checkout session; returns {sessionId, token, url, expiresAt}. */
  async function start(o, site) {
    const d = await call('POST', `/aps/merchant/checkout-session/${environment()}/create`, {
      amount: Number(o.total).toFixed(2),
      currency: 'LKR',
      description: `${o.restaurantName || 'Punchbook'} ${o.id}`.slice(0, 64),
      redirectUrl: `${site}/payment-return.html?order=${encodeURIComponent(o.id)}`,
    });
    if (!d.checkoutUrl || !d.sessionId) throw new Error('SriPay didn’t return a checkout link.');
    return {sessionId: d.sessionId, token: d.token || null, url: d.checkoutUrl, expiresAt: d.expiresAt || null, methods: (d.availableMethods || []).map(m => m.code)};
  }

  /** Starts the session's payment with a method (visa_master, sripay_online, alipay_online); returns {url}.
   *  Authorised by the session token, not the app signature. Throws with .definite when SriPay refused it,
   *  so a new session can be made; any other failure may have started a payment and must be reconciled. */
  async function proceed(p, method) {
    let res;
    try {
      res = await fetch(`${base()}/aps/merchant/checkout-session/proceed/${encodeURIComponent(p.sessionId)}`, {
        method: 'POST', headers: {'Content-Type': 'application/json', 'x-session-token': p.token}, body: JSON.stringify({paymentMethod: method}),
      });
    } catch (e) { throw Object.assign(new Error('Couldn’t reach SriPay.'), {definite: false}); }
    const d = await res.json().catch(() => ({}));
    if (!res.ok || d.success === false) {
      const r = d?.data?.result || d?.result || {};
      throw Object.assign(new Error(r.resultMessage || d.message || `SriPay returned ${res.status}`), {status: res.status, code: r.resultCode || d.code, definite: res.status >= 400 && res.status < 500});
    }
    // The page to send the guest to is provider-defined: take redirectUrl, else the first link in the payment data.
    const url = d.redirectUrl || findAll(d.payment, (k, v) => typeof v === 'string' && /^https:\/\//.test(v) && /url|link|redirect|checkout|cashier/i.test(k))[0] || null;
    return {url, reference: d.paymentReference || null};
  }

  // The result's payment data is provider-defined (card, SriPay or Alipay+), so look for its status and amount.
  function findAll(x, test, out = []) {
    if (!x || typeof x !== 'object') return out;
    for (const [k, v] of Object.entries(x)) { if (test(k, v)) out.push(v); if (v && typeof v === 'object') findAll(v, test, out); }
    return out;
  }

  /** Asks SriPay how the session's payment went; returns {paid, failed, status, amount, currency, reference}. */
  async function check(p) {
    const id = encodeURIComponent(p.sessionId);
    const s = await call('GET', `/aps/merchant/checkout-session/${environment()}/status/${id}`);
    if (!s.used && s.paymentStatus === 'not_started') return {paid: false, failed: s.sessionState === 'closed' || s.sessionState === 'expired', status: s.sessionState || 'not_started', reference: null};
    if (!p.token) return {paid: false, failed: false, status: 'started', reference: s.paymentReference || null};
    const r = await call('GET', `/aps/merchant/checkout-session/${environment()}/result/${id}?token=${encodeURIComponent(p.token)}`);
    const statuses = findAll(r.status, (k, v) => typeof v === 'string' && /^(status|tradeStatus|paymentStatus|orderStatus|transactionStatus|state|resultCode)$/i.test(k)).map(v => v.toUpperCase());
    const amounts = findAll(r.status, (k, v) => /^(amount|totalAmount|paymentAmount|orderAmount|value)$/i.test(k) && (typeof v === 'string' || typeof v === 'number') && /^\d+(\.\d+)?$/.test(String(v))).map(Number);
    const currency = findAll(r.status, (k, v) => /^currency$/i.test(k) && typeof v === 'string')[0] || null;
    const paid = statuses.some(x => PAID.has(x)) && !statuses.some(x => FAILED.has(x));
    return {paid, failed: !paid && statuses.some(x => FAILED.has(x)), status: statuses[0] || 'unknown', amounts, currency, reference: r.paymentReference || s.paymentReference || null, method: r.paymentMethod || null};
  }

  /** Verifies a webhook delivery (headers, raw body string); returns the parsed event or null. */
  function readWebhook(headers, raw) {
    const key = pem('SRIPAY_WEBHOOK_PUBLIC_KEY'), keyId = env('SRIPAY_WEBHOOK_KEY_ID');
    const id = headers['x-sripay-event-id'], ts = headers['x-sripay-timestamp'], sig = headers['x-sripay-signature'];
    if (!key || headers['x-sripay-webhook-version'] !== '1' || typeof id !== 'string' || !id.startsWith('evt_') || !/^\d{10}$/.test(ts || '') ||
        Math.abs(Date.now() / 1000 - Number(ts)) > 300 || (keyId && headers['x-sripay-key-id'] !== keyId) || typeof sig !== 'string') return null;
    try {
      if (!crypto.verify('sha256', Buffer.from(`${id}.${ts}.${raw}`, 'utf8'), key, Buffer.from(sig, 'base64'))) return null;
      return JSON.parse(raw);
    } catch { return null; }
  }

  return {configured, sandbox, start, proceed, check, readWebhook};
}
