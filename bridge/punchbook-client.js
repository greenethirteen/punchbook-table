// Client for Punchbook's POS bridge API (pos-bridge.js in the main app).
export function createPunchbookClient({url, key, pos = 'sambapos', version = '0.1.0'}) {
  const missing = Object.entries({PUNCHBOOK_URL: url, PUNCHBOOK_BRIDGE_KEY: key}).filter(([, v]) => !v).map(([k]) => k);
  if (missing.length) throw Error(`Missing settings in .env: ${missing.join(', ')}`);
  const base = url.replace(/\/+$/, '');

  async function call(method, path, body) {
    let res;
    try {
      res = await fetch(base + path, {
        method,
        headers: {'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json', 'X-Bridge-Pos': pos, 'X-Bridge-Version': version},
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(15000)
      });
    } catch (e) {
      throw Error(`Cannot reach Punchbook at ${base}: ${e.cause?.code || e.message}`);
    }
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) throw Error('Punchbook rejected the bridge key. Check PUNCHBOOK_BRIDGE_KEY.');
    if (!res.ok) throw Error(`Punchbook ${method} ${path} failed (HTTP ${res.status}): ${data.error || 'no details'}`);
    return data;
  }

  return {
    ping: () => call('GET', '/api/bridge/ping'),
    pendingOrders: () => call('GET', '/api/bridge/orders').then(d => d.orders),
    ack: (id, {ticketId, ticketNumber}) => call('POST', `/api/bridge/orders/${encodeURIComponent(id)}/ack`, {ticketId, ticketNumber}),
    fail: (id, error) => call('POST', `/api/bridge/orders/${encodeURIComponent(id)}/ack`, {error}),
    setStatus: (id, orderStatus) => call('POST', `/api/bridge/orders/${encodeURIComponent(id)}/status`, {orderStatus})
  };
}
