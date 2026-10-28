// PayHere checkout (used by payments.js when an order is paid with gateway "payhere", from the
// /peppermint-ph menu). The menu opens PayHere's popup (JavaScript SDK) with the payment object built here.
// https://support.payhere.lk/api-&-mobile-sdk/javascript-sdk
// PayHere reports the result to notify_url; only a correctly signed notification for the right amount marks an
// order paid. It requires name, email, phone and address up front; table orders have none, so they get
// the table number and the restaurant's own area.
//
// PAYHERE_MERCHANT_ID, PAYHERE_MERCHANT_SECRET  Sandbox merchant and the secret for this domain
//                                               (PayHere → Integrations → add domain).
// PAYHERE_SANDBOX=false                         Use live PayHere instead of sandbox.payhere.lk.
import crypto from 'crypto';

const md5 = s => crypto.createHash('md5').update(s).digest('hex').toUpperCase();

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

  /** The payment object for PayHere's popup (JavaScript SDK). */
  function popupPayment(o, base) {
    return {sandbox: host().includes('sandbox'), ...fields(o, base)};
  }

  /** Checks a notify_url callback. Returns {orderId, paid, amount, paymentId} or null when the signature is wrong. */
  function readNotify(b) {
    const want = md5(String(b.merchant_id) + b.order_id + b.payhere_amount + b.payhere_currency + b.status_code + secretHash());
    if (!b.md5sig || b.md5sig !== want || String(b.merchant_id) !== env('PAYHERE_MERCHANT_ID')) return null;
    return {orderId: String(b.order_id), paid: String(b.status_code) === '2', amount: Number(b.payhere_amount), currency: b.payhere_currency, paymentId: String(b.payment_id || ''), method: b.method || null};
  }

  return {configured, popupPayment, readNotify, host};
}
