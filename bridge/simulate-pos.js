// Pretends to be a POS so the Punchbook side can be tested without SambaPOS.
// Every few seconds it fetches paid orders, "prints" each as a kitchen ticket,
// then marks it ready after READY_AFTER seconds, like staff pressing "Ready".
// Run: npm run simulate   (needs PUNCHBOOK_URL and PUNCHBOOK_BRIDGE_KEY in .env)
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createPunchbookClient} from './punchbook-client.js';

const here = path.dirname(fileURLToPath(import.meta.url));
try { process.loadEnvFile(path.join(here, '.env')); } catch (e) { if (e.code !== 'ENOENT') throw e; }

const POLL_MS = 3000, READY_AFTER = Number(process.env.SIMULATE_READY_AFTER) || 20;
const punchbook = createPunchbookClient({url: process.env.PUNCHBOOK_URL, key: process.env.PUNCHBOOK_BRIDGE_KEY, pos: 'simulator'});
const kitchen = new Map(); // order id -> ready time
let ticketNumber = 100;

const log = msg => console.log(`[${new Date().toLocaleTimeString()}] ${msg}`);

async function tick() {
  for (const o of await punchbook.pendingOrders()) {
    const number = String(++ticketNumber);
    log(`New ${o.type} order ${o.id} for ${o.customer.name || 'guest'}${o.table ? ` (table ${o.table})` : ''} → kitchen ticket #${number}`);
    for (const i of o.items) log(`    ${i.qty} × ${i.name}`);
    if (o.note) log(`    Note: ${o.note}`);
    await punchbook.ack(o.id, {ticketId: `SIM-${number}`, ticketNumber: number});
    kitchen.set(o.id, Date.now() + READY_AFTER * 1000);
  }
  for (const [id, readyAt] of kitchen) {
    if (Date.now() < readyAt) continue;
    kitchen.delete(id);
    await punchbook.setStatus(id, 'ready').then(() => log(`Kitchen pressed Ready for ${id}`), e => log(`Could not mark ${id} ready: ${e.message}`));
  }
}

const me = await punchbook.ping();
log(`Connected to Punchbook as ${me.restaurant.name}. Orders are marked ready ${READY_AFTER}s after printing. Ctrl+C to stop.`);
for (;;) {
  await tick().catch(e => log(`Error: ${e.message}`));
  await new Promise(r => setTimeout(r, POLL_MS));
}
