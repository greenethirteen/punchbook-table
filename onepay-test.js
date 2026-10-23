// OnePay sandbox trial (page at /onepay-test). Lets us see OnePay's hosted checkout next to Payments.lk
// before deciding which gateway customers use. It never touches real orders: test payments live only
// in memory here. https://docs.onepay.lk/api-documentation/payment-api
//
// ONEPAY_APP_ID, ONEPAY_HASH_SALT  Sandbox credentials from the OnePay merchant dashboard → API Keys.
// ONEPAY_APP_TOKEN                 Sent as the Authorization header when set (some accounts have one).
// ONEPAY_API_BASE                  Defaults to https://api.onepay.lk.
import crypto from 'crypto';

const MAX_AMOUNT = 10000;
const text = (v, max) => String(v ?? '').trim().slice(0, max);

export function createOnepayTest({publicBase}) {
  const env = n => process.env[n] || '';
  const configured = () => Boolean(env('ONEPAY_APP_ID') && env('ONEPAY_HASH_SALT'));
  const base = () => (env('ONEPAY_API_BASE') || 'https://api.onepay.lk').replace(/\/$/, '');
  const trials = new Map(); // reference -> {txId, amount, createdAt, created}

  async function call(path, body) {
    const res = await fetch(base() + path, {
      method: 'POST',
      headers: {'Content-Type': 'application/json', ...(env('ONEPAY_APP_TOKEN') ? {Authorization: env('ONEPAY_APP_TOKEN')} : {})},
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    return {ok: res.ok, status: res.status, data};
  }

  function mount(app) {
    app.get('/api/onepay-test/config', (_req, res) => res.json({configured: configured(), apiBase: base()}));

    app.post('/api/onepay-test/checkout', async (req, res) => {
      if (!configured()) return res.status(503).json({error: 'Add ONEPAY_APP_ID and ONEPAY_HASH_SALT (sandbox) in Railway first.'});
      const b = req.body || {}, amountNum = Math.round(Number(b.amount) * 100) / 100;
      if (!(amountNum >= 10 && amountNum <= MAX_AMOUNT)) return res.status(400).json({error: `Use an amount from LKR 10 to ${MAX_AMOUNT}.`});
      const appId = env('ONEPAY_APP_ID'), currency = 'LKR', amount = amountNum.toFixed(2);
      const reference = 'PBT-' + crypto.randomBytes(5).toString('hex').toUpperCase();
      let phone = text(b.phone, 20).replace(/[\s-]/g, '');
      if (/^0\d{9}$/.test(phone)) phone = '+94' + phone.slice(1);
      const payload = {
        app_id: appId,
        amount: Number(amount),
        currency,
        hash: crypto.createHash('sha256').update(appId + currency + amount + env('ONEPAY_HASH_SALT')).digest('hex'),
        reference,
        customer_first_name: text(b.firstName, 60) || 'Table',
        customer_last_name: text(b.lastName, 60) || '12',
        customer_phone_number: phone || '+94770000000',
        customer_email: text(b.email, 120) || 'orders@punchbook.online',
        transaction_redirect_url: `${publicBase(req)}/onepay-test?ref=${reference}`,
        additionalData: JSON.stringify({trial: true}),
      };
      try {
        const r = await call('/v3/checkout/link/', payload);
        const d = r.data?.data || r.data || {};
        const redirectUrl = d.redirect_url || d.gateway_url, txId = d.ipg_transaction_id || d.transaction_id;
        if (txId) trials.set(reference, {txId, amount, createdAt: new Date().toISOString()});
        // The hash and salt never leave the server; the raw response is shown to help debugging.
        const {hash, ...sent} = payload;
        res.status(r.ok && redirectUrl ? 200 : 502).json({ok: r.ok && Boolean(redirectUrl), redirectUrl, reference, sent, onepay: {status: r.status, body: r.data}});
      } catch (e) {
        res.status(502).json({error: 'Could not reach OnePay: ' + e.message});
      }
    });

    app.post('/api/onepay-test/status', async (req, res) => {
      const t = trials.get(text(req.body?.reference, 40));
      if (!t) return res.status(404).json({error: 'Unknown test payment (the server may have restarted since it was made).'});
      try {
        const r = await call('/v3/transaction/status/', {app_id: env('ONEPAY_APP_ID'), onepay_transaction_id: t.txId});
        const paid = Boolean(r.data?.status === true || r.data?.data?.status === true);
        res.json({paid, amount: t.amount, onepay: {status: r.status, body: r.data}});
      } catch (e) {
        res.status(502).json({error: 'Could not reach OnePay: ' + e.message});
      }
    });

    // OnePay's callback (set it in the OnePay portal → APP). Logged only; this is a trial.
    app.post('/api/onepay-test/callback', (req, res) => {
      console.log('OnePay test callback:', JSON.stringify(req.body).slice(0, 300));
      res.json({ok: true});
    });
  }

  return {mount};
}
