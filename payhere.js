// PayHere hosted checkout (used by payments.js when an order is paid with gateway "payhere", e.g. from
// the /peppermint-v6 menu). https://support.payhere.lk/api-&-mobile-sdk/checkout-api
// PayHere takes a form POST, so the customer is sent to a tiny page here that posts to PayHere. PayHere
// reports the result to notify_url; only a correctly signed notification for the right amount marks an
// order paid. It requires name, email, phone and address up front; table orders have none, so they get
// the table number and the restaurant's own area.
//
// PAYHERE_MERCHANT_ID, PAYHERE_MERCHANT_SECRET  Sandbox merchant and the secret for this domain
//                                               (PayHere → Integrations → add domain).
// PAYHERE_SANDBOX=false                         Use live PayHere instead of sandbox.payhere.lk.
import crypto from 'crypto';

// Methods PayHere can open directly, skipping its own "Pay with" screen (its payment_method field).
const DIRECT_METHODS = new Set(['VISA', 'MASTER', 'AMEX', 'HELAPAY', 'FRIMI', 'QPLUS']);
const md5 = s => crypto.createHash('md5').update(s).digest('hex').toUpperCase();
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));

export function createPayhere() {
  const env = n => process.env[n] || '';
  const configured = () => Boolean(env('PAYHERE_MERCHANT_ID') && env('PAYHERE_MERCHANT_SECRET'));
  const host = () => env('PAYHERE_SANDBOX').toLowerCase() === 'false' ? 'https://www.payhere.lk' : 'https://sandbox.payhere.lk';
  const secretHash = () => md5(env('PAYHERE_MERCHANT_SECRET'));

  /** The fields PayHere's checkout expects for this order. */
  function fields(o, base) {
    const amount = Number(o.total).toFixed(2), page = `${base}/payment-return.html?order=${encodeURIComponent(o.id)}`;
    const [first, ...rest] = String(o.customer?.name || '').trim().split(/\s+/).filter(Boolean);
    const phone = String(o.customer?.phone || '').replace(/[\s-]/g, '');
    return {
      merchant_id: env('PAYHERE_MERCHANT_ID'),
      return_url: page,
      cancel_url: `${page}&cancelled=1`,
      notify_url: `${base}/api/payments/payhere/notify`,
      order_id: o.id,
      items: `${o.restaurantName || 'Punchbook'} order ${o.id}`,
      currency: 'LKR',
      amount,
      first_name: first || (o.table ? 'Table' : 'Punchbook'),
      last_name: rest.join(' ') || (o.table ? String(o.table) : 'guest'),
      email: env('PAYMENTS_CUSTOMER_EMAIL') || 'orders@punchbook.online',
      phone: /^(\+94|0)7\d{8}$/.test(phone) ? phone : '0770000000',
      address: o.restaurantName || 'Punchbook',
      city: (o.restaurantArea || 'Colombo').split('·')[0].trim(),
      country: 'Sri Lanka',
      hash: md5(env('PAYHERE_MERCHANT_ID') + o.id + amount + 'LKR' + secretHash()),
    };
  }

  /** A page that sends the browser straight on to PayHere's checkout. */
  function redirectPage(o, base) {
    const inputs = Object.entries(fields(o, base)).map(([k, v]) => `<input type="hidden" name="${esc(k)}" value="${esc(v)}">`).join('');
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Opening PayHere…</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;font:16px system-ui,sans-serif;background:#f4f2eb;color:#171713}button{font:inherit;border:0;border-radius:12px;padding:14px 22px;background:#171713;color:#fff;font-weight:800}</style></head>
<body><form id="f" method="post" action="${host()}/pay/checkout">${inputs}<noscript><button>Continue to PayHere</button></noscript><p>Opening PayHere…</p></form>
<script>document.getElementById('f').submit()</script></body></html>`;
  }

  /** The payment object for PayHere's popup (JavaScript SDK), optionally opening straight on one method. */
  function popupPayment(o, base, method) {
    return {sandbox: host().includes('sandbox'), ...fields(o, base), ...(DIRECT_METHODS.has(method) ? {payment_method: method} : {})};
  }

  /** Checks a notify_url callback. Returns {orderId, paid, amount, paymentId} or null when the signature is wrong. */
  function readNotify(b) {
    const want = md5(String(b.merchant_id) + b.order_id + b.payhere_amount + b.payhere_currency + b.status_code + secretHash());
    if (!b.md5sig || b.md5sig !== want || String(b.merchant_id) !== env('PAYHERE_MERCHANT_ID')) return null;
    return {orderId: String(b.order_id), paid: String(b.status_code) === '2', amount: Number(b.payhere_amount), currency: b.payhere_currency, paymentId: String(b.payment_id || ''), method: b.method || null};
  }

  return {configured, redirectPage, popupPayment, readNotify, host};
}
