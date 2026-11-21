// Staff access for the restaurant screens (/restaurant, /admin, /pickup-admin, /hq, /owner-admin).
// PUNCHBOOK_ADMIN_KEY sees everything. RESTAURANT_KEYS=peppermint:<password>,amra:<password> gives each
// restaurant a login (username = the restaurant id, e.g. "amra") that only sees and changes its own
// orders and money. Until PUNCHBOOK_ADMIN_KEY is set the screens stay open (for testing) and say so in a banner.
//
// Signing in at /dashboard (POST /api/staff/login with username + password) returns a session token that
// pages send in the x-staff-key header. Tokens are signed with a secret derived from PUNCHBOOK_ADMIN_KEY,
// last 30 days, and stop working when that restaurant's password (or the admin key) changes. Username
// "admin" with the admin key signs in as the admin. The raw admin key is still accepted in the header, and
// a raw restaurant password too, but only when no other restaurant shares it.
import crypto from 'crypto';

const SESSION_DAYS = 30, MAX_FAILS = 10, FAIL_WINDOW_MS = 15 * 60000;
const same = (a, b) => {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};
const b64 = s => Buffer.from(s).toString('base64url');

export function createStaff({restaurants}) {
  const adminKey = () => process.env.PUNCHBOOK_ADMIN_KEY || '';
  const restaurantKeys = () => (process.env.RESTAURANT_KEYS || '').split(',').map(pair => {
    const i = pair.indexOf(':');
    return i > 0 ? [pair.slice(0, i).trim().toLowerCase(), pair.slice(i + 1).trim()] : [];
  }).filter(([id, key]) => id && key);

  // A token names who it is for and carries a fingerprint of their current password, so changing it signs them out.
  const secret = () => crypto.createHash('sha256').update('punchbook-session:' + adminKey()).digest();
  const fingerprint = pw => crypto.createHash('sha256').update(pw).digest('hex').slice(0, 16);
  const sign = body => crypto.createHmac('sha256', secret()).update(body).digest('base64url');
  function makeToken(who, password) {
    const body = b64(JSON.stringify({r: who, f: fingerprint(password), e: Date.now() + SESSION_DAYS * 864e5}));
    return `s1.${body}.${sign(body)}`;
  }
  function readToken(token) {
    const [v, body, sig] = token.split('.');
    if (v !== 's1' || !body || !sig || !same(sig, sign(body))) return null;
    let t; try { t = JSON.parse(Buffer.from(body, 'base64url').toString()); } catch { return null; }
    if (!(t.e > Date.now())) return null;
    if (t.r === 'admin') return same(t.f, fingerprint(adminKey())) ? {role: 'admin'} : null;
    const pw = restaurantKeys().find(([id]) => id === t.r)?.[1];
    return pw && same(t.f, fingerprint(pw)) ? {role: 'restaurant', restaurantId: t.r} : null;
  }

  /** {role:'admin'} or {role:'restaurant', restaurantId}, or null for a wrong or missing key. */
  function identify(req) {
    if (!adminKey()) return {role: 'admin', open: true};
    const supplied = req.get('x-staff-key') || req.get('x-admin-key') || '';
    if (!supplied) return null;
    if (supplied.startsWith('s1.')) return readToken(supplied);
    if (same(supplied, adminKey())) return {role: 'admin'};
    const matches = restaurantKeys().filter(([, key]) => same(supplied, key));
    return matches.length === 1 ? {role: 'restaurant', restaurantId: matches[0][0]} : null;
  }

  const requireStaff = (req, res, next) => {
    const who = identify(req);
    if (!who) return res.status(401).json({error: 'Please sign in.'});
    req.staff = who;
    next();
  };
  const requireAdmin = (req, res, next) => requireStaff(req, res, () =>
    req.staff.role === 'admin' ? next() : res.status(403).json({error: 'Only the Punchbook admin can do this.'}));

  /** Whether this staff member may see or change an order. */
  const canSee = (staff, order) => staff.role === 'admin' || staff.restaurantId === order.restaurantId;

  // Slows down password guessing: after 10 wrong tries from one address, wait 15 minutes.
  const fails = new Map();
  const tooMany = ip => { const f = fails.get(ip); return f && f.n >= MAX_FAILS && Date.now() - f.at < FAIL_WINDOW_MS; };
  const failed = ip => { const f = fails.get(ip); fails.set(ip, f && Date.now() - f.at < FAIL_WINDOW_MS ? {n: f.n + 1, at: f.at} : {n: 1, at: Date.now()}); };

  function mount(app) {
    app.get('/api/staff/me', requireStaff, (req, res) => {
      const r = restaurants.find(x => x.id === req.staff.restaurantId);
      res.json({...req.staff, restaurantName: r?.name || null, restaurantArea: r?.area || null,
        persistent: Boolean(process.env.DATA_DIR)});
    });

    app.post('/api/staff/login', (req, res) => {
      const ip = req.ip || '';
      if (tooMany(ip)) return res.status(429).json({error: 'Too many tries. Please wait 15 minutes and try again.'});
      const username = String(req.body?.username || '').trim().toLowerCase().slice(0, 60), password = String(req.body?.password || '').slice(0, 200);
      if (!adminKey()) return res.json({token: '', role: 'admin', open: true});
      if (username === 'admin' && password && same(password, adminKey())) return res.json({token: makeToken('admin', password), role: 'admin'});
      const pw = restaurantKeys().find(([id]) => id === username)?.[1];
      if (pw && password && same(password, pw)) {
        const r = restaurants.find(x => x.id === username);
        return res.json({token: makeToken(username, pw), role: 'restaurant', restaurantId: username, restaurantName: r?.name || username});
      }
      failed(ip);
      res.status(401).json({error: 'That username or password isn’t right.'});
    });
  }

  return {identify, requireStaff, requireAdmin, canSee, mount, isOpen: () => !adminKey()};
}
