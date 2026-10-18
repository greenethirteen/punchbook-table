// Notifications that reach people when their screen is off or the page is closed.
// - Restaurants (/admin, /pickup-admin) and riders (/rider) subscribe with browser web push.
//   VAPID keys come from VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY, or are made once and kept in DATA_DIR/push.json.
// - The Punchbook Rider app (rider-app/) registers a Firebase (FCM) token for new-job alerts.
// - Customers' app phones register a Firebase (FCM) token per order. Sending needs
//   FIREBASE_SERVICE_ACCOUNT: the service account JSON from Firebase → Project settings → Service accounts.
// Rather than hooking every place an order changes, a short timer compares each order with what
// was last seen and notifies on the changes that matter.
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import webpush from 'web-push';

const SCAN_MS = 3000, TOKEN_LIMIT = 5;
const money = n => 'LKR ' + Number(n).toLocaleString('en-LK');

export async function createPush({orders, dataDir, staff, riderAuth}) {
  const file = path.join(dataDir, 'push.json');
  let state = {vapid: null, web: [], app: {}, riders: []};
  try { state = {...state, ...JSON.parse(await fs.readFile(file, 'utf8'))}; } catch (e) { if (e.code !== 'ENOENT') throw e; }
  const vapid = process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY
    ? {publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY}
    : (state.vapid ||= webpush.generateVAPIDKeys());
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:hello@punchbook.online', vapid.publicKey, vapid.privateKey);
  let dirty = !process.env.VAPID_PUBLIC_KEY;
  async function save() {
    if (!dirty) return;
    dirty = false;
    await fs.mkdir(dataDir, {recursive: true});
    await fs.writeFile(file + '.tmp', JSON.stringify(state));
    await fs.rename(file + '.tmp', file);
  }

  // ---- Browser web push (restaurants and riders)
  async function sendWeb(filter, payload) {
    const targets = state.web.filter(filter);
    await Promise.all(targets.map(s => webpush.sendNotification(s.subscription, JSON.stringify(payload), {TTL: 600, urgency: 'high'}).catch(e => {
      if (e.statusCode === 404 || e.statusCode === 410) { state.web = state.web.filter(x => x !== s); dirty = true; }
      else console.error('Web push failed:', e.statusCode || e.message);
    })));
  }

  // ---- Firebase Cloud Messaging (customer app)
  let fcmAuth = null;
  function serviceAccount() {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!raw) return null;
    try { return JSON.parse(raw.trim().startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8')); }
    catch { console.error('FIREBASE_SERVICE_ACCOUNT is not valid JSON.'); return null; }
  }
  async function fcmToken(sa) {
    if (fcmAuth && fcmAuth.expires > Date.now() + 60000) return fcmAuth.token;
    const now = Math.floor(Date.now() / 1000), b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
    const unsigned = `${b64({alg: 'RS256', typ: 'JWT'})}.${b64({iss: sa.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600})}`;
    const jwt = `${unsigned}.${crypto.createSign('RSA-SHA256').update(unsigned).sign(sa.private_key).toString('base64url')}`;
    const res = await fetch('https://oauth2.googleapis.com/token', {method: 'POST', headers: {'Content-Type': 'application/x-www-form-urlencoded'}, body: new URLSearchParams({grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt})});
    const data = await res.json();
    if (!res.ok) throw new Error(data.error_description || 'Google sign-in failed');
    fcmAuth = {token: data.access_token, expires: Date.now() + data.expires_in * 1000};
    return fcmAuth.token;
  }
  /** Sends to each token; calls drop(token) for tokens Firebase says are no longer valid. */
  async function sendFcm(tokens, {title, body, data, channel, tag}, drop) {
    const sa = serviceAccount();
    if (!tokens.length || !sa) return;
    try {
      const auth = await fcmToken(sa);
      await Promise.all(tokens.map(async token => {
        const res = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
          method: 'POST', headers: {Authorization: `Bearer ${auth}`, 'Content-Type': 'application/json'},
          body: JSON.stringify({message: {token, notification: {title, body}, data, android: {priority: 'high', notification: {channel_id: channel, tag}}}}),
        });
        if (res.status === 404 || res.status === 400) { drop(token); dirty = true; }
        else if (!res.ok) console.error('FCM send failed:', res.status, (await res.text()).slice(0, 200));
      }));
    } catch (e) { console.error('FCM failed:', e.message); }
  }
  async function sendApp(order, title, body) {
    await sendFcm(state.app[order.id] || [], {title, body, data: {orderId: order.id}, channel: 'orders', tag: order.id},
      token => { state.app[order.id] = (state.app[order.id] || []).filter(t => t !== token); });
  }

  // ---- What changed since the last scan
  const snapshot = o => [o.paymentStatus, o.orderStatus, o.kitchenReadyAt ? 'k' : ''].join('|');
  const last = new Map(orders.map(o => [o.id, snapshot(o)]));
  function customerMessage(o, before) {
    const delivery = o.fulfilment === 'delivery', [, prevStatus] = (before || '').split('|');
    if (o.orderStatus === prevStatus) return null;
    if (o.orderStatus === 'preparing') return [`${o.restaurantName} is making your order`, delivery ? 'We’ll tell you when it’s on the way.' : 'We’ll tell you when it’s ready.'];
    if (o.orderStatus === 'ready') return delivery ? ['Your order is on the way 🛵', `The rider has left ${o.restaurantName}.`] : ['Your order is ready! 🛍', `Show ${o.id} at the counter at ${o.restaurantName}.`];
    if (o.orderStatus === 'collected' && delivery) return ['Delivered — enjoy! 🍽', `Thanks for ordering from ${o.restaurantName}.`];
    if (o.orderStatus === 'cancelled') return [`${o.restaurantName} cancelled your order`, o.paymentStatus === 'refunded' ? 'You’ve been refunded in full.' : 'Your refund is on its way.'];
    return null;
  }
  async function scan() {
    for (const o of orders) {
      const now = snapshot(o), before = last.get(o.id);
      if (now === before) continue;
      last.set(o.id, now);
      const becamePaid = o.paymentStatus === 'paid' && (!before || !before.startsWith('paid|'));
      if (becamePaid && o.orderStatus === 'new') {
        const who = o.orderType === 'pickup' ? `${o.fulfilment === 'delivery' ? 'Delivery' : 'Pickup'} · ${o.customer?.name || 'Guest'}` : `Table ${o.table}`;
        await sendWeb(s => s.role === 'restaurant' && (!s.restaurantId || s.restaurantId === o.restaurantId),
          {title: `New order · ${o.restaurantName || ''}`, body: `${who} · ${money(o.total)}`, url: '/admin', tag: o.id});
        if (o.fulfilment === 'delivery') {
          const job = {title: 'New delivery job 🛵', body: `${o.restaurantName} → ${o.customer?.address?.line || 'customer'} · fee ${money(o.deliveryFee || 0)}`};
          await sendWeb(s => s.role === 'rider', {...job, url: '/rider', tag: 'job-' + o.id});
          await sendFcm(state.riders, {...job, data: {orderId: o.id}, channel: 'jobs', tag: 'job-' + o.id}, token => { state.riders = state.riders.filter(t => t !== token); });
        }
      }
      if (o.orderType === 'pickup' && before) {
        const msg = customerMessage(o, before);
        if (msg) await sendApp(o, ...msg);
      }
    }
    await save().catch(e => console.error('Could not save push state:', e.message));
  }
  setInterval(() => scan().catch(e => console.error('Push scan failed:', e.message)), SCAN_MS).unref();

  function mount(app) {
    app.get('/api/push/key', (_req, res) => res.json({publicKey: vapid.publicKey}));

    const validSub = s => s && typeof s.endpoint === 'string' && s.endpoint.startsWith('https://') && s.keys?.p256dh && s.keys?.auth;
    function subscribe(req, res, entry) {
      const sub = req.body?.subscription;
      if (!validSub(sub)) return res.status(400).json({error: 'Invalid subscription.'});
      state.web = state.web.filter(s => s.subscription.endpoint !== sub.endpoint);
      state.web.push({...entry, subscription: {endpoint: sub.endpoint, keys: {p256dh: sub.keys.p256dh, auth: sub.keys.auth}}, at: new Date().toISOString()});
      dirty = true;
      res.json({ok: true});
    }
    // Restaurant staff: a restaurant key gets its own orders, the admin key gets every restaurant's.
    app.post('/api/push/staff', staff.requireStaff, (req, res) => subscribe(req, res, {role: 'restaurant', restaurantId: req.staff.restaurantId || null}));
    app.post('/api/push/rider', riderAuth, (req, res) => subscribe(req, res, {role: 'rider'}));
    app.post('/api/push/unsubscribe', (req, res) => {
      const endpoint = req.body?.endpoint;
      state.web = state.web.filter(s => s.subscription.endpoint !== endpoint);
      dirty = true;
      res.json({ok: true});
    });

    // The Punchbook Rider app registers its phone for new-job alerts.
    app.post('/api/push/rider-app', riderAuth, (req, res) => {
      const token = String(req.body?.token || '').trim();
      if (!token || token.length > 4096) return res.status(400).json({error: 'Invalid token.'});
      state.riders = [...state.riders.filter(t => t !== token), token].slice(-200);
      dirty = true;
      res.json({ok: true});
    });

    // The customer app registers its phone for one order's updates.
    app.post('/api/pickup/orders/:id/push', (req, res) => {
      const o = orders.find(x => x.id === req.params.id && x.orderType === 'pickup');
      const token = String(req.body?.token || '').trim();
      if (!o) return res.status(404).json({error: 'Order not found.'});
      if (!token || token.length > 4096) return res.status(400).json({error: 'Invalid token.'});
      const list = (state.app[o.id] || []).filter(t => t !== token);
      state.app[o.id] = [...list, token].slice(-TOKEN_LIMIT);
      dirty = true;
      res.json({ok: true});
    });
  }

  // Forget tokens for orders that no longer exist.
  setInterval(() => {
    const ids = new Set(orders.map(o => o.id));
    for (const id of Object.keys(state.app)) if (!ids.has(id)) { delete state.app[id]; dirty = true; }
  }, 3600000).unref();

  return {mount, scan, appReady: () => Boolean(serviceAccount())};
}
