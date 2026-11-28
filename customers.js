// Customer sign-up for the pickup app: name + Sri Lankan mobile number, confirmed with a one-time
// SMS code. Customers are kept in DATA_DIR/customers.json; the app holds a signed token.
//
// SMS uses the same settings as Jabby: SMS_PROVIDER=textlk (TEXTLK_API_KEY, TEXTLK_SENDER_ID)
// or SMS_PROVIDER=notifylk (NOTIFYLK_USER_ID, NOTIFYLK_API_KEY, NOTIFYLK_SENDER_ID).
// Without them, sign-up skips the code step (name + number only), so the app works before SMS
// is set up; adding the keys turns codes on with no app update.
// REVIEW_LOGINS="+94770000000:123456,..." lets App Store / Play reviewers sign in with a fixed
// code and no SMS.
//
// POST   /api/auth/start   {name, phone}       -> {otp: true} or {otp: false, token, customer}
// POST   /api/auth/verify  {phone, code}       -> {token, customer}
// GET    /api/auth/me                          -> {customer}
// PATCH  /api/auth/me      {name}              -> {customer}
// DELETE /api/auth/me                          -> {ok}   (deletes the account)
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

const CODE_TTL_MS = 5 * 60 * 1000, MAX_TRIES = 5, RESEND_MS = 30 * 1000;
const clean = (v, max) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

/** Sri Lankan mobile in any common form -> +947XXXXXXXX, or ''. */
export function normalisePhone(v) {
  const m = String(v || '').replace(/\D/g, '').match(/^(?:0094|94|0)?(7\d{8})$/);
  return m ? '+94' + m[1] : '';
}

