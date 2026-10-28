import express from 'express';
import crypto from 'crypto';
import QRCode from 'qrcode';
import fs from 'fs/promises';
import path from 'path';
import {restaurants,peppermintMenu,amraMenu} from './restaurants.js';
import {createSquareBridge} from './pos-square.js';
import {createPosBridge} from './pos-bridge.js';
import {createOrderStore} from './order-store.js';
import {createRider} from './rider.js';
import {createAccounts} from './accounts.js';
import {createStaff} from './staff.js';
import {createPayments} from './payments.js';
import {createKitchen} from './kitchen.js';
import {createPush} from './push.js';

// Load .env locally when present; hosted env vars (e.g. Railway) are left untouched.
try{process.loadEnvFile?.()}catch(e){if(e.code!=='ENOENT')throw e}

const app = express();
// PayPlus posts its result as base64 text, so its notify route reads the raw body itself (payments.js).
const jsonBody=express.json({limit:'15mb',verify:(req,_res,buf)=>{req.rawBody=buf.toString('utf8')}});
app.use((req,res,next)=>req.path==='/api/payments/payplus/notify'?next():jsonBody(req,res,next));
app.get('/table-demo-qr.svg', async (req,res)=>{const svg=await QRCode.toString(`${publicBase(req)}/peppermint-pp/t/12`,{type:'svg',margin:1,color:{dark:'#244633',light:'#ffffff'}});res.type('svg').send(svg)});
function sendPage(res,name){res.set('Cache-Control','no-store');res.sendFile(process.cwd()+'/public/'+name)}
app.get('/',(_req,res)=>sendPage(res,'index.html'));
app.use(express.static('public',{etag:true,lastModified:true,setHeaders(res,filePath){res.set('Cache-Control',filePath.endsWith('.html')?'no-store':'no-cache, must-revalidate')}}));
const PORT=process.env.PORT||3000, BASE=process.env.PUBLIC_BASE_URL||`http://localhost:${PORT}`, orders=[];
const DATA_DIR=process.env.DATA_DIR||path.join(process.cwd(),'data'), COMPANIES_FILE=path.join(DATA_DIR,'companies.json');
const pos=createSquareBridge({restaurants,orders,dataDir:DATA_DIR});
const staff=createStaff({restaurants});
const payments=createPayments({orders,publicBase,onPaid:o=>pos.orderPaid(o)});
const kitchen=await createKitchen({orders,restaurants,dataDir:DATA_DIR,staff,payments,onStatus:o=>pos.orderStatusChanged(o)});
if(!process.env.DATA_DIR)console.warn('DATA_DIR is not set: orders, payouts and applications are saved inside the app folder and are lost on every deploy. Point DATA_DIR at a Railway volume.');
if(!process.env.PUNCHBOOK_ADMIN_KEY)console.warn('PUNCHBOOK_ADMIN_KEY is not set: the restaurant, rider and accounts screens are open to anyone with the link.');
if(!process.env.PAYMENTS_LK_SECRET_KEY)console.warn('PAYMENTS_LK_SECRET_KEY is not set: payments are simulated and orders are free.');
// Orders are kept in memory and saved to DATA_DIR/orders.json; local POS bridges (bridge/) use pos-bridge.js.
const orderStore=await createOrderStore({orders,dataDir:DATA_DIR}),posBridge=createPosBridge({orders,restaurants,staff});
const ALLOWED_DOC_TYPES=new Set(['application/pdf','image/jpeg','image/png']), MAX_DOC_BYTES=3*1024*1024, COMPANY_STATUSES=new Set(['submitted','under-review','ipg-submitted','approved','live','rejected']);
function publicBase(req){const local=h=>['localhost','127.0.0.1','[::1]'].includes(h),incoming=new URL(`http://${req.get('host')}`),configured=process.env.PUBLIC_BASE_URL;if(configured){try{const u=new URL(configured);if(['http:','https:'].includes(u.protocol)&&(!local(u.hostname)||local(incoming.hostname)))return u.origin}catch{}}return `${local(incoming.hostname)?req.protocol:'https'}://${incoming.host}`}
async function readCompanies(){try{return JSON.parse(await fs.readFile(COMPANIES_FILE,'utf8'))}catch(e){if(e.code==='ENOENT')return[];throw e}}
async function writeCompanies(c){await fs.mkdir(DATA_DIR,{recursive:true});const t=COMPANIES_FILE+'.tmp';await fs.writeFile(t,JSON.stringify(c,null,2));await fs.rename(t,COMPANIES_FILE)}
function cleanText(v,max=300){return String(v??'').trim().slice(0,max)}
function adminAllowed(req){const expected=process.env.PUNCHBOOK_ADMIN_KEY;if(!expected)return false;const supplied=req.get('x-admin-key')||req.query.key||'',a=Buffer.from(String(expected)),b=Buffer.from(String(supplied));return a.length===b.length&&crypto.timingSafeEqual(a,b)}
function requireAdmin(req,res,next){if(!process.env.PUNCHBOOK_ADMIN_KEY)return res.status(503).json({error:'Admin access is not configured. Set PUNCHBOOK_ADMIN_KEY on the server.'});if(!adminAllowed(req))return res.status(401).json({error:'Invalid admin key.'});next()}
function validateDocument(doc,label){if(!doc||typeof doc!=='object')return`${label} is required.`;const name=cleanText(doc.name,180),type=cleanText(doc.type,80),data=String(doc.data||'');if(!name||!data)return`${label} is required.`;if(!ALLOWED_DOC_TYPES.has(type))return`${label} must be PDF, JPG or PNG.`;if(Math.floor(data.length*3/4)>MAX_DOC_BYTES)return`${label} must be 3 MB or smaller.`;if(!/^[A-Za-z0-9+/=]+$/.test(data))return`${label} could not be read.`;return''}
function summariseCompany(c){const{documents,...safe}=c;return{...safe,documents:Object.fromEntries(Object.entries(documents||{}).map(([k,d])=>[k,{name:d.name,type:d.type,size:d.size}]))}}
function publicCompany(c){return{id:c.id,reference:c.reference,status:c.status,createdAt:c.createdAt,updatedAt:c.updatedAt,companyName:c.companyName,tradingName:c.tradingName,registrationNumber:c.registrationNumber,businessType:c.businessType,businessCategory:c.businessCategory,adminNotes:c.adminNotes||''}}
const menu=peppermintMenu;
// Random so order numbers can't be guessed; no look-alike characters (0/O, 1/I) for reading out at the counter.
function orderId(){const abc='23456789ABCDEFGHJKLMNPQRSTUVWXYZ';let id;do{id='PB-'+[...crypto.randomBytes(7)].map(b=>abc[b%32]).join('')}while(orders.some(o=>o.id===id));return id}function getEnv(n){return process.env[n]||''}
app.get('/api/menu',(q,r)=>q.query.restaurant==='amra'?r.json({restaurant:{name:'Amra Leaf',area:'Negombo · Chilaw Road'},menu:amraMenu}):r.json({restaurant:{name:'Peppermint Café',area:'Colombo 03'},menu}));
app.post('/api/orders',(req,res)=>{const{table='12',items=[],customer={},paymentMethod='card'}=req.body||{};const allMenu=[...menu,...amraMenu];const detailed=items.map(i=>{const p=allMenu.find(m=>m.id===i.id);return p?{...p,qty:Math.max(1,Number(i.qty)||1)}:null}).filter(Boolean);if(!detailed.length)return res.status(400).json({error:'Cart is empty'});const rid=detailed.every(i=>amraMenu.some(a=>a.id===i.id))?'amra':'peppermint';if(!kitchen.accepting(rid))return res.status(409).json({error:'The kitchen isn’t taking orders right now. Please ask a member of staff.'});const subtotal=detailed.reduce((s,i)=>s+i.price*i.qty,0),service=Math.round(subtotal*.05),total=subtotal+service,order={id:orderId(),restaurantId:rid,restaurantName:restaurants.find(x=>x.id===rid)?.name,table:String(table),items:detailed,subtotal,service,total,customer,paymentMethod,paymentStatus:'pending',orderStatus:'new',createdAt:new Date().toISOString()};orders.push(order);res.json(order)});
// Pickup ordering (Punchbook Pickup app). Orders share the in-memory list and payment endpoints above.
// Image paths starting with "/" stay relative; the app resolves them against its API base.
function pickupRestaurant(r,withMenu){const{menu,...info}=r;return{...info,accepting:kitchen.accepting(r.id),deliveryRadiusKm:DELIVERY_RADIUS_KM,itemCount:menu.length,...(withMenu?{menu}:{})}}
app.get('/api/pickup/restaurants',(_req,res)=>res.json({restaurants:restaurants.map(r=>pickupRestaurant(r,false))}));
app.get('/api/pickup/restaurants/:id',(req,res)=>{const r=restaurants.find(x=>x.id===req.params.id);if(!r)return res.status(404).json({error:'Restaurant not found.'});res.json({restaurant:pickupRestaurant(r,true)})});
const DELIVERY_FEE=250,DELIVERY_RADIUS_KM=Number(process.env.DELIVERY_RADIUS_KM)||10;
// Straight-line distance; roads add roughly a third, which the arrival estimate allows for.
function distanceKm(a,b){const rad=x=>x*Math.PI/180,dLat=rad(b.lat-a.lat),dLng=rad(b.lng-a.lng),h=Math.sin(dLat/2)**2+Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(dLng/2)**2;return 12742*Math.asin(Math.sqrt(h))}
const rideMinutes=km=>Math.ceil((10+km*1.35*3)/5)*5;
app.post('/api/pickup/orders',(req,res)=>{
  const b=req.body||{},r=restaurants.find(x=>x.id===b.restaurantId);if(!r)return res.status(400).json({error:'Choose a restaurant.'});
  if(!kitchen.accepting(r.id))return res.status(409).json({error:`${r.name} isn’t taking orders right now. Please try again later.`});
  const items=(Array.isArray(b.items)?b.items:[]).map(i=>{const m=r.menu.find(x=>x.id===i.id);return m?{id:m.id,name:m.name,price:m.price,qty:Math.min(50,Math.max(1,Math.floor(Number(i.qty))||1))}:null}).filter(Boolean);
  if(!items.length)return res.status(400).json({error:'Your bag is empty.'});
  const name=cleanText(b.customer?.name,80),phone=cleanText(b.customer?.phone,30);
  if(!name)return res.status(400).json({error:'Enter your name so the restaurant can call it out.'});
  if(phone.replace(/\D/g,'').length<9)return res.status(400).json({error:'Enter a valid mobile number.'});
  const a=b.customer?.address,lat=Number(a?.lat),lng=Number(a?.lng),address=a&&Math.abs(lat)<=90&&Math.abs(lng)<=180&&(lat||lng)?{line:cleanText(a.line,200),details:cleanText(a.details,160),lat,lng}:undefined;
  const delivery=b.fulfilment==='delivery',deliveryFee=delivery?DELIVERY_FEE:0;
  if(delivery&&!address)return res.status(400).json({error:'Add your delivery address.'});
  const km=delivery?distanceKm(r,address):0;
  if(delivery&&km>DELIVERY_RADIUS_KM)return res.status(400).json({error:`${r.name} delivers up to ${DELIVERY_RADIUS_KM} km away, and this address is about ${Math.round(km)} km. Choose pickup or another restaurant.`});
  const earliest=Date.now()+r.prepMinutes*60000,requested=b.pickupAt==='asap'?NaN:Date.parse(b.pickupAt);
  if(!Number.isNaN(requested)&&requested>Date.now()+24*3600000)return res.status(400).json({error:'Pickup must be within the next 24 hours.'});
  const pickupAt=new Date(Number.isNaN(requested)?earliest:Math.max(requested,earliest)).toISOString(),subtotal=items.reduce((s,i)=>s+i.price*i.qty,0);
  const order={id:orderId(),orderType:'pickup',fulfilment:delivery?'delivery':'pickup',deliveryFee,...(delivery?{distanceKm:Math.round(km*10)/10,deliverBy:new Date(Date.parse(pickupAt)+rideMinutes(km)*60000).toISOString()}:{}),restaurantId:r.id,restaurantName:r.name,restaurantArea:r.area,table:null,items,subtotal,service:0,total:subtotal+deliveryFee,customer:{name,phone,...(delivery?{address}:{})},note:cleanText(b.note,240),pickupAt,asap:b.pickupAt==='asap',paymentMethod:b.paymentMethod==='justpay'?'justpay':'card',paymentStatus:'pending',orderStatus:'new',createdAt:new Date().toISOString()};
  orders.push(order);res.status(201).json(order);
});
app.get('/api/pickup/orders/:id',(req,res)=>{const o=orders.find(x=>x.id===req.params.id&&x.orderType==='pickup');if(!o)return res.status(404).json({error:'Order not found.'});res.json(o)});
app.post('/api/companies',async(req,res)=>{try{const b=req.body||{},required=['companyName','registrationNumber','tradingName','businessType','registeredAddress','businessCategory','contactName','nicNumber','email','phone','contactRole','bankName','bankBranch','bankAccountName','bankAccountNumber'],missing=required.filter(k=>!cleanText(b[k]));if(missing.length)return res.status(400).json({error:`Missing required fields: ${missing.join(', ')}`});if(!b.declaration)return res.status(400).json({error:'Please accept the declaration.'});const errors=[validateDocument(b.documents?.businessRegistration,'Business registration certificate'),validateDocument(b.documents?.identityDocument,'NIC / passport'),validateDocument(b.documents?.bankProof,'Bank proof')].filter(Boolean);if(errors.length)return res.status(400).json({error:errors[0]});if(!/^\S+@\S+\.\S+$/.test(cleanText(b.email,180)))return res.status(400).json({error:'Enter a valid email address.'});const companies=await readCompanies(),now=new Date().toISOString(),reference='PBM-'+Date.now().toString(36).toUpperCase()+'-'+crypto.randomBytes(2).toString('hex').toUpperCase(),id=crypto.randomUUID(),documents={};for(const key of ['businessRegistration','identityDocument','bankProof']){const d=b.documents[key];documents[key]={name:cleanText(d.name,180),type:cleanText(d.type,80),size:Number(d.size)||0,data:String(d.data)}}const company={id,reference,status:'submitted',createdAt:now,updatedAt:now,companyName:cleanText(b.companyName,200),registrationNumber:cleanText(b.registrationNumber,100),tradingName:cleanText(b.tradingName,200),businessType:cleanText(b.businessType,100),registeredAddress:cleanText(b.registeredAddress,500),businessCategory:cleanText(b.businessCategory,120),contactName:cleanText(b.contactName,180),nicNumber:cleanText(b.nicNumber,100),email:cleanText(b.email,180),phone:cleanText(b.phone,80),contactRole:cleanText(b.contactRole,120),bankName:cleanText(b.bankName,120),bankBranch:cleanText(b.bankBranch,120),bankAccountName:cleanText(b.bankAccountName,180),bankAccountNumber:cleanText(b.bankAccountNumber,100),declaration:true,adminNotes:'',documents};companies.push(company);await writeCompanies(companies);res.status(201).json({ok:true,id,reference,status:company.status})}catch(e){console.error(e);res.status(500).json({error:'Could not save the application.'})}});
app.get('/api/admin/companies',requireAdmin,async(_q,res)=>{try{const companies=(await readCompanies()).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));res.json({companies:companies.map(summariseCompany)})}catch{res.status(500).json({error:'Could not load applications.'})}});
app.get('/api/admin/companies/:id',requireAdmin,async(req,res)=>{const c=(await readCompanies()).find(x=>x.id===req.params.id);if(!c)return res.status(404).json({error:'Company not found.'});res.json({company:summariseCompany(c)})});
app.patch('/api/admin/companies/:id/status',requireAdmin,async(req,res)=>{const status=cleanText(req.body?.status,40);if(!COMPANY_STATUSES.has(status))return res.status(400).json({error:'Invalid company status.'});const companies=await readCompanies(),c=companies.find(x=>x.id===req.params.id);if(!c)return res.status(404).json({error:'Company not found.'});c.status=status;c.adminNotes=cleanText(req.body?.adminNotes,3000);c.updatedAt=new Date().toISOString();await writeCompanies(companies);res.json({ok:true,company:summariseCompany(c)})});
// Payments.lk checkout, webhook and refunds. See payments.js.
payments.mount(app);
// Staff sign-in and restaurant order controls. See staff.js and kitchen.js.
staff.mount(app);kitchen.mount(app);
// Square POS bridge (console at /pos). See pos-square.js.
const posRoute=fn=>async(req,res)=>{try{res.json(await fn(req))}catch(e){res.status(502).json({error:String(e.message||e)})}};
const needSquare=(_req,res,next)=>pos.configured()?next():res.status(503).json({error:'Square is not configured. Set SQUARE_ACCESS_TOKEN and restart.'});
app.get('/api/pos/square/status',staff.requireAdmin,posRoute(()=>pos.status()));
app.post('/api/pos/square/link',staff.requireAdmin,posRoute(async req=>{await pos.link(cleanText(req.body?.restaurantId,40));return pos.status()}));
app.post('/api/pos/square/catalog/sync',staff.requireAdmin,needSquare,posRoute(()=>pos.syncCatalog()));
app.get('/api/pos/square/orders',staff.requireAdmin,needSquare,posRoute(async()=>({orders:await pos.listSquareOrders()})));
app.post('/api/pos/square/orders/:id/advance',staff.requireAdmin,needSquare,posRoute(async req=>({order:await pos.advanceSquareOrder(req.params.id)})));
app.post('/api/pos/square/push/:id',staff.requireAdmin,needSquare,async(req,res)=>{const o=orders.find(x=>x.id===req.params.id);if(!o)return res.status(404).json({error:'Order not found'});if(o.pos?.status==='error')o.pos={};await pos.pushOrder(o);o.pos?.orderId?res.json(o):res.status(400).json({error:o.pos?.error||(o.paymentStatus!=='paid'?'Only paid orders are sent to the POS.':'This order belongs to a restaurant that is not linked to Square.'),order:o})});
app.post('/api/pos/square/webhook',async(req,res)=>{const url=process.env.SQUARE_WEBHOOK_URL||`${publicBase(req)}/api/pos/square/webhook`,r=await pos.webhook(req,url);res.status(r.status).json(r.error?{error:r.error}:{ok:true})});
// Local POS bridges (e.g. SambaPOS via bridge/). See pos-bridge.js.
posBridge.mount(app);
// Delivery riders (page at /rider). See rider.js.
const rider=createRider({orders,restaurants,staff});rider.mount(app);
// Web push for restaurants and riders, Firebase for the customer app. See push.js.
(await createPush({orders,dataDir:DATA_DIR,staff,riderAuth:rider.auth})).mount(app);
// Daily restaurant payouts (page at /accounts). See accounts.js.
(await createAccounts({orders,restaurants,dataDir:DATA_DIR,staff})).mount(app);
app.get('/qr',async(req,res)=>{const table=String(req.query.table||'12'),url=`${publicBase(req)}/peppermint-pp/t/${encodeURIComponent(table)}`,svg=await QRCode.toString(url,{type:'svg',margin:2,width:440});res.type('html').send(`<!doctype html><html><head><meta name="viewport" content="width=device-width"><style>body{font-family:Inter,system-ui;background:#f6f3ec;display:grid;place-items:center;min-height:100vh;margin:0}.card{background:white;padding:38px;border-radius:28px;text-align:center;max-width:430px}svg{max-width:100%;height:auto}</style></head><body><div class="card"><h2>Peppermint Café</h2><p>Table ${table}</p>${svg}<h2>Scan to order</h2><p>No app needed · Powered by Punchbook</p></div></html>`)});
app.get('/api/public/companies',staff.requireAdmin,async(_q,res)=>{try{const companies=(await readCompanies()).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));res.json({companies:companies.map(publicCompany)})}catch{res.status(500).json({error:'Could not load applications.'})}});
app.get('/api/public/companies/:id',staff.requireAdmin,async(req,res)=>{const c=(await readCompanies()).find(x=>x.id===req.params.id);if(!c)return res.status(404).json({error:'Company not found.'});res.json({company:publicCompany(c)})});
app.patch('/api/public/companies/:id/status',staff.requireAdmin,async(req,res)=>{const status=cleanText(req.body?.status,40);if(!COMPANY_STATUSES.has(status))return res.status(400).json({error:'Invalid company status.'});const companies=await readCompanies(),c=companies.find(x=>x.id===req.params.id);if(!c)return res.status(404).json({error:'Company not found.'});c.status=status;c.adminNotes=cleanText(req.body?.adminNotes,3000);c.updatedAt=new Date().toISOString();await writeCompanies(companies);res.json({ok:true,company:publicCompany(c)})});
// Two Peppermint table menus: -pp pays through PayPlus, -ph through PayHere (public/app.js picks by path).
app.get(['/peppermint-pp','/peppermint-pp/t/:table','/peppermint-ph','/peppermint-ph/t/:table'],(_q,r)=>sendPage(r,'peppermint.html'));
// Older menu links and printed QR codes go to the PayPlus menu (v7 was the PayHere popup menu).
app.get(['/peppermint','/peppermint/t/:table','/r/:restaurant/t/:table','/peppermint-v:n','/peppermint-v:n/t/:table'],(q,r)=>r.redirect(302,`/peppermint-${q.params.n==='7'?'ph':'pp'}${q.params.table?'/t/'+encodeURIComponent(q.params.table):''}`));app.get(['/amraleaf-v3','/amraleaf-v3/t/:table'],(_q,r)=>sendPage(r,'amraleaf-v3.html'));app.get('/admin',(_q,r)=>sendPage(r,'admin.html'));app.get(['/about','/team'],(_q,r)=>sendPage(r,'about.html'));app.get(['/signup','/join','/onboarding'],(_q,r)=>sendPage(r,'onboarding.html'));app.get(['/admin/companies','/companies-admin'],(_q,r)=>sendPage(r,'companies-admin.html'));app.get('/pickup-admin',(_q,r)=>sendPage(r,'pickup-admin.html'));app.get('/owner-admin',(_q,r)=>sendPage(r,'owner-admin.html'));app.get('/pos',(_q,r)=>sendPage(r,'pos.html'));app.get('/rider',(_q,r)=>sendPage(r,'rider.html'));app.get('/onepay-test',(_q,r)=>sendPage(r,'onepay-test.html'));app.get('/accounts',(_q,r)=>sendPage(r,'accounts.html'));
app.listen(PORT,()=>console.log(`Punchbook prototype running at ${BASE} · ${orderStore.count()} saved orders loaded`));
for(const signal of ['SIGTERM','SIGINT'])process.once(signal,()=>orderStore.flush().then(orderStore.flush).finally(()=>process.exit(0)));