// OnePay hosted checkout for real orders (used by payments.js when an order is paid with gateway "onepay",
// e.g. from the /peppermint-v5 menu). https://docs.onepay.lk/api-documentation/payment-api
// OnePay requires the customer's name, phone and email up front; Punchbook doesn't collect email and table
// orders have no name, so blanks are filled with the table number and PAYMENTS_CUSTOMER_EMAIL.
//
// ONEPAY_APP_ID, ONEPAY_HASH_SALT  From the OnePay merchant dashboard → API Keys (sandbox or live set).
// ONEPAY_APP_TOKEN                 Sent as the Authorization header when set.
// ONEPAY_API_BASE                  Defaults to https://api.onepay.lk.
import crypto from 'crypto';

export function createOnepay() {
  const env = n => process.env[n] || '';
  const configured = () => Boolean(env('ONEPAY_APP_ID') && env('ONEPAY_HASH_SALT'));
  const base = () => (env('ONEPAY_API_BASE') || 'https://api.onepay.lk').replace(/\/$/, '');

  async function call(path, body) {
    const res = await fetch(base() + path, {
      method: 'POST',
      headers: {'Content-Type': 'application/json', ...(env('ONEPAY_APP_TOKEN') ? {Authorization: env('ONEPAY_APP_TOKEN')} : {})},
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data?.message || data?.error || `OnePay returned ${res.status}`), {status: res.status});
    return data;
  }

  function customer(o) {
    const [first, ...rest] = String(o.customer?.name || '').trim().split(/\s+/).filter(Boolean);
    let phone = String(o.customer?.phone || '').replace(/[\s-]/g, '');
    if (/^0\d{9}$/.test(phone)) phone = '+94' + phone.slice(1);
    return {
      customer_first_name: (first || (o.table ? 'Table' : 'Punchbook')).slice(0, 60),
      customer_last_name: (rest.join(' ') || (o.table ? String(o.table) : 'guest')).slice(0, 60),
      customer_phone_number: /^\+94\d{9}$/.test(phone) ? phone : '+94770000000',
      customer_email: env('PAYMENTS_CUSTOMER_EMAIL') || 'orders@punchbook.online',
    };
  }

  /** Creates a checkout link for the order; returns {url, txId}. */
  async function start(o, returnUrl) {
    const appId = env('ONEPAY_APP_ID'), currency = 'LKR', amount = Number(o.total).toFixed(2);
    const data = await call('/v3/checkout/link/', {
      app_id: appId,
      amount: Number(amount),
      currency,
      hash: crypto.createHash('sha256').update(appId + currency + amount + env('ONEPAY_HASH_SALT')).digest('hex'),
      reference: o.id,
      ...customer(o),
      transaction_redirect_url: returnUrl,
      additionalData: JSON.stringify({orderId: o.id}),
    });
    const d = data?.data || data;
    const url = d?.redirect_url || d?.gateway_url, txId = d?.ipg_transaction_id || d?.transaction_id;
    if (!url || !txId) throw new Error('OnePay didn’t return a payment link.');
    return {url, txId};
  }

  /** Asks OnePay whether the transaction was paid; returns {paid, amount, paidOn}. */
  async function check(txId) {
    const data = await call('/v3/transaction/status/', {app_id: env('ONEPAY_APP_ID'), onepay_transaction_id: txId});
    const d = data?.data && typeof data.data === 'object' ? {...data, ...data.data} : data;
    return {paid: d?.status === true, amount: d?.amount != null ? Number(d.amount) : null, paidOn: d?.paid_on || null};
  }

  return {configured, start, check};
}
