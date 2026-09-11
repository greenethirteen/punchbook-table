import express from 'express';
import crypto from 'crypto';
import QRCode from 'qrcode';

const app = express();
app.use(express.json());
app.get('/table-demo-qr.svg', async (req,res)=>{
  const base=process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`;
  const svg=await QRCode.toString(`${base}/peppermint/t/12`,{type:'svg',margin:1,color:{dark:'#244633',light:'#ffffff'}});
  res.type('svg').send(svg);
});
app.use(express.static('public'));

const PORT = process.env.PORT || 3000;
const BASE = process.env.PUBLIC_BASE_URL || `http://localhost:${PORT}`;
const orders = [];

const menu = [
  { id:'m1', category:'Popular', name:'Truffle Chicken Pasta', desc:'Creamy parmesan sauce, mushrooms, grilled chicken.', price:2350, emoji:'🍝' },
  { id:'m2', category:'Popular', name:'Pepper Beef Rice', desc:'Wok-seared beef, black pepper glaze and steamed rice.', price:1980, emoji:'🍛' },
  { id:'m3', category:'Mains', name:'Crispy Chicken Burger', desc:'Buttermilk chicken, slaw, pickles and house sauce.', price:1750, emoji:'🍔' },
  { id:'m4', category:'Mains', name:'Pesto Penne', desc:'Basil pesto, cherry tomato and parmesan.', price:1650, emoji:'🥗' },
  { id:'m5', category:'Drinks', name:'Passion Fruit Mojito', desc:'Passion fruit, lime, mint and soda.', price:790, emoji:'🍹' },
  { id:'m6', category:'Drinks', name:'Iced Spanish Latte', desc:'Double espresso, milk and condensed milk.', price:890, emoji:'🥤' },
  { id:'m7', category:'Dessert', name:'Chocolate Lava Cake', desc:'Warm chocolate centre with vanilla ice cream.', price:1100, emoji:'🍰' },
];

function orderId(){ return 'PB-' + Date.now().toString(36).toUpperCase().slice(-6); }
function getEnv(name){ return process.env[name] || ''; }

app.get('/api/menu', (_req,res)=>res.json({ restaurant:{name:'Peppermint Café', area:'Colombo 03'}, menu }));
app.get('/api/orders', (_req,res)=>res.json([...orders].reverse()));

app.post('/api/orders', (req,res)=>{
  const { table='12', items=[], customer={}, paymentMethod='card' } = req.body || {};
  const detailed = items.map(i => {
    const product = menu.find(m=>m.id===i.id);
    return product ? {...product, qty: Math.max(1, Number(i.qty)||1)} : null;
  }).filter(Boolean);
  if (!detailed.length) return res.status(400).json({error:'Cart is empty'});
  const subtotal = detailed.reduce((s,i)=>s+i.price*i.qty,0);
  const service = Math.round(subtotal*0.05);
  const total = subtotal + service;
  const order = { id:orderId(), table:String(table), items:detailed, subtotal, service, total, customer, paymentMethod, paymentStatus:'pending', orderStatus:'new', createdAt:new Date().toISOString() };
  orders.push(order);
  res.json(order);
});

app.post('/api/orders/:id/status', (req,res)=>{
  const o=orders.find(x=>x.id===req.params.id);
  if(!o) return res.status(404).json({error:'Order not found'});
  if(req.body.orderStatus) o.orderStatus=req.body.orderStatus;
  res.json(o);
});

app.post('/api/payments/justpay/simulate', async (req,res)=>{
  const o=orders.find(x=>x.id===req.body.orderId);
  if(!o) return res.status(404).json({error:'Order not found'});
  o.paymentMethod='justpay';
  o.paymentStatus='paid';
  o.paymentRef='JP-DEMO-'+crypto.randomBytes(3).toString('hex').toUpperCase();
  res.json({ok:true, order:o, simulated:true});
});

app.post('/api/payments/card', async (req,res)=>{
  const o=orders.find(x=>x.id===req.body.orderId);
  if(!o) return res.status(404).json({error:'Order not found'});
  const simulate = String(getEnv('SIMULATE_CARD') || 'true').toLowerCase() !== 'false';
  const appId=getEnv('ONEPAY_APP_ID'), salt=getEnv('ONEPAY_HASH_SALT');
  if(simulate || !appId || !salt){
    o.paymentMethod='card'; o.paymentStatus='paid';
    o.paymentRef='CARD-DEMO-'+crypto.randomBytes(3).toString('hex').toUpperCase();
    return res.json({ok:true, simulated:true, order:o});
  }

  const amount = Number(o.total).toFixed(2);
  const currency='LKR';
  const hash=crypto.createHash('sha256').update(appId+currency+amount+salt).digest('hex');
  const customer=o.customer || {};
  const payload={
    app_id:appId,
    amount:Number(amount),
    currency,
    hash,
    reference:o.id,
    customer_first_name:customer.firstName || 'Punchbook',
    customer_last_name:customer.lastName || 'Guest',
    customer_phone_number:customer.phone || '+94770000000',
    customer_email:customer.email || 'demo@punchbook.lk',
    transaction_redirect_url:`${BASE}/payment-return.html?order=${encodeURIComponent(o.id)}`,
    additionalData:JSON.stringify({orderId:o.id,table:o.table})
  };
  try{
    const response=await fetch(`${getEnv('ONEPAY_API_BASE')||'https://api.onepay.lk'}/v3/checkout/link/`,{
      method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload)
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok) return res.status(502).json({error:'OnePay rejected checkout creation',provider:data});
    const redirectUrl=data?.data?.redirect_url || data?.redirect_url || data?.data?.gateway_url || data?.gateway_url;
    const txId=data?.data?.ipg_transaction_id || data?.ipg_transaction_id || data?.transaction_id;
    if(txId) o.providerTransactionId=txId;
    o.paymentMethod='card';
    res.json({ok:true, simulated:false, redirectUrl, provider:data, order:o});
  }catch(err){
    res.status(502).json({error:'Could not reach OnePay',detail:String(err.message||err)});
  }
});

app.post('/api/payments/verify', async (req,res)=>{
  const o=orders.find(x=>x.id===req.body.orderId);
  if(!o) return res.status(404).json({error:'Order not found'});
  if(!o.providerTransactionId || !getEnv('ONEPAY_APP_ID')) return res.json({ok:o.paymentStatus==='paid',order:o,simulated:true});
  try{
    const response=await fetch(`${getEnv('ONEPAY_API_BASE')||'https://api.onepay.lk'}/v3/transaction/status/`,{
      method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({app_id:getEnv('ONEPAY_APP_ID'),onepay_transaction_id:o.providerTransactionId})
    });
    const data=await response.json();
    const success=Boolean(data?.status===true || data?.data?.status===true);
    if(success) o.paymentStatus='paid';
    res.json({ok:success,order:o,provider:data});
  }catch(err){res.status(502).json({error:String(err.message||err)});}
});

app.get('/qr', async (req,res)=>{
  const table=String(req.query.table||'12');
  const url=`${BASE}/peppermint/t/${encodeURIComponent(table)}`;
  const svg=await QRCode.toString(url,{type:'svg',margin:2,width:440});
  res.type('html').send(`<!doctype html><html><head><meta name="viewport" content="width=device-width"><style>body{font-family:Inter,system-ui;background:#f6f3ec;display:grid;place-items:center;min-height:100vh;margin:0}.card{background:white;padding:38px;border-radius:28px;box-shadow:0 14px 60px #0001;text-align:center;max-width:430px}.brand{font-weight:900;font-size:28px}.table{font-size:18px;margin:8px 0 24px;color:#666}.hint{color:#777}svg{max-width:100%;height:auto}</style></head><body><div class="card"><div class="brand">Peppermint Café</div><div class="table">Table ${table}</div>${svg}<h2>Scan to order</h2><div class="hint">No app needed · Powered by Punchbook</div></div></body></html>`);
});

app.get(['/peppermint', '/peppermint/t/:table', '/r/:restaurant/t/:table'], (_req,res)=>res.sendFile(process.cwd()+'/public/peppermint.html'));
app.get('/admin', (_req,res)=>res.sendFile(process.cwd()+'/public/admin.html'));

app.listen(PORT,()=>console.log(`Punchbook prototype running at ${BASE}`));
