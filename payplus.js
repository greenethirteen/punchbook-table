// PayPlus (DirectPay) hosted checkout, used by payments.js when an order is paid with gateway "payplus"
// (the /peppermint-v8 menu). Mirrors their official SDK (npm payplus-ipg): the request is a base64 JSON
// payload signed with HMAC-SHA256 of that base64 text, sent as "Authorization: hmac <hex>".
// PayPlus POSTs the result to notify_url. Its format isn't documented, so readNotify accepts a base64 or
// plain JSON body and checks an "hmac" Authorization header the same way; in sandbox an unsigned or
// unrecognised notification is still accepted (and logged) so the format can be confirmed from a test payment.
// PayPlus requires the customer's name, email and phone; table orders get the table number and placeholders.
//
// PAYPLUS_MERCHANT_ID, PAYPLUS_APP_KEY, PAYPLUS_SECRET  From dashboard.payplus.lk (test mode for sandbox).
// PAYPLUS_SANDBOX=false                                Use the live gateway.
import crypto from 'crypto';

const ENDPOINTS = {
  sandbox: 'https://gateway-sandbox-api.payplus.lk/api/payment-session/create',
  live: 'https://gateway-api.payplus.lk/api/payment-session/create',
};

export function createPayplus() {
  const env = n => process.env[n] || '';
  const configured = () => Boolean(env('PAYPLUS_MERCHANT_ID') && env('PAYPLUS_APP_KEY') && env('PAYPLUS_SECRET'));
  const sandbox = () => env('PAYPLUS_SANDBOX').toLowerCase() !== 'false';
  const hmac = text => crypto.createHmac('sha256', env('PAYPLUS_SECRET')).update(text).digest('hex');

  function customer(o) {
    const [first, ...rest] = String(o.customer?.name || '').trim().split(/\s+/).filter(Boolean);
    const digits = String(o.customer?.phone || '').replace(/\D/g, '').replace(/^94/, '').replace(/^0/, '');
    return {
      firstname: (first || (o.table ? 'Table' : 'Punchbook')).slice(0, 60),
      lastname: (rest.join(' ') || (o.table ? String(o.table) : 'guest')).slice(0, 60),
      email: env('PAYMENTS_CUSTOMER_EMAIL') || 'orders@punchbook.online',
      phoneNumber: /^7\d{8}$/.test(digits) ? digits : '770000000',
      dialCode: '+94',
    };
  }

  /** Creates a hosted payment session; returns {url, sessionId}. */
  async function start(o, {base, domain}) {
    const payload = {
      merchantId: env('PAYPLUS_MERCHANT_ID'),
      applicationKey: env('PAYPLUS_APP_KEY'),
      domain,
      amount: Number(Number(o.total).toFixed(2)),
      type: 'PAYMENT_LINK',
      paymentType: 'ONE_TIME',
      orderId: o.id,
      currency: 'LKR',
      pluginVersion: '1.0.0',
      notifyUrl: `${base}/api/payments/payplus/notify`,
      redirectUrl: `${base}/payment-return.html?order=${encodeURIComponent(o.id)}`,
      source: 'CUSTOM',
      description: `${o.restaurantName || 'Punchbook'} order ${o.id}`,
      doInitialPayment: false,
      customerInfo: customer(o),
    };
    const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');
    const res = await fetch(env('PAYPLUS_API_URL') || (sandbox() ? ENDPOINTS.sandbox : ENDPOINTS.live), { // override for tests
      method: 'POST',
      headers: {'Content-Type': 'application/json', Authorization: `hmac ${hmac(body)}`},
      body,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.data?.link) {
      console.error('PayPlus session failed:', res.status, JSON.stringify(data).slice(0, 400));
      throw Object.assign(new Error(data?.message || data?.data?.message || `PayPlus returned ${res.status}`), {status: res.status});
    }
    return {url: data.data.link, sessionId: data.data.sessionId || null};
  }

  /** Reads PayPlus's notification. Returns {orderId, paid, amount, txId, verified, raw} or null if it can't be trusted. */
  function readNotify(raw, authorization) {
    const text = String(raw || '').trim();
    let data = null;
    try { data = JSON.parse(Buffer.from(text, 'base64').toString('utf8')); } catch {}
    if (!data || typeof data !== 'object') { try { data = JSON.parse(text); } catch {} }
    if (!data || typeof data !== 'object') return null;
    const sig = String(authorization || '').replace(/^hmac\s+/i, '');
    const want = hmac(text);
    const verified = Boolean(sig) && sig.length === want.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want));
    if (!verified && !sandbox()) return null;
    const d = data.data && typeof data.data === 'object' ? {...data, ...data.data} : data;
    const status = String(d.status || d.transactionStatus || d.paymentStatus || '').toUpperCase();
    return {
      orderId: String(d.orderId || d.order_id || d.reference || ''),
      paid: ['SUCCESS', 'SUCCESSFUL', 'PAID', 'COMPLETED', 'APPROVED'].includes(status),
      amount: d.amount != null ? Number(d.amount) : (d.transaction?.amount != null ? Number(d.transaction.amount) : null),
      txId: String(d.transactionId || d.transaction?.id || d.sessionId || ''),
      verified,
      raw: data,
    };
  }

  return {configured, start, readNotify, sandbox};
}
