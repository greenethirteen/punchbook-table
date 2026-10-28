// PayPlus (DirectPay) hosted checkout, used by payments.js when an order is paid with gateway "payplus"
// (the /peppermint-pp menu). Follows "PayPlus Transactions API v1.7": every request is a JSON payload,
// Base64-encoded, signed with HMAC-SHA256 of that Base64 text using the merchant secret, and sent as the
// body with "Authorization: hmac <hex>".
// PayPlus also POSTs a Base64 result to notifyUrl, but an order is only marked paid after the signed
// status check (/api/v2/payment-session/status) says so for the right amount.
// PayPlus requires the customer's name, email and phone; orders without them get "Punchbook Guest" and placeholders.
//
// PAYPLUS_MERCHANT_ID, PAYPLUS_SECRET  From dashboard.payplus.lk → Integrations (test mode for sandbox).
// PAYPLUS_APP_KEY                      Application key, if the account has one (sandbox works without).
// PAYPLUS_SANDBOX=false                Use the live gateway.
import crypto from 'crypto';

const BASE = {sandbox: 'https://gateway-sandbox-api.payplus.lk', live: 'https://gateway-api.payplus.lk'};
const PAID = new Set(['SUCCESS', 'SUCCESSFUL', 'COMPLETED', 'PAID', 'APPROVED']);

export function createPayplus() {
  const env = n => process.env[n] || '';
  const configured = () => Boolean(env('PAYPLUS_MERCHANT_ID') && env('PAYPLUS_SECRET'));
  const sandbox = () => env('PAYPLUS_SANDBOX').toLowerCase() !== 'false';
  const base = () => env('PAYPLUS_API_URL') || (sandbox() ? BASE.sandbox : BASE.live); // override for tests

  async function call(path, payload) {
    const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');
    const signature = crypto.createHmac('sha256', env('PAYPLUS_SECRET')).update(body).digest('hex');
    const res = await fetch(base() + path, {method: 'POST', headers: {'Content-Type': 'application/json', Authorization: `hmac ${signature}`}, body});
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.result !== 'SUCCESS') {
      const why = data?.error?.explanation || data?.error?.cause || `PayPlus returned ${res.status}`;
      throw Object.assign(new Error(why), {status: res.status, code: data?.error?.code});
    }
    return data.data || {};
  }

  function customer(o) {
    const [first, ...rest] = String(o.customer?.name || '').trim().split(/\s+/).filter(Boolean);
    const digits = String(o.customer?.phone || '').replace(/\D/g, '').replace(/^94/, '').replace(/^0/, '');
    return {
      // PayPlus shows these on its card step, so customers without a name on the order see "Punchbook Guest".
      firstname: (first || 'Punchbook').slice(0, 100),
      lastname: (first ? rest.join(' ') || '-' : 'Guest').slice(0, 100),
      email: env('PAYMENTS_CUSTOMER_EMAIL') || 'orders@punchbook.online',
      phoneNumber: /^7\d{8}$/.test(digits) ? digits : '770000000',
      dialCode: '+94',
    };
  }

  /** Creates a hosted payment session; returns {url, token}. */
  async function start(o, {base: site, domain}) {
    const d = await call('/api/payment-session/create', {
      merchantId: env('PAYPLUS_MERCHANT_ID'),
      applicationKey: env('PAYPLUS_APP_KEY'),
      domain,
      platformType: 'WEB',
      amount: Number(Number(o.total).toFixed(2)),
      paymentType: 'ONE_TIME',
      type: 'PAYMENT_LINK',
      orderId: o.id,
      currency: 'LKR',
      pluginVersion: '1.0.0',
      notifyUrl: `${site}/api/payments/payplus/notify`,
      redirectUrl: `${site}/payment-return.html?order=${encodeURIComponent(o.id)}`,
      source: 'NODE_JS',
      description: `${o.restaurantName || 'Punchbook'} order ${o.id}`.slice(0, 255),
      doInitialPayment: false,
      customerInfo: customer(o),
    });
    if (!d.link) throw new Error('PayPlus didn’t return a payment link.');
    return {url: d.link, token: d.token || null};
  }

  /** Asks PayPlus for the order's status; returns {paid, status, amount, txId}. */
  async function check(orderId) {
    const d = await call('/api/v2/payment-session/status', {merchantId: env('PAYPLUS_MERCHANT_ID'), orderId});
    const status = String(d.status || '').toUpperCase();
    return {paid: PAID.has(status), status, amount: d.amount != null ? Number(d.amount) : null, txId: String(d.transactionId || d.referenceNo || '')};
  }

  /** The order id in PayPlus's Base64 notification, if it can be read. It is only a cue to run check(). */
  function notifiedOrderId(raw) {
    const text = String(raw || '').trim().replace(/^"|"$/g, '');
    for (const parse of [() => JSON.parse(Buffer.from(text, 'base64').toString('utf8')), () => JSON.parse(text)]) {
      try {
        const d = parse();
        const v = d?.orderId || d?.data?.orderId || d?.order_id;
        if (v) return String(v);
      } catch {}
    }
    return null;
  }

  return {configured, start, check, notifiedOrderId, sandbox};
}