export async function createCustomers({ dataDir }) {
  const file = path.join(dataDir, 'customers.json');
  let list = [];
  try { list = JSON.parse(await fs.readFile(file, 'utf8')); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  let saving = Promise.resolve();
  const save = () => (saving = saving.then(async () => {
    await fs.mkdir(dataDir, { recursive: true });
    const t = file + '.tmp';
    await fs.writeFile(t, JSON.stringify(list, null, 2));
    await fs.rename(t, file);
  }));

  // Token signing key: AUTH_SECRET if set, else one generated once and kept beside the data.
  let secret = process.env.AUTH_SECRET;
  if (!secret) {
    const keyFile = path.join(dataDir, 'auth-secret');
    try { secret = (await fs.readFile(keyFile, 'utf8')).trim(); } catch {
      secret = crypto.randomBytes(32).toString('hex');
      await fs.mkdir(dataDir, { recursive: true });
      await fs.writeFile(keyFile, secret, { mode: 0o600 });
    }
  }
  const sign = id => { const p = Buffer.from(JSON.stringify({ c: id, t: Date.now() })).toString('base64url'); return 'c1.' + p + '.' + crypto.createHmac('sha256', secret).update(p).digest('base64url'); };
  const read = token => {
    const [v, p, s] = String(token || '').split('.');
    if (v !== 'c1' || !p || !s) return null;
    const want = crypto.createHmac('sha256', secret).update(p).digest('base64url');
    if (s.length !== want.length || !crypto.timingSafeEqual(Buffer.from(s), Buffer.from(want))) return null;
    try { return list.find(c => c.id === JSON.parse(Buffer.from(p, 'base64url').toString()).c) || null; } catch { return null; }
  };
  const who = req => read((req.get('authorization') || '').replace(/^Bearer\s+/i, ''));
  const view = c => ({ id: c.id, name: c.name, phone: c.phone, verified: !!c.verifiedAt, createdAt: c.createdAt });

  const E = process.env;
  const provider = () => (E.SMS_PROVIDER || (E.TEXTLK_API_KEY ? 'textlk' : E.NOTIFYLK_API_KEY ? 'notifylk' : '')).toLowerCase();
  const smsReady = () => (provider() === 'textlk' ? !!(E.TEXTLK_API_KEY && E.TEXTLK_SENDER_ID) : provider() === 'notifylk' ? !!(E.NOTIFYLK_USER_ID && E.NOTIFYLK_API_KEY && E.NOTIFYLK_SENDER_ID) : false);
  const reviewCode = phone => (E.REVIEW_LOGINS || '').split(',').map(x => x.trim().split(':')).find(([p]) => normalisePhone(p) === phone)?.[1];
  async function sendSms(phone, message) {
    const to = phone.replace(/^\+/, '');
    let res;
    if (provider() === 'textlk') {
      res = await fetch('https://app.text.lk/api/v3/sms/send', {
        method: 'POST',
        headers: { Authorization: `Bearer ${E.TEXTLK_API_KEY}`, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ recipient: to, sender_id: E.TEXTLK_SENDER_ID, type: 'plain', message }),
      });
    } else {
      res = await fetch('https://app.notify.lk/api/v1/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ user_id: E.NOTIFYLK_USER_ID, api_key: E.NOTIFYLK_API_KEY, sender_id: E.NOTIFYLK_SENDER_ID, to, message }).toString(),
      });
    }
    const out = await res.json().catch(() => ({}));
    if (!res.ok || (out.status && out.status !== 'success')) {
      console.error(`SMS via ${provider()} failed (${res.status})`);
      throw new Error('Could not send the code. Please try again.');
    }
  }

  const pending = new Map(); // phone -> {name, hash, expires, tries, sentAt}
  const hits = new Map();
  const limited = (key, n, ms) => { const now = Date.now(), r = (hits.get(key) || []).filter(t => now - t < ms); r.push(now); hits.set(key, r); if (hits.size > 5000) hits.clear(); return r.length > n; };
  const hash = code => crypto.createHash('sha256').update(secret + code).digest('hex');

  function upsert(phone, name, verified) {
    let c = list.find(x => x.phone === phone);
    if (!c) { c = { id: crypto.randomUUID(), phone, name, createdAt: new Date().toISOString() }; list.push(c); }
    if (name) c.name = name;
    if (verified) c.verifiedAt = new Date().toISOString();
    c.lastSignInAt = new Date().toISOString();
    return c;
  }

  function mount(app) {
    app.post('/api/auth/start', async (req, res) => {
      const name = clean(req.body?.name, 60), phone = normalisePhone(req.body?.phone);
      if (!name) return res.status(400).json({ error: 'Enter your name.' });
      if (!phone) return res.status(400).json({ error: 'Enter a Sri Lankan mobile number, like 077 123 4567.' });
      if (limited('ip:' + req.ip, 20, 3600e3) || limited('ph:' + phone, 5, 3600e3)) return res.status(429).json({ error: 'Too many tries. Please wait a few minutes.' });
      const review = reviewCode(phone);
      if (review) {
        pending.set(phone, { name, hash: hash(review), expires: Date.now() + CODE_TTL_MS, tries: 0, sentAt: Date.now() });
        return res.json({ otp: true, resendIn: 30 });
      }
      if (!smsReady()) {
        const c = upsert(phone, name, false);
        try { await save(); } catch { return res.status(500).json({ error: 'Could not sign you in. Please try again.' }); }
        return res.json({ otp: false, token: sign(c.id), customer: view(c) });
      }
      const prev = pending.get(phone);
      if (prev && Date.now() - prev.sentAt < RESEND_MS) return res.json({ otp: true, resendIn: Math.ceil((RESEND_MS - (Date.now() - prev.sentAt)) / 1000) });
      const code = String(crypto.randomInt(0, 1e6)).padStart(6, '0');
      try { await sendSms(phone, `${code} is your Punchbook code. It expires in 5 minutes.`); }
      catch (e) { return res.status(502).json({ error: e.message }); }
      pending.set(phone, { name, hash: hash(code), expires: Date.now() + CODE_TTL_MS, tries: 0, sentAt: Date.now() });
      res.json({ otp: true, resendIn: RESEND_MS / 1000 });
    });

    app.post('/api/auth/verify', async (req, res) => {
      const phone = normalisePhone(req.body?.phone), code = String(req.body?.code || '').replace(/\D/g, '');
      const p = pending.get(phone);
      if (!p || Date.now() > p.expires) return res.status(400).json({ error: 'That code has expired. Send a new one.' });
      if (++p.tries > MAX_TRIES) { pending.delete(phone); return res.status(429).json({ error: 'Too many wrong codes. Send a new one.' }); }
      const a = Buffer.from(hash(code)), b = Buffer.from(p.hash);
      if (code.length !== 6 || !crypto.timingSafeEqual(a, b)) return res.status(400).json({ error: 'That code isn’t right. Check the SMS and try again.' });
      pending.delete(phone);
      const c = upsert(phone, p.name, true);
      try { await save(); } catch { return res.status(500).json({ error: 'Could not sign you in. Please try again.' }); }
      res.json({ token: sign(c.id), customer: view(c) });
    });

    app.get('/api/auth/me', (req, res) => { const c = who(req); if (!c) return res.status(401).json({ error: 'Please sign in.' }); res.json({ customer: view(c) }); });

    app.patch('/api/auth/me', async (req, res) => {
      const c = who(req); if (!c) return res.status(401).json({ error: 'Please sign in.' });
      const name = clean(req.body?.name, 60); if (!name) return res.status(400).json({ error: 'Enter your name.' });
      c.name = name;
      try { await save(); } catch { return res.status(500).json({ error: 'Could not save. Please try again.' }); }
      res.json({ customer: view(c) });
    });

    app.delete('/api/auth/me', async (req, res) => {
      const c = who(req); if (!c) return res.status(401).json({ error: 'Please sign in.' });
      list = list.filter(x => x.id !== c.id);
      try { await save(); } catch { return res.status(500).json({ error: 'Could not delete. Please try again.' }); }
      res.json({ ok: true });
    });
  }

  return { mount };
}
