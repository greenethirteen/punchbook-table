// Pre-launch waitlist from the /negombo landing page: a phone or email plus the restaurant
// the person wants on Punchbook. Saved to DATA_DIR/waitlist.json.
// Public: POST /api/waitlist, GET /api/waitlist/top (counts only, never contacts).
// Admin: GET /api/waitlist, GET /api/waitlist.csv.
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

const clean = (v, max) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
// Same restaurant typed differently counts once: "Amra leaf ", "amra-leaf" -> "amra leaf".
const keyOf = name => name.toLowerCase().replace(/[^a-z0-9඀-෿஀-௿]+/g, ' ').trim();

/** Sri Lankan mobile in any common form -> +947XXXXXXXX, or '' if it isn't one. */
function phoneOf(v) {
  const d = String(v || '').replace(/\D/g, '');
  const m = d.match(/^(?:0094|94|0)?(7\d{8})$/);
  return m ? '+94' + m[1] : '';
}
const emailOf = v => (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) ? v.toLowerCase() : '');

export async function createWaitlist({ dataDir, staff }) {
  const file = path.join(dataDir, 'waitlist.json');
  let list = [];
  try { list = JSON.parse(await fs.readFile(file, 'utf8')); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  let saving = Promise.resolve();
  const save = () => (saving = saving.then(async () => {
    await fs.mkdir(dataDir, { recursive: true });
    const t = file + '.tmp';
    await fs.writeFile(t, JSON.stringify(list, null, 2));
    await fs.rename(t, file);
  }));

  // A few sign-ups per visitor per hour is plenty; stops a script filling the list.
  const hits = new Map();
  const limited = ip => {
    const now = Date.now(), recent = (hits.get(ip) || []).filter(t => now - t < 3600e3);
    recent.push(now); hits.set(ip, recent);
    if (hits.size > 5000) hits.clear();
    return recent.length > 8;
  };

  function top(n = 6) {
    const counts = new Map();
    for (const e of list) {
      const k = keyOf(e.restaurant); if (!k) continue;
      const c = counts.get(k) || { name: e.restaurant, votes: 0 };
      c.votes++; counts.set(k, c);
    }
    return [...counts.values()].sort((a, b) => b.votes - a.votes).slice(0, n);
  }

  function mount(app) {
    app.post('/api/waitlist', async (req, res) => {
      const b = req.body || {};
      if (clean(b.website, 50)) return res.json({ ok: true, position: list.length, top: top() }); // honeypot
      if (limited(req.ip)) return res.status(429).json({ error: 'Too many tries. Please wait a bit and try again.' });
      const restaurant = clean(b.restaurant, 80);
      const raw = clean(b.contact, 120), phone = phoneOf(raw), email = phone ? '' : emailOf(raw);
      if (!restaurant) return res.status(400).json({ error: 'Tell us which restaurant you want.' });
      if (!phone && !email) return res.status(400).json({ error: 'Enter a Sri Lankan mobile number or an email address.' });
      const contact = phone || email;
      const existing = list.find(e => e.contact === contact);
      if (existing) {
        existing.restaurant = restaurant; existing.updatedAt = new Date().toISOString();
        if (b.hassle) existing.hassle = clean(b.hassle, 40);
        if (b.orderBy) existing.orderBy = clean(b.orderBy, 40);
      } else {
        list.push({
          id: crypto.randomUUID(), contact, kind: phone ? 'phone' : 'email', restaurant,
          area: clean(b.area, 40) || 'Negombo', source: clean(b.source, 120),
          hassle: clean(b.hassle, 40), orderBy: clean(b.orderBy, 40),
          createdAt: new Date().toISOString(),
        });
      }
      try { await save(); } catch { return res.status(500).json({ error: 'Could not save. Please try again.' }); }
      res.json({ ok: true, position: existing ? list.indexOf(existing) + 1 : list.length, top: top() });
    });

    app.get('/api/waitlist/top', (_req, res) => res.set('Cache-Control', 'no-store').json({ total: list.length, top: top() }));

    app.get('/api/waitlist', staff.requireAdmin, (_req, res) =>
      res.json({ total: list.length, top: top(20), entries: [...list].reverse() }));

    app.get('/api/waitlist.csv', staff.requireAdmin, (_req, res) => {
      const cell = v => `"${String(v ?? '').replace(/"/g, '""').replace(/^([=+\-@])/, "'$1")}"`;
      const rows = [['Joined', 'Contact', 'Type', 'Restaurant', 'Pickup a hassle?', 'Orders by', 'Area', 'Source'],
        ...list.map(e => [e.createdAt, e.contact, e.kind, e.restaurant, e.hassle, e.orderBy, e.area, e.source])];
      res.set('Content-Disposition', 'attachment; filename="punchbook-waitlist.csv"')
        .type('text/csv').send(rows.map(r => r.map(cell).join(',')).join('\n'));
    });
  }

  return { mount };
}
