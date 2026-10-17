// Keeps the shared order list on disk (DATA_DIR/orders.json) so orders survive restarts.
// server.js and the POS bridges change orders in place, so instead of hooking every change
// we save a snapshot on a short timer whenever the list differs from what is on disk.
import fs from 'fs/promises';
import path from 'path';

export async function createOrderStore({orders, dataDir, intervalMs = 2000, keep = 5000}) {
  const file = path.join(dataDir, 'orders.json');
  try {
    const saved = JSON.parse(await fs.readFile(file, 'utf8'));
    if (Array.isArray(saved)) orders.push(...saved);
  } catch (e) {
    if (e.code !== 'ENOENT') {
      // Keep the unreadable file for inspection rather than overwriting it with an empty list.
      const aside = `${file}.unreadable-${Date.now()}`;
      await fs.rename(file, aside).catch(() => {});
      console.error(`Could not read saved orders (${e.message}). Moved it to ${aside}.`);
    }
  }

  let saved = JSON.stringify(orders), writing = null;
  async function write() {
    if (orders.length > keep) orders.splice(0, orders.length - keep);
    const json = JSON.stringify(orders);
    if (json === saved) return;
    try {
      await fs.mkdir(dataDir, {recursive: true});
      await fs.writeFile(file + '.tmp', json);
      await fs.rename(file + '.tmp', file);
      saved = json;
    } catch (e) {
      console.error('Could not save orders:', e.message);
    }
  }
  const flush = () => (writing ||= write().finally(() => { writing = null; }));
  setInterval(flush, intervalMs).unref();

  return {flush, count: () => orders.length};
}
