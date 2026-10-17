// Square POS bridge. Paid Punchbook orders are pushed into Square as PICKUP orders with an
// EXTERNAL payment (Punchbook already collected the money), so they show up in the Square
// Dashboard / POS. Fulfillment changes made in Square flow back via webhook or polling, and
// Punchbook status changes are pushed to Square. Works against the free Square Sandbox.
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';

const API_VERSION = '2025-01-23';
const SOURCE = 'Punchbook';
const STATES = ['PROPOSED', 'RESERVED', 'PREPARED', 'COMPLETED'];
const TO_SQUARE = {new: 'PROPOSED', preparing: 'RESERVED', ready: 'PREPARED', collected: 'COMPLETED', served: 'COMPLETED'};
const FROM_SQUARE = {
  pickup: {PROPOSED: 'new', RESERVED: 'preparing', PREPARED: 'ready', COMPLETED: 'collected'},
  table: {PROPOSED: 'new', RESERVED: 'preparing', PREPARED: 'preparing', COMPLETED: 'served'}
};
const PB_RANK = {pickup: ['new', 'preparing', 'ready', 'collected'], table: ['new', 'preparing', 'served']};

export function createSquareBridge({restaurants, orders, dataDir}) {
  const env = n => process.env[n] || '';
  const sandbox = () => (env('SQUARE_ENVIRONMENT') || 'sandbox').toLowerCase() !== 'production';
  const apiBase = () => env('SQUARE_API_BASE') || (sandbox() ? 'https://connect.squareupsandbox.com/v2' : 'https://connect.squareup.com/v2');
  const configured = () => Boolean(env('SQUARE_ACCESS_TOKEN'));
  const stateFile = path.join(dataDir, 'square.json');
  const log = [], inFlight = new Set();
  let locationCache = null, lastError = '', lastPollAt = null, stateCache = null;

  function record(message, orderId, level = 'info') {
    log.unshift({at: new Date().toISOString(), message, orderId: orderId || null, level});
    log.length = Math.min(log.length, 60);
    if (level === 'error') lastError = message;
  }

  async function readState() {
    if (stateCache) return stateCache;
    try { stateCache = JSON.parse(await fs.readFile(stateFile, 'utf8')); } catch { stateCache = {}; }
    stateCache.catalog ||= {};
    return stateCache;
  }
  async function writeState() {
    await fs.mkdir(dataDir, {recursive: true});
    await fs.writeFile(stateFile + '.tmp', JSON.stringify(stateCache, null, 2));
    await fs.rename(stateFile + '.tmp', stateFile);
  }

  async function api(method, endpoint, body) {
    const response = await fetch(apiBase() + endpoint, {
      method,
      headers: {'Authorization': `Bearer ${env('SQUARE_ACCESS_TOKEN')}`, 'Square-Version': API_VERSION, 'Content-Type': 'application/json'},
      body: body ? JSON.stringify(body) : undefined
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const e = data.errors?.[0];
      throw Error(e ? `${e.code}: ${e.detail || e.category}` : `Square returned HTTP ${response.status}`);
    }
    return data;
  }

  async function location() {
    if (locationCache) return locationCache;
    const id = env('SQUARE_LOCATION_ID');
    const loc = id ? (await api('GET', `/locations/${encodeURIComponent(id)}`)).location
      : (await api('GET', '/locations')).locations?.find(l => l.status === 'ACTIVE');
    if (!loc) throw Error('No active Square location found for this access token.');
    return locationCache = {id: loc.id, name: loc.name, currency: loc.currency, country: loc.country};
  }

  // Square won't take LKR, so prices are converted into the location's currency at a demo rate.
  function money(lkr, loc) {
    const rate = loc.currency === 'LKR' ? 1 : Number(env('SQUARE_LKR_PER_UNIT')) || 300;
    const decimals = ['JPY', 'KRW'].includes(loc.currency) ? 0 : 2;
    return {amount: Math.max(1, Math.round(lkr / rate * 10 ** decimals)), currency: loc.currency};
  }

  async function linkedRestaurant() {
    const id = (await readState()).restaurantId || env('SQUARE_RESTAURANT_ID') || 'peppermint';
    return restaurants.find(r => r.id === id) || restaurants[0];
  }
  const kind = o => o.orderType === 'pickup' ? 'pickup' : 'table';

  async function syncCatalog() {
    const r = await linkedRestaurant(), loc = await location(), state = await readState();
    const keyOf = m => `${r.id}:${m.id}`;
    const mappedIds = r.menu.map(m => state.catalog[keyOf(m)]?.itemId).filter(Boolean);
    const existing = {};
    if (mappedIds.length) {
      for (const obj of (await api('POST', '/catalog/batch-retrieve', {object_ids: mappedIds})).objects || []) {
        if (!obj.is_deleted) existing[obj.id] = obj;
      }
    }
    const objects = r.menu.map(m => {
      const mapped = state.catalog[keyOf(m)], item = mapped && existing[mapped.itemId];
      const variation = item?.item_data?.variations?.find(v => v.id === mapped.variationId);
      const itemId = item ? item.id : `#${m.id}`;
      return {
        type: 'ITEM', id: itemId, ...(item ? {version: item.version} : {}), present_at_all_locations: true,
        item_data: {
          name: m.name, description: m.desc,
          variations: [{
            type: 'ITEM_VARIATION', id: variation ? variation.id : `#${m.id}-regular`, ...(variation ? {version: variation.version} : {}),
            item_variation_data: {item_id: itemId, name: 'Regular', pricing_type: 'FIXED_PRICING', price_money: money(m.price, loc)}
          }]
        }
      };
    });
    const result = await api('POST', '/catalog/batch-upsert', {idempotency_key: crypto.randomUUID(), batches: [{objects}]});
    const ids = Object.fromEntries((result.id_mappings || []).map(x => [x.client_object_id, x.object_id]));
    for (const [i, m] of r.menu.entries()) {
      const obj = objects[i], variation = obj.item_data.variations[0];
      state.catalog[keyOf(m)] = {itemId: ids[obj.id] || obj.id, variationId: ids[variation.id] || variation.id};
    }
    await writeState();
    record(`Synced ${r.menu.length} ${r.name} menu items to the Square catalog`);
    return {count: r.menu.length};
  }

  function snapshot(o, squareOrder) {
    const f = squareOrder.fulfillments?.[0];
    o.pos = {
      ...o.pos, provider: 'square', status: 'synced', error: '', orderId: squareOrder.id, version: squareOrder.version,
      orderState: squareOrder.state, fulfillmentUid: f?.uid, state: f?.state, updatedAt: new Date().toISOString()
    };
  }

  // Apply a Square order's fulfillment state to its Punchbook order (forward only).
  function reconcile(squareOrder, via) {
    const o = orders.find(x => x.id === squareOrder.reference_id);
    if (!o || !o.pos?.orderId) return;
    const before = o.pos.state;
    snapshot(o, squareOrder);
    const next = FROM_SQUARE[kind(o)][o.pos.state], rank = PB_RANK[kind(o)];
    if (next && rank.indexOf(next) > rank.indexOf(o.orderStatus)) {
      o.orderStatus = next;
      record(`Square → Punchbook: ${o.id} is now "${next}" (${via})`, o.id);
    } else if (o.pos.state === 'CANCELED' && before !== 'CANCELED') {
      record(`Square cancelled ${o.id} (${via})`, o.id, 'error');
    }
  }

  async function pushOrder(o) {
    if (!configured() || o.paymentStatus !== 'paid' || o.pos?.orderId || inFlight.has(o.id)) return o;
    const r = await linkedRestaurant(), restaurantId = o.restaurantId || 'peppermint';
    if (restaurantId !== r.id) return o;
    inFlight.add(o.id);
    try {
      const loc = await location(), state = await readState();
      const pickup = kind(o) === 'pickup', phone = o.customer?.phone;
      const guest = o.customer?.name || [o.customer?.firstName, o.customer?.lastName].filter(Boolean).join(' ');
      const order = {
        location_id: loc.id, reference_id: o.id, source: {name: SOURCE},
        line_items: o.items.map(i => {
          const mapped = state.catalog[`${restaurantId}:${i.id}`];
          return mapped ? {catalog_object_id: mapped.variationId, quantity: String(i.qty)}
            : {name: i.name, quantity: String(i.qty), base_price_money: money(i.price, loc)};
        }),
        ...(o.service > 0 ? {service_charges: [{name: 'Service charge', amount_money: money(o.service, loc), calculation_phase: 'SUBTOTAL_PHASE'}]} : {}),
        fulfillments: [{
          type: 'PICKUP', state: 'PROPOSED',
          pickup_details: {
            recipient: {display_name: pickup ? guest || 'Guest' : `Table ${o.table} · ${guest || 'dine-in'}`, ...(phone ? {phone_number: phone} : {})},
            schedule_type: pickup && !o.asap ? 'SCHEDULED' : 'ASAP',
            pickup_at: o.pickupAt || new Date().toISOString(),
            note: [`Punchbook ${o.id}`, pickup ? 'Pickup' : `Table ${o.table}`, o.note].filter(Boolean).join(' · ').slice(0, 500)
          }
        }],
        metadata: {punchbook_order_id: o.id, punchbook_type: kind(o)}
      };
      const created = (await api('POST', '/orders', {idempotency_key: `pb-order-${o.id}`, order})).order;
      await api('POST', '/payments', {
        idempotency_key: `pb-pay-${o.id}`, source_id: 'EXTERNAL', amount_money: created.total_money, order_id: created.id,
        location_id: loc.id, reference_id: o.id, autocomplete: true, note: `Paid via Punchbook (${o.paymentMethod})`,
        external_details: {type: o.paymentMethod === 'justpay' ? 'BANK_TRANSFER' : 'CARD', source: SOURCE, ...(o.paymentRef ? {source_id: o.paymentRef} : {})}
      });
      snapshot(o, (await api('GET', `/orders/${created.id}`)).order);
      const total = created.total_money;
      record(`Punchbook → Square: ${o.id} created as ${created.id} and marked paid (${(total.amount / 100).toFixed(2)} ${total.currency})`, o.id);
      if (o.orderStatus !== 'new') await pushStatus(o);
    } catch (e) {
      o.pos = {...o.pos, provider: 'square', status: 'error', error: String(e.message || e)};
      record(`Could not send ${o.id} to Square: ${o.pos.error}`, o.id, 'error');
    } finally {
      inFlight.delete(o.id);
    }
    return o;
  }

  // Square fulfillments move one step at a time: PROPOSED → RESERVED → PREPARED → COMPLETED.
  async function advanceTo(squareOrderId, target) {
    const loc = await location();
    let order = (await api('GET', `/orders/${encodeURIComponent(squareOrderId)}`)).order;
    const f = order.fulfillments?.[0];
    if (!f) throw Error('Square order has no fulfillment.');
    for (let i = STATES.indexOf(f.state) + 1; i > 0 && i <= STATES.indexOf(target); i++) {
      order = (await api('PUT', `/orders/${order.id}`, {
        idempotency_key: crypto.randomUUID(),
        order: {location_id: loc.id, version: order.version, fulfillments: [{uid: f.uid, state: STATES[i]}]}
      })).order;
    }
    return order;
  }

  async function pushStatus(o) {
    if (!configured() || !o.pos?.orderId) return;
    const target = TO_SQUARE[o.orderStatus];
    if (!target || STATES.indexOf(target) <= STATES.indexOf(o.pos.state)) return;
    try {
      snapshot(o, await advanceTo(o.pos.orderId, target));
      record(`Punchbook → Square: ${o.id} fulfillment is now ${o.pos.state}`, o.id);
    } catch (e) {
      o.pos.error = String(e.message || e);
      record(`Could not update ${o.id} in Square: ${o.pos.error}`, o.id, 'error');
    }
  }

  // Polling fallback for when Square can't reach us with webhooks (e.g. localhost).
  async function poll() {
    if (!configured()) return;
    const open = orders.filter(o => o.pos?.orderId && !['COMPLETED', 'CANCELED'].includes(o.pos.state)).slice(-100);
    try {
      const loc = await location();
      if (open.length) {
        const result = await api('POST', '/orders/batch-retrieve', {location_id: loc.id, order_ids: open.map(o => o.pos.orderId)});
        for (const squareOrder of result.orders || []) reconcile(squareOrder, 'poll');
      }
      lastPollAt = new Date().toISOString();
    } catch (e) {
      record(`Square poll failed: ${e.message || e}`, null, 'error');
    }
  }
  setInterval(poll, 10000).unref();

  return {
    configured,
    async status() {
      const r = await linkedRestaurant(), state = await readState();
      const base = {
        configured: configured(), environment: sandbox() ? 'sandbox' : 'production', apiVersion: API_VERSION,
        restaurant: {id: r.id, name: r.name}, restaurants: restaurants.map(x => ({id: x.id, name: x.name})),
        catalogCount: r.menu.filter(m => state.catalog[`${r.id}:${m.id}`]).length, menuCount: r.menu.length,
        lkrPerUnit: Number(env('SQUARE_LKR_PER_UNIT')) || 300, webhook: Boolean(env('SQUARE_WEBHOOK_SIGNATURE_KEY')),
        lastPollAt, log
      };
      if (!configured()) return base;
      try { return {...base, location: await location(), lastError}; } catch (e) { return {...base, error: String(e.message || e)}; }
    },
    async link(restaurantId) {
      if (!restaurants.some(r => r.id === restaurantId)) throw Error('Unknown restaurant.');
      (await readState()).restaurantId = restaurantId;
      await writeState();
      record(`Linked the Square location to ${restaurants.find(r => r.id === restaurantId).name}`);
    },
    syncCatalog,
    pushOrder,
    // Fire-and-forget hooks called from the order routes.
    orderPaid(o) { pushOrder(o).catch(() => {}); },
    orderStatusChanged(o) { pushStatus(o).catch(() => {}); },
    async listSquareOrders() {
      const loc = await location();
      const result = await api('POST', '/orders/search', {
        location_ids: [loc.id], limit: 25,
        query: {filter: {source_filter: {source_names: [SOURCE]}, state_filter: {states: ['OPEN', 'COMPLETED', 'CANCELED']}}, sort: {sort_field: 'CREATED_AT', sort_order: 'DESC'}}
      });
      const list = result.orders || [];
      for (const squareOrder of list) reconcile(squareOrder, 'poll');
      return list.map(x => ({
        id: x.id, referenceId: x.reference_id, state: x.state, createdAt: x.created_at, total: x.total_money,
        fulfillment: x.fulfillments?.[0]?.state, recipient: x.fulfillments?.[0]?.pickup_details?.recipient?.display_name,
        items: (x.line_items || []).map(i => ({name: i.name, qty: i.quantity, catalog: Boolean(i.catalog_object_id)})),
        paid: (x.tenders || []).length > 0
      }));
    },
    // Moves a Square order one fulfillment step forward, as staff would on the POS.
    async advanceSquareOrder(squareOrderId) {
      const current = (await api('GET', `/orders/${encodeURIComponent(squareOrderId)}`)).order;
      const next = STATES[STATES.indexOf(current.fulfillments?.[0]?.state) + 1];
      if (!next) throw Error('This order has no further fulfillment step.');
      const order = await advanceTo(squareOrderId, next);
      record(`Square order ${squareOrderId} moved to ${next} (as staff on the POS)`, order.reference_id);
      reconcile(order, 'Square update');
      return order;
    },
    async webhook(req, notificationUrl) {
      const key = env('SQUARE_WEBHOOK_SIGNATURE_KEY');
      if (!key) return {status: 503, error: 'Set SQUARE_WEBHOOK_SIGNATURE_KEY to accept Square webhooks.'};
      const expected = crypto.createHmac('sha256', key).update(notificationUrl + (req.rawBody || '')).digest('base64');
      const a = Buffer.from(expected), b = Buffer.from(String(req.get('x-square-hmacsha256-signature') || ''));
      if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return {status: 401, error: 'Invalid Square signature.'};
      const event = req.body || {};
      if (String(event.type || '').startsWith('order.') && event.data?.id && configured()) {
        api('GET', `/orders/${encodeURIComponent(event.data.id)}`)
          .then(r => r.order?.source?.name === SOURCE && reconcile(r.order, `webhook ${event.type}`))
          .catch(e => record(`Webhook follow-up failed: ${e.message || e}`, null, 'error'));
      }
      return {status: 200};
    }
  };
}
