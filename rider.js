// Rider API for delivery orders (rider page at /rider). A paid delivery order is a job.
// A rider accepts it, either to ride it themselves or to book a courier (PickMe Flash) by hand,
// then marks it picked up and delivered. Progress is kept on order.dispatch and mirrored onto
// orderStatus so the customer's app and the admin board follow along.
// Set RIDER_KEY to require a shared access code on the rider page; empty leaves it open for testing.
import crypto from 'crypto';

const text = (v, max) => String(v ?? '').trim().slice(0, max);
const DONE_VISIBLE_MS = 12 * 3600000;
const METHODS = new Set(['own', 'pickme']);

export function createRider({orders, restaurants}) {
  function auth(req, res, next) {
    const key = process.env.RIDER_KEY || '';
    if (!key) return next();
    const supplied = Buffer.from(req.get('x-rider-key') || ''), expected = Buffer.from(key);
    if (supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected)) return next();
    res.status(401).json({error: 'Wrong rider access code.'});
  }

  const isJob = o => o.orderType === 'pickup' && o.fulfilment === 'delivery' && o.paymentStatus === 'paid';
  const visible = o => o.dispatch?.status !== 'delivered' || Date.now() - Date.parse(o.dispatch.deliveredAt) < DONE_VISIBLE_MS;

  // The shape the rider page sees.
  function job(o) {
    const r = restaurants.find(x => x.id === o.restaurantId);
    return {
      id: o.id,
      restaurant: {id: o.restaurantId, name: o.restaurantName, area: o.restaurantArea, ...(r?.phone ? {phone: r.phone} : {})},
      customer: o.customer,
      items: o.items.map(({name, qty}) => ({name, qty})),
      total: o.total,
      deliveryFee: o.deliveryFee || 0,
      note: o.note || '',
      readyAt: o.pickupAt,
      asap: o.asap,
      foodStatus: o.orderStatus,
      dispatch: o.dispatch || {status: 'open'},
      createdAt: o.createdAt,
    };
  }

  const find = (req, res) => {
    const o = orders.find(x => x.id === req.params.id && isJob(x));
    if (!o) res.status(404).json({error: 'Job not found.'});
    return o;
  };
  const sameRider = (o, phone) => o.dispatch?.rider?.phone && o.dispatch.rider.phone === phone;

  function mount(app) {
    app.get('/api/rider/jobs', auth, (_req, res) => {
      res.json({jobs: orders.filter(o => isJob(o) && visible(o)).reverse().map(job)});
    });

    app.post('/api/rider/jobs/:id/:action', auth, (req, res) => {
      const o = find(req, res);
      if (!o) return;
      const b = req.body || {}, now = new Date().toISOString();
      const rider = {name: text(b.rider?.name, 60), phone: text(b.rider?.phone, 30)};
      if (!rider.name || rider.phone.replace(/\D/g, '').length < 9) return res.status(400).json({error: 'Add your name and mobile number first.'});
      const d = o.dispatch;
      if (d?.status === 'delivered') return res.status(409).json({error: 'This order has already been delivered.', job: job(o)});
      if (d && !sameRider(o, rider.phone)) return res.status(409).json({error: `${d.rider.name} already took this job.`, job: job(o)});

      switch (req.params.action) {
        case 'accept': {
          const method = METHODS.has(b.method) ? b.method : 'own';
          o.dispatch = {...d, status: d?.status || 'assigned', method, rider, courierRef: text(b.courierRef, 60), assignedAt: d?.assignedAt || now};
          break;
        }
        case 'pickup':
          if (!d) return res.status(409).json({error: 'Accept the job first.'});
          o.dispatch = {...d, status: 'picked_up', pickedUpAt: now};
          // The customer's app shows "ready" as "On the way" for delivery orders.
          if (['new', 'preparing'].includes(o.orderStatus)) o.orderStatus = 'ready';
          break;
        case 'deliver':
          if (!d) return res.status(409).json({error: 'Accept the job first.'});
          o.dispatch = {...d, status: 'delivered', pickedUpAt: d.pickedUpAt || now, deliveredAt: now};
          o.orderStatus = 'collected';
          break;
        case 'release':
          if (d?.status === 'picked_up') return res.status(409).json({error: 'The food is already picked up. Mark it delivered instead.'});
          delete o.dispatch;
          break;
        default:
          return res.status(404).json({error: 'Unknown action.'});
      }
      res.json({job: job(o)});
    });
  }

  return {mount};
}
