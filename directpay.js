// DirectPay card checkout (used by payments.js when an order is paid with gateway "directpay", from the
// /peppermint-dp menu). The menu shows DirectPay's own card form (JavaScript SDK) inside the order sheet
// with the settings built here. https://doc.directpay.lk/cardPayment/oneTime.html
// The browser's result and DirectPay's server confirmation are not signed, so with a private key the order is
// only marked paid after DirectPay's signed status API (transaction/paymentStatus) confirms the amount.
// Without a key, sandbox orders are trusted on the confirmation alone: fine for the demo, never for live.
//
// DIRECTPAY_MERCHANT_ID, DIRECTPAY_API_KEY  developer.directpay.lk → Integration (sandbox account).
// DIRECTPAY_PRIVATE_KEY                     RSA private key (PEM, "\n" allowed) whose public key is in the portal.
// DIRECTPAY_SANDBOX=false                   Live gateway; then also set DIRECTPAY_SCRIPT_URL to the live SDK.
import crypto from 'crypto';

const API = {sandbox: 'https://dev.directpay.lk', live: 'https://prod.directpay.lk'};
const SANDBOX_SCRIPT = 'https://cdn.directpay.lk/dev/v1/directpayCardPayment.js?v=1';

export function createDirectpay() {
  const env = n => process.env[n] || '';
  const configured = () => Boolean(env('DIRECTPAY_MERCHANT_ID') && env('DIRECTPAY_API_KEY'));
  const sandbox = () => env('DIRECTPAY_SANDBOX').toLowerCase() !== 'false';
  const privateKey = () => env('DIRECTPAY_PRIVATE_KEY').replace(/\\n/g, '\n');
  const canVerify = () => Boolean(privateKey());
  const script = () => env('DIRECTPAY_SCRIPT_URL') || SANDBOX_SCRIPT;

  /** The settings for DirectPayCardPayment.init(), minus the container and callbacks. */
  function cardForm(o) {
    // The SDK only takes mobile numbers without the leading 0, e.g. 771234567.
    const phone = String(o.customer?.phone || '').replace(/\D/g, '').replace(/^94/, '').replace(/^0/, '');
    return {
      script: script(),
      merchantId: env('DIRECTPAY_MERCHANT_ID'),
      apiKey: env('DIRECTPAY_API_KEY'),
      amount: Number(o.total).toFixed(2),
      refCode: o.id,
      currency: 'LKR',
      type: 'ONE_TIME_PAYMENT',
      customerEmail: env('PAYMENTS_CUSTOMER_EMAIL') || 'orders@punchbook.online',
      customerMobile: /^7[0125678]\d{7}$/.test(phone) ? phone : '770000000',
      description: `${o.restaurantName || 'Punchbook'} order ${o.id}`.slice(0, 100),
      debug: sandbox(),
      logo: '', // required by the SDK; empty shows DirectPay's own
    };
  }

  /** Asks DirectPay for a transaction's status; returns {paid, status, amount, currency}. */
  async function check(orderId, transactionId) {
    const body = {merchantId: env('DIRECTPAY_MERCHANT_ID'), type: 'TRANSACTION_STATUS', transactionId: String(transactionId), merchantReference: orderId};
    // The signature covers the field values joined in the body's key order.
    const signature = crypto.sign('sha256', Buffer.from(Object.values(body).join('')), privateKey()).toString('base64');
    const res = await fetch(`${API[sandbox() ? 'sandbox' : 'live']}/v1/mpg/api/external/transaction/paymentStatus`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json', signature, 'x-api-key': env('DIRECTPAY_API_KEY')},
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    const t = Array.isArray(data.data) ? data.data[0] : null;
    if (!res.ok || data.status !== 200 || !t) throw new Error(data?.data?.message || `DirectPay returned ${res.status}`);
    const status = String(t.status || '').toUpperCase();
    return {paid: status === 'SUCCESS', status, amount: Number(t.amount), currency: t.currency || 'LKR'};
  }

  return {configured, sandbox, canVerify, cardForm, check};
}
