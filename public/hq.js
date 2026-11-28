// Punchbook HQ (/hq): the admin's one screen. Overview, Orders, Restaurants, Payouts, Applications.
// Live reads the real server; Demo answers the same calls from demo-data.js and changes nothing.
// Restaurant staff (restaurant keys) are sent to their own page at /restaurant.
const $=id=>document.getElementById(id);
const money=n=>'LKR '+Number(n||0).toLocaleString('en-LK',{maximumFractionDigits:2});
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const hm=iso=>iso?new Date(iso).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'}):'';
const minsAgo=iso=>Math.max(0,Math.floor((Date.now()-Date.parse(iso))/60000));
const ago=iso=>{const m=minsAgo(iso);return m<1?'just now':m<60?m+' min ago':hm(iso)};
const nice=d=>new Date(d+'T12:00:00').toLocaleDateString([],{weekday:'short',day:'numeric',month:'short'});
const plural=(n,w)=>`${n} ${w}${n===1?'':'s'}`;
const LATE_MIN=5,UNPAID_HIDE_MIN=30,SETTLE_DAYS=2;
// Each day's money is paid to the restaurant two days later (T+2).
const addDays=(d,n)=>{const x=new Date(d+'T12:00:00Z');x.setUTCDate(x.getUTCDate()+n);return x.toISOString().slice(0,10)};
const dueOn=d=>addDays(d,SETTLE_DAYS);
const short=d=>new Date(d+'T12:00:00').toLocaleDateString([],{day:'numeric',month:'short'});
const range=days=>days.length===1?nice(days[0]):`${short(days[0])} – ${short(days[days.length-1])} (${days.length} days)`;

let demo=window.pbMode()==='demo',tab='overview';
let D={orders:[],kitchens:[],bridges:{},acc:null,apps:[],history:[]};
let lastOk=null,histMore=false;
let fRest='all',fType='all',fStatus='review',armed=null,editingBank=null,appsForCopy=null,openApp=null,fileJob=null,seen=null,loadedOnce=false;
const busy=new Set();

async function api(path,{body,method}={}){
  if(demo)return window.pbDemo.api(path,body);
  const res=await fetch(path,{method:method||(body?'POST':'GET'),headers:{'Content-Type':'application/json'},body:body&&JSON.stringify(body)});
  const out=await res.json().catch(()=>({}));
  if(!res.ok)throw Error(out.error||'Something went wrong. Please try again.');
  return out;
}
const showError=msg=>{$('error').textContent=msg;$('error').hidden=!msg};
const say=msg=>{$('live-status').textContent=msg};

// ---------- Loading
async function load(){
  const [orders,kitchens,bridges,acc,apps,hist]=await Promise.allSettled([api('/api/orders'),api('/api/restaurants/status'),api('/api/bridge/health'),api('/api/accounts'),api('/api/public/companies'),api('/api/accounts/history')]);
  if(orders.status==='fulfilled'&&Array.isArray(orders.value)){
    const paidNew=new Set(orders.value.filter(o=>o.paymentStatus==='paid'&&o.orderStatus==='new').map(o=>o.id));
    if(!demo&&seen&&[...paidNew].some(id=>!seen.has(id)))window.staffAlert?.();
    seen=new Set([...(seen||[]),...paidNew]);D.orders=orders.value;
  }
  if(kitchens.status==='fulfilled')D.kitchens=kitchens.value.restaurants||[];
  if(bridges.status==='fulfilled')D.bridges=Object.fromEntries((bridges.value.restaurants||[]).map(b=>[b.id,b]));
  if(acc.status==='fulfilled')D.acc=acc.value;
  if(apps.status==='fulfilled')D.apps=apps.value.companies||[];
  if(hist.status==='fulfilled')D.history=hist.value.payouts||[];
  const failed=[orders,acc].find(r=>r.status==='rejected');
  showError(failed?'Couldn’t reach the server: '+failed.reason.message+' Retrying…':'');
  if(!failed)lastOk=Date.now();pulse();
  loadedOnce=true;render();
  if(tab==='payouts')loadRange();
}
function pulse(){
  const p=$('pulse'),fresh=lastOk&&Date.now()-lastOk<30000;
  p.className='pulse '+(fresh?'on':lastOk===null&&!loadedOnce?'':'off');
  p.querySelector('span').textContent=demo?'Demo data':fresh?'Live · '+Math.max(0,Math.round((Date.now()-lastOk)/1000))+'s ago':'Offline';
}
setInterval(pulse,1000);
function reset(){D={orders:[],kitchens:[],bridges:{},acc:null,apps:[],history:[]};payDay=null;lastOk=null;seen=null;armed=null;editingBank=null;appsForCopy=null;openApp=null;fileJob=null}

// ---------- Orders logic (same steps as the restaurant screen, /admin)
const isDelivery=o=>o.fulfilment==='delivery';
const kind=o=>o.orderType!=='pickup'?'table':isDelivery(o)?'delivery':'pickup';
const title=o=>kind(o)==='table'?`Table ${o.table}`:`${isDelivery(o)?'Delivery':'Pickup'} · ${o.customer?.name||'Guest'}`;
const laneOf=o=>{
  if(o.orderStatus==='cancelled')return'done';
  if(o.orderType!=='pickup')return{new:'new',preparing:'cooking'}[o.orderStatus]||'done';
  if(isDelivery(o)&&o.kitchenReadyAt&&o.orderStatus==='preparing')return'done';
  return{new:'new',preparing:'cooking'}[o.orderStatus]||'done';
};
function nextStep(o){
  if(o.orderStatus==='cancelled')return null;
  if(o.orderType!=='pickup')return{new:['preparing','Start cooking'],preparing:['served','Served']}[o.orderStatus]||null;
  if(isDelivery(o)){
    if(o.orderStatus==='new')return['preparing','Start cooking'];
    if(o.orderStatus==='preparing')return o.kitchenReadyAt?['ready','Given to rider']:['food_ready','Food ready'];
    if(o.orderStatus==='ready')return['collected','Delivered'];
    return null;
  }
  return{new:['preparing','Start cooking'],preparing:['ready','Ready for pickup'],ready:['collected','Collected']}[o.orderStatus]||null;
}
const isPaid=o=>o.paymentStatus==='paid';
const visible=o=>o.paymentStatus!=='pending'||minsAgo(o.createdAt)<UNPAID_HIDE_MIN;
const isLate=o=>isPaid(o)&&o.orderStatus==='new'&&minsAgo(o.paidAt||o.createdAt)>=LATE_MIN;
const restName=id=>D.kitchens.find(k=>k.id===id)?.name||D.orders.find(o=>o.restaurantId===id)?.restaurantName||id;
const todayRow=id=>D.acc?.rows.find(r=>r.restaurantId===id);

// ---------- Render
function render(){
  document.querySelectorAll('[data-mode]').forEach(b=>b.setAttribute('aria-pressed',String((b.dataset.mode==='demo')===demo)));
  document.querySelectorAll('[data-tab]').forEach(a=>a.dataset.tab===tab?a.setAttribute('aria-current','page'):a.removeAttribute('aria-current'));
  document.body.dataset.tab=tab;
  const H={overview:['Command centre','Overview','Today across every restaurant'],orders:['Kitchen','Orders','New, cooking and done, as it happens'],restaurants:['Network','Restaurants','Who’s open, their till and their bank'],payouts:['Money · T+2','Payouts','Each day’s sales are paid two days later'],applications:['Onboarding','Applications','Restaurants that want to join'],waitlist:['Pre-launch','Waitlist','Who wants Punchbook, and where']}[tab];
  $('kicker').textContent=H[0];$('page-title').textContent=H[1];$('page-sub').textContent=H[2];document.title=H[1]+' · Punchbook HQ';
  document.querySelectorAll('.tab').forEach(s=>s.hidden=s.id!=='tab-'+tab);
  $('demo-note').hidden=!demo;
  const waiting=D.orders.filter(o=>isPaid(o)&&o.orderStatus==='new').length,due=dueList(),toReview=D.apps.filter(c=>c.status==='submitted').length;
  badge('b-orders',waiting);badge('b-payouts',due.length);badge('b-apps',toReview);
  if(!loadedOnce)return;
  // Don't redraw a tab while someone is typing in it.
  const typing=document.activeElement?.closest?.('.tab form, .tab textarea, .filebar');
  if(typing&&!typing.closest('#tab-orders'))return;
  ({overview:renderOverview,orders:renderOrders,restaurants:renderRestaurants,payouts:renderPayouts,applications:renderApps,waitlist:renderWaitlist})[tab]();
}
const badge=(id,n)=>{$(id).hidden=!n;$(id).textContent=n};

function renderOverview(){
  const rows=D.acc?.rows||[],sum=k=>rows.reduce((n,r)=>n+r[k],0),due=dueList(),dueTotal=due.reduce((n,r)=>n+r.owed,0);
  const cooking=D.orders.filter(o=>isPaid(o)&&['new','cooking'].includes(laneOf(o))),waiting=cooking.filter(o=>o.orderStatus==='new').length;
  const toReview=D.apps.filter(c=>c.status==='submitted'||c.status==='under-review').length;
  $('tiles').innerHTML=[
    ['orders','blue','🧾','Orders today',sum('orders'),money(sum('food'))+' in sales'],
    ['orders','orange','🍳','In the kitchen now',cooking.length,waiting?plural(waiting,'order')+' not started':'all started'],
    ['payouts','green','💸','To send restaurants',money(dueTotal),due.length?'to '+plural(due.length,'restaurant'):'nothing owed'],
    ['applications','purple','📝','Applications to review',toReview,toReview?'waiting for you':'none waiting'],
  ].map(([t,c,icon,label,val,sub])=>`<a class="tile ${c}" href="#${t}"><span><i aria-hidden="true"></i>${label}</span><strong>${esc(val)}</strong><small>${esc(sub)}</small></a>`).join('');

  const items=[];
  for(const o of D.orders.filter(isLate))items.push(['bad',`${esc(title(o))} at ${esc(o.restaurantName||restName(o.restaurantId))} has waited ${minsAgo(o.paidAt||o.createdAt)} min`,'orders','See order']);
  for(const o of D.orders.filter(o=>o.pos?.status==='error'&&o.orderStatus!=='cancelled'))items.push(['bad',`${esc(title(o))} didn’t reach ${esc(restName(o.restaurantId))}’s till`,'orders','See order']);
  for(const [id,b] of Object.entries(D.bridges))if(!b.online)items.push(['bad',`${esc(restName(id))}’s SambaPOS is offline, so new orders won’t print at the till`,'restaurants','Check']);
  for(const k of D.kitchens)if(!k.accepting)items.push(['',`${esc(k.name)} has paused orders`,'restaurants','Resume']);
  const noBank=due.filter(r=>!r.bank);
  const overdue=due.filter(r=>r.overdue);
  if(overdue.length)items.push(['bad',`${plural(overdue.length,'payout')} overdue (past T+2): ${overdue.map(r=>esc(r.name)).join(', ')}`,'payouts','Pay now']);
  else if(due.length)items.push(['',`${money(dueTotal)} to send to ${plural(due.length,'restaurant')}${noBank.length?` (${noBank.length} without bank details)`:''}`,'payouts','Pay']);
  const fresh=D.apps.filter(c=>c.status==='submitted').length;
  if(fresh)items.push(['',`${plural(fresh,'new restaurant application')}`,'applications','Review']);
  $('attention').innerHTML=items.length?items.map(([c,t,go,l])=>`<li class="${c}"><span>${t}</span><a href="#${go}">${l} →</a></li>`).join('')
    :'<li class="ok"><span>All good. Nothing needs you right now.</span></li>';

  $('today-rows').innerHTML=D.kitchens.length?D.kitchens.map(k=>{const r=todayRow(k.id);
    return`<tr><td><b>${esc(k.name)}</b><small>${esc(k.area||'')}</small></td><td>${k.accepting?'<span class="pill good">Open</span>':'<span class="pill warn">Paused</span>'}</td><td class="num">${r?.orders||0}</td><td class="num">${money(r?.food)}</td></tr>`}).join('')
    :'<tr><td colspan="4" class="empty">No restaurants yet.</td></tr>';
}

function renderOrders(){
  const rests=[...new Set([...D.kitchens.map(k=>k.id),...D.orders.map(o=>o.restaurantId)])];
  $('f-restaurant').innerHTML=[['all','All restaurants'],...rests.map(id=>[id,restName(id)])].map(([v,l])=>`<button type="button" data-frest="${esc(v)}" aria-pressed="${fRest===v}">${esc(l)}</button>`).join('');
  $('f-type').innerHTML=[['all','All types'],['table','Table'],['pickup','Pickup'],['delivery','Delivery']].map(([v,l])=>`<button type="button" data-ftype="${v}" aria-pressed="${fType===v}">${l}</button>`).join('');
  const list=D.orders.filter(visible).filter(o=>(fRest==='all'||o.restaurantId===fRest)&&(fType==='all'||kind(o)===fType));
  const lanes=[['new','New','No new orders.'],['cooking','Cooking','Nothing cooking.'],['done','Done','Finished orders show here.']];
  $('board').innerHTML=lanes.map(([key,label,empty])=>{
    let group=list.filter(o=>laneOf(o)===key).sort((a,b)=>key==='done'?Date.parse(b.createdAt)-Date.parse(a.createdAt):Date.parse(a.createdAt)-Date.parse(b.createdAt));
    if(key==='done')group=group.slice(0,15);
    return`<section class="lane lane-${key}"><h3>${label} <span>${group.length}</span></h3><div class="lane-cards">${group.length?group.map(orderCard).join(''):`<div class="empty">${empty}</div>`}</div></section>`;
  }).join('');
}
function orderCard(o){
  const cancelled=o.orderStatus==='cancelled',pending=o.paymentStatus==='pending',step=nextStep(o),late=isLate(o),b=busy.has(o.id);
  const tags=[pending?'<span class="pill warn">Waiting for payment</span>':cancelled?`<span class="pill bad">Cancelled · ${o.paymentStatus==='refunded'?'refunded':o.paymentStatus==='refund_pending'?'refund on its way':'not charged'}</span>`:'<span class="pill good">Paid</span>'];
  if(late)tags.push(`<span class="pill bad">Waiting ${minsAgo(o.paidAt||o.createdAt)} min</span>`);
  if(isPaid(o)&&o.testPayment!==false)tags.push('<span class="pill plain">Test</span>');
  if(o.pos?.status==='synced')tags.push(`<span class="pill plain">In SambaPOS${o.pos.ticketNumber?' #'+esc(o.pos.ticketNumber):''}</span>`);
  if(o.pos?.status==='error')tags.push('<span class="pill bad">Not in SambaPOS</span>');
  let extra='';
  if(kind(o)!=='table'){
    const lines=[];
    if(isDelivery(o))lines.push('📍 '+esc(o.customer?.address?.line||'No address')+(o.distanceKm!=null?` · ${o.distanceKm} km`:''));
    lines.push((isDelivery(o)?'Food ready by ':'Pickup at ')+hm(o.pickupAt)+(o.customer?.phone?` · <a href="tel:${esc(o.customer.phone)}">${esc(o.customer.phone)}</a>`:''));
    if(isDelivery(o))lines.push(o.dispatch?`Rider: ${esc(o.dispatch.rider?.name||'')}${o.dispatch.deliveredAt?' · delivered':o.dispatch.pickedUpAt?' · on the way':' · accepted'}`:isPaid(o)&&!cancelled?'Waiting for a rider':'');
    if(o.note)lines.push('“'+esc(o.note)+'”');
    extra=`<div class="extra">${lines.filter(Boolean).join('<br>')}</div>`;
  }
  const posRetry=o.pos?.status==='error'&&!cancelled?`<button type="button" class="btn small" data-posretry="${esc(o.id)}" ${b?'disabled':''}>Resend to SambaPOS</button>`:'';
  const main=step&&!cancelled?`<button type="button" class="btn ${o.orderStatus==='new'?'primary':''}" data-step="${esc(o.id)}" data-next="${step[0]}" ${b||pending?'disabled':''}>${b?'Updating…':pending?'Waiting for payment':step[1]}</button>`:'';
  const canCancel=!cancelled&&!pending&&step&&o.dispatch?.status!=='picked_up';
  const cancel=canCancel?`<button type="button" class="btn small danger" data-cancel="${esc(o.id)}" ${b?'disabled':''}>${armed===o.id?'Tap again to cancel & refund':'Cancel'}</button>`:'';
  const done=!step&&!cancelled?`<div class="done">✓ ${kind(o)==='table'?'Served':isDelivery(o)?(o.orderStatus==='collected'?'Delivered':'With the rider'):'Collected'}</div>`:'';
  return`<article class="order${late?' late':''}${cancelled?' cancelled':''}"><div class="order-top"><b>${esc(title(o))}</b><time datetime="${esc(o.createdAt)}">${ago(o.paidAt||o.createdAt)}</time></div>
    <div class="where">${esc(o.restaurantName||restName(o.restaurantId))} · ${esc(o.id)}</div><div class="tags">${tags.join('')}</div>
    <ul>${o.items.map(i=>`<li><span>${esc(i.qty)} × ${esc(i.name)}</span><span>${money(i.price*i.qty)}</span></li>`).join('')}${o.deliveryFee?`<li><span>Delivery</span><span>${money(o.deliveryFee)}</span></li>`:''}</ul>
    <div class="total"><span>Total</span><span>${money(o.total)}</span></div>${extra}${done}${main||cancel||posRetry?`<div class="acts">${main}${posRetry}${cancel}</div>`:''}</article>`;
}

function renderRestaurants(){
  const due=dueList(),banks=D.acc?.banks||{};
  $('restaurants').innerHTML=D.kitchens.length?D.kitchens.map((k,i)=>{
    const r=todayRow(k.id),b=banks[k.id],owed=due.find(x=>x.restaurantId===k.id),br=D.bridges[k.id];
    const till=br?(br.online?`<span class="pill good">SambaPOS online</span><small>checked ${ago(br.lastSeenAt)}</small>`:`<span class="pill bad">SambaPOS offline</span><small>${br.lastSeenAt?'last seen '+ago(br.lastSeenAt):'never connected'}</small>`)
      :'<span class="pill plain">No POS link</span><small>orders show on the Punchbook screen</small>';
    const bank=b?`${esc(b.bankName)}${b.branch?' · '+esc(b.branch):''} · ••••${esc(String(b.accountNumber).slice(-4))}<small>${esc(b.accountName)} · <button type="button" class="linkbtn" data-bank="${esc(k.id)}">change</button></small>`
      :`<span class="pill warn">Not added</span><small><button type="button" class="linkbtn" data-bank="${esc(k.id)}">Add bank details</button></small>`;
    return`<article class="rcard" style="--accent:${['#2f6fb5','#d9822b','#7a4fb0','#138a8a','#c2477a','#2e8b57'][i%6]}"><header><div><h3>${esc(k.name)}</h3><small>${esc(k.area||'')}</small></div>
      <button type="button" class="btn small ${k.accepting?'':'primary'}" data-pause="${esc(k.id)}" data-paused="${k.accepting}">${k.accepting?'Pause orders':'Resume orders'}</button></header>
      <div class="facts"><div><span>Orders today</span><b>${r?.orders||0}</b></div><div><span>Sales today</span><b>${money(r?.food)}</b></div></div>
      <div class="line"><span>Taking orders</span><span class="val">${k.accepting?'<span class="pill good">Yes</span>':'<span class="pill warn">Paused</span>'}</span></div>
      <div class="line"><span>Till</span><span class="val">${till}</span></div>
      <div class="line"><span>Bank</span><span class="val">${bank}</span></div>
      <div class="line"><span>Their page</span><span class="val"><a href="/restaurant?restaurant=${encodeURIComponent(k.id)}">Orders, payments and earnings →</a></span></div>
      <div class="line"><span>Owed</span><span class="val">${owed?`<b>${money(owed.owed)}</b><small><a href="#payouts">send it →</a></small>`:'Nothing owed'}</span></div>
      ${editingBank===k.id?bankForm(k.id,b):''}</article>`;
  }).join(''):'<div class="empty">No restaurants yet.</div>';
}
function bankForm(id,b={}){
  b||={};const opts=(appsForCopy||[]).map(a=>`<option value="${esc(a.id)}">${esc(a.name)} · ${esc(a.bankName)} ••••${esc(String(a.accountNumber).slice(-4))}</option>`).join('');
  return`<form class="bankform" data-bankform="${esc(id)}">${opts?`<select name="app" aria-label="Copy from a signup application"><option value="">Copy from a signup application…</option>${opts}</select>`:''}
    <input name="accountName" placeholder="Account name" value="${esc(b.accountName)}" aria-label="Account name" required>
    <input name="bankName" placeholder="Bank (e.g. Commercial Bank)" value="${esc(b.bankName)}" aria-label="Bank" required>
    <input name="branch" placeholder="Branch" value="${esc(b.branch)}" aria-label="Branch">
    <input name="accountNumber" placeholder="Account number" inputmode="numeric" value="${esc(b.accountNumber)}" aria-label="Account number" required>
    <div class="acts"><button class="btn primary">Save bank details</button><button type="button" class="btn" data-cancelbank>Cancel</button><span class="msg" role="status"></span></div></form>`;
}

// Payouts still to send from earlier days, one entry per restaurant.
function dueList(){
  const by={};
  const today=D.acc?.today;
  for(const u of D.acc?.unpaid||[]){const r=by[u.restaurantId]||={restaurantId:u.restaurantId,name:u.name,owed:0,days:[],bank:(D.acc.banks||{})[u.restaurantId]||u.bank||null};r.owed=Math.round((r.owed+u.owed)*100)/100;r.days.push(u.date)}
  for(const r of Object.values(by)){r.days.sort();r.dueBy=dueOn(r.days[0]);r.overdue=today>r.dueBy;r.dueToday=today===r.dueBy}
  return Object.values(by).sort((a,b)=>a.dueBy.localeCompare(b.dueBy)||b.owed-a.owed);
}
const TICK='<svg viewBox="0 0 24 24"><path d="M5 12l5 5 9-10"/></svg>';
// ---------- Payouts: summary, then Calendar · To send · Reports · History
const PALETTE=['#38bdf8','#fbbf24','#a78bfa','#2dd4bf','#f472b6','#34d399','#fb923c','#818cf8'];
const colorOf=id=>{const ids=D.kitchens.map(k=>k.id);let i=ids.indexOf(id);if(i<0)i=ids.length+[...id].reduce((n,c)=>n+c.charCodeAt(0),0);return PALETTE[i%PALETTE.length]};
const kfmt=n=>n>=1e6?(n/1e6).toFixed(n>=1e7?0:1)+'M':n>=1e3?(n/1e3).toFixed(n>=1e5?0:1)+'k':String(Math.round(n));
const monthOf=d=>d.slice(0,7);
const monthName=m=>new Date(m+'-15T12:00:00').toLocaleDateString([],{month:'long',year:'numeric'});
const lastDay=m=>{const [y,mo]=m.split('-').map(Number);return new Date(Date.UTC(y,mo,0)).toISOString().slice(0,10)};
let paySub='calendar',payRest='all',payMonth=null,payDay=null;
const keep=r=>(r.commission||0)+(r.deliveryFees||0)-(r.cardFees||0)-(r.courierCosts||0);
const pickRows=rows=>rows.filter(r=>payRest==='all'||r.restaurantId===payRest);
// A day's status for the calendar: paid, overdue, due (today is T+2), upcoming, open (today) or none.
function dayStatus(date,rows){
  if(!rows.length)return'none';const t=D.acc?.today;
  if(rows.every(r=>r.payout))return'paid';
  if(date===t)return'open';
  const due=dueOn(date);return due<t?'overdue':due===t?'due':'upcoming';
}
const STATUS_PAY={paid:['Paid','good'],overdue:['Overdue','bad'],due:['Due today','warn'],upcoming:['Not due yet','info'],open:['Day still open','plain'],none:['No sales','plain']};
async function loadRange(force){
  if(!D.acc)return;payMonth||=monthOf(D.acc.today);
  const from=payMonth+'-01',to=lastDay(payMonth)<D.acc.today?lastDay(payMonth):D.acc.today;
  // The chart also needs the 30 days before the end of the month.
  const chartFrom=addDays(to,-29)<from?addDays(to,-29):from;
  if(!force&&D.range&&D.range.key===payMonth+'|'+payRest&&Date.now()-D.range.at<8000)return;
  try{const r=await api(`/api/accounts/range?from=${chartFrom}&to=${to}`);D.range={...r,key:payMonth+'|'+payRest,at:Date.now(),monthFrom:from,monthTo:to};if(tab==='payouts')renderPayouts()}catch(err){showError(err.message)}
}
const rangeDays=()=>(D.range?.days||[]).map(d=>({date:d.date,rows:pickRows(d.rows)})).filter(d=>d.rows.length);
const monthDays=()=>rangeDays().filter(d=>d.date>=D.range.monthFrom&&d.date<=D.range.monthTo);

function renderPayouts(){
  const due=dueList().filter(r=>payRest==='all'||r.restaurantId===payRest),t=D.acc?.today;
  // Unpaid, day by day, to split "due now" from "not due yet".
  const unpaid=(D.acc?.unpaid||[]).filter(u=>payRest==='all'||u.restaurantId===payRest);
  const dueNow=unpaid.filter(u=>dueOn(u.date)<=t),overdue=unpaid.filter(u=>dueOn(u.date)<t);
  const sum=(l,k='owed')=>l.reduce((n,x)=>n+(x[k]||0),0);
  const mrows=monthDays().flatMap(d=>d.rows),paidRows=mrows.filter(r=>r.payout);
  $('pay-tiles').innerHTML=[
    [overdue.length?'rose':'green','Left to send',money(sum(due)),overdue.length?`${overdue.length} overdue`:due.length?`${plural(due.length,'restaurant')}`:'all paid up'],
    ['orange','Due now',money(sum(dueNow)),dueNow.length?`${plural(new Set(dueNow.map(u=>u.restaurantId)).size,'restaurant')} to pay today`:'nothing due today'],
    ['blue','Paid this month',money(sum(paidRows,'owed')),payMonth?monthName(payMonth):''],
    ['purple','You earned this month',money(sum(mrows.map(r=>({owed:keep(r)})))),'3% card fee + delivery − costs'],
  ].map(([c,l,v,sub])=>`<div class="tile ${c}"><span><i></i>${l}</span><strong>${esc(v)}</strong><small>${esc(sub)}</small></div>`).join('');
  document.querySelectorAll('[data-sub]').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.sub===paySub)));
  document.querySelectorAll('.sub').forEach(el=>el.hidden=el.id!=='sub-'+paySub);
  const rests=[...new Set([...D.kitchens.map(k=>k.id),...(D.acc?.unpaid||[]).map(u=>u.restaurantId)])];
  const sel=$('pay-rest');if(document.activeElement!==sel)sel.innerHTML=[['all','All restaurants'],...rests.map(id=>[id,restName(id)])].map(([v,l])=>`<option value="${esc(v)}" ${v===payRest?'selected':''}>${esc(l)}</option>`).join('');
  $('monthnav').hidden=!['calendar','reports'].includes(paySub);
  if(payMonth){$('m-label').textContent=monthName(payMonth);$('m-next').disabled=payMonth>=monthOf(t)}
  ({calendar:renderCalendar,send:renderSend,reports:renderReports,history:renderHistory})[paySub]();
}

function renderCalendar(){
  if(!D.range||!payMonth){$('cal').innerHTML='<div class="empty">Loading…</div>';return}
  const t=D.acc.today,byDate=Object.fromEntries(rangeDays().map(d=>[d.date,d.rows]));
  const first=payMonth+'-01',last=lastDay(payMonth),lead=(new Date(first+'T12:00:00Z').getUTCDay()+6)%7;
  const cells=[];for(let i=0;i<lead;i++)cells.push('<div class="cal-cell blank"></div>');
  for(let d=first;d<=last;d=addDays(d,1)){
    const rows=byDate[d]||[],st=d>t?'future':dayStatus(d,rows),owed=rows.reduce((n,r)=>n+r.owed,0);
    cells.push(`<button type="button" class="cal-cell ${st}${d===t?' today':''}${d===payDay?' sel':''}" data-day="${d}" ${d>t?'disabled':''} aria-label="${nice(d)}: ${rows.length?money(owed)+', '+STATUS_PAY[st]?.[0]:'no sales'}">
      <span class="dnum">${Number(d.slice(8))}</span>${rows.length?`<span class="damt">${kfmt(owed)}</span><i class="ddot"></i>`:''}</button>`);
  }
  $('cal').innerHTML=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(w=>`<div class="cal-head">${w}</div>`).join('')+cells.join('');
  // Pick a sensible day: the oldest unpaid one, else the latest with sales.
  if(!payDay||monthOf(payDay)!==payMonth){const list=rangeDays().filter(x=>x.date>=first&&x.date<=last);payDay=(list.find(x=>dayStatus(x.date,x.rows)==='overdue'||dayStatus(x.date,x.rows)==='due')||list[list.length-1])?.date||null;if(payDay)return renderCalendar()}
  renderDayPanel(byDate[payDay]||[]);
  renderChart();
}
function renderDayPanel(rows){
  const el=$('daypanel');
  if(!payDay){el.innerHTML='<div class="empty">No sales this month yet.</div>';return}
  const st=dayStatus(payDay,rows),sum=k=>rows.reduce((n,r)=>n+(r[k]||0),0),t=D.acc.today,unpaid=rows.filter(r=>!r.payout&&r.owed>0);
  const [sl,sc]=STATUS_PAY[st]||['','plain'];
  el.innerHTML=`<div class="dp-head"><div><p class="kicker">${payDay===t?'Today':nice(payDay)}</p><h2>${money(sum('owed'))} <small>to restaurants</small></h2>
      <p class="help">${rows.length?`Sales ${money(sum('food')+sum('service'))} · card fee ${money(sum('commission'))} · you keep ${money(rows.reduce((n,r)=>n+keep(r),0))}`:'No paid orders on this day.'}</p></div>
      <div class="dp-due"><span class="pill ${sc}">${sl}</span><small>${payDay===t?'Pay on '+nice(dueOn(payDay)):'Due '+nice(dueOn(payDay))}</small></div></div>
    ${rows.length?`<div class="dp-rows">${rows.map(r=>{const can=!r.payout&&payDay<t;return`<div class="dp-row${r.payout?' paid':''}" style="--rc:${colorOf(r.restaurantId)}">
      ${can?`<label class="tick"><input type="checkbox" data-dpaid="${esc(r.restaurantId)}" aria-label="Mark ${esc(r.name)} paid for ${nice(payDay)}">${TICK}</label>`:r.payout?`<span class="tick done">${TICK}</span>`:'<span class="tick none"></span>'}
      <div><b>${esc(r.name)}</b><small>${r.orders} orders · sales ${money(r.food+r.service)} · −${money(r.commission)}</small></div>
      <div class="dp-bank">${r.payout?`<span class="pill good">Paid ${new Date(r.payout.sentAt).toLocaleDateString([],{day:'numeric',month:'short'})}</span><small>${r.payout.reference?'Ref '+esc(r.payout.reference)+' · ':''}<button type="button" class="linkbtn" data-unpay="${esc(r.restaurantId)}" data-days="${payDay}">undo</button></small>`
        :r.bank?`${esc(r.bank.bankName)} <span class="mono">••••${esc(String(r.bank.accountNumber).slice(-4))}</span>`:'<span class="pill warn">No bank details</span>'}</div>
      <div class="amt">${money(r.owed)}</div></div>`}).join('')}</div>`:''}
    ${unpaid.length&&payDay<t?`<div class="dp-foot"><button type="button" class="btn primary small" id="daybank">Bank file for this day</button><button type="button" class="btn small ghost" id="daypaid">Mark all ${unpaid.length} paid</button></div>`:''}`;
}
function renderChart(){
  const t=D.acc.today,end=D.range.monthTo,start=addDays(end,-29),byDate=Object.fromEntries(rangeDays().map(d=>[d.date,d.rows]));
  const cols=[];for(let d=start;d<=end;d=addDays(d,1))cols.push({date:d,rows:byDate[d]||[]});
  const max=Math.max(1,...cols.map(c=>c.rows.reduce((n,r)=>n+r.food+r.service,0)));
  const ids=[...new Set(cols.flatMap(c=>c.rows.map(r=>r.restaurantId)))];
  $('stack').innerHTML=cols.map(c=>{const total=c.rows.reduce((n,r)=>n+r.food+r.service,0);
    return`<button type="button" class="scol${c.date===payDay?' sel':''}" data-day="${c.date}" ${c.date>t?'disabled':''} data-tip="${short(c.date)} · ${money(total)}${c.rows.length>1?' · '+c.rows.map(r=>r.name.split(' ')[0]+' '+kfmt(r.food+r.service)).join(', '):''}" aria-label="${nice(c.date)} sales ${money(total)}">
      ${c.rows.slice().sort((a,b)=>ids.indexOf(a.restaurantId)-ids.indexOf(b.restaurantId)).map(r=>`<i style="height:${((r.food+r.service)/max*100).toFixed(1)}%;background:${colorOf(r.restaurantId)}"></i>`).join('')}</button>`}).join('');
  $('stack-labels').innerHTML=cols.map((c,i)=>`<span>${i%5?'':short(c.date)}</span>`).join('');
  $('stack-legend').innerHTML=ids.map(id=>`<span><i style="background:${colorOf(id)}"></i>${esc(restName(id))}</span>`).join('');
  const tot=cols.reduce((n,c)=>n+c.rows.reduce((m,r)=>m+r.food+r.service,0),0);
  $('stack-total').textContent=`${money(tot)} in 30 days · about ${money(Math.round(tot/30))} a day`;
}

function renderSend(){
  const due=dueList().filter(r=>payRest==='all'||r.restaurantId===payRest),total=due.reduce((n,r)=>n+r.owed,0);
  const when=r=>r.overdue?`<span class="pill bad">Overdue · was due ${nice(r.dueBy)}</span>`:r.dueToday?'<span class="pill warn">Due today</span>':`<span class="pill info">Due ${nice(r.dueBy)}</span>`;
  $('due').innerHTML=due.length?`<div class="due">${due.map(r=>`<div class="due-row${r.overdue?' overdue':''}" style="--rc:${colorOf(r.restaurantId)}">
      <label class="tick" title="Mark ${esc(r.name)} as paid"><input type="checkbox" data-paid="${esc(r.restaurantId)}" aria-label="Mark ${esc(r.name)} as paid">${TICK}</label>
      <div><b>${esc(r.name)}</b><small>Sales from ${range(r.days)}</small></div>
      <div>${r.bank?`${esc(r.bank.bankName)} <span class="mono">••••${esc(String(r.bank.accountNumber).slice(-4))}</span><small>${esc(r.bank.accountName)}</small>`:'<span class="pill warn">No bank details</span><small><a href="#restaurants">Add them in Restaurants</a></small>'}</div>
      <div class="amt">${money(r.owed)}<small>${when(r)}</small></div></div>`).join('')}</div><div class="due-total"><span>Left to send</span><b>${money(total)}</b></div>`
    :'<div class="empty">Nothing left to send. Everyone is paid up.</div>';
  $('bankfile').disabled=!due.some(r=>r.bank);
}

function renderReports(){
  if(!D.range){$('flow').innerHTML='<div class="empty">Loading…</div>';return}
  const rows=monthDays().flatMap(d=>d.rows),s=k=>rows.reduce((n,r)=>n+(r[k]||0),0);
  const collected=s('food')+s('service')+s('deliveryFees'),toRest=s('owed'),paid=rows.filter(r=>r.payout).reduce((n,r)=>n+r.owed,0);
  const kept=rows.reduce((n,r)=>n+keep(r),0);
  const line=(l,v,c='',sub='')=>`<div class="flow-row ${c}"><span>${l}${sub?`<small>${sub}</small>`:''}</span><b>${v}</b></div>`;
  $('flow').innerHTML=rows.length?line('Collected from customers',money(collected),'in',`${s('orders')} paid orders`)
    +line('Owed to restaurants','− '+money(toRest),'out',`${money(paid)} paid · ${money(toRest-paid)} still to send`)
    +line('Payment provider fees','− '+money(s('cardFees')),'out','what Payments.lk actually charged')
    +line('Rider / PickMe costs','− '+money(s('courierCosts')),'out')
    +line('Punchbook keeps',money(kept),'total',`card fee ${money(s('commission'))} + delivery fees ${money(s('deliveryFees'))}`)
    :'<div class="empty">No paid orders this month.</div>';
  const by={};for(const r of rows){const x=by[r.restaurantId]||={id:r.restaurantId,name:r.name,orders:0,sales:0,commission:0,owed:0,paid:0};x.orders+=r.orders;x.sales+=r.food+r.service;x.commission+=r.commission;x.owed+=r.owed;if(r.payout)x.paid+=r.owed}
  const list=Object.values(by).sort((a,b)=>b.sales-a.sales);
  $('month-rows').innerHTML=list.length?list.map(x=>`<tr><td><b style="color:${colorOf(x.id)}">●</b> <b>${esc(x.name)}</b></td><td class="num hide-m">${x.orders}</td><td class="num">${money(x.sales)}</td><td class="num hide-m">− ${money(x.commission)}</td><td class="num">${money(x.owed)}</td><td class="num">${x.owed-x.paid>0.5?`<span class="pill warn">${money(x.owed-x.paid)} left</span>`:'<span class="pill good">All paid</span>'}</td>
      <td class="num"><button type="button" class="btn small ghost" data-statement="${esc(x.id)}">Statement</button></td></tr>`).join('')
    :'<tr><td colspan="7" class="empty">No restaurants with sales this month.</td></tr>';
  if(document.activeElement!==$('pct')&&D.acc)$('pct').value=D.acc.commissionPct;
}
// A restaurant's month statement: one line per day, for their accountant.
function statement(id){
  const days=monthDays().map(d=>({date:d.date,r:d.rows.find(x=>x.restaurantId===id)})).filter(x=>x.r),name=restName(id);
  const csv=csvOf([[`Punchbook statement: ${name}`],[`Month: ${monthName(payMonth)}`],[],['Date','Paid orders','Food sales','Service charge','Card fee %','Card fee','Amount to restaurant','Due date (T+2)','Paid on','Reference'],
    ...days.map(({date,r})=>[date,r.orders,r.food.toFixed(2),r.service.toFixed(2),r.commissionPct,r.commission.toFixed(2),r.owed.toFixed(2),dueOn(date),r.payout?String(r.payout.sentAt).slice(0,10):'',r.payout?.reference||'']),
    [],['Total','',days.reduce((n,x)=>n+x.r.food,0).toFixed(2),days.reduce((n,x)=>n+x.r.service,0).toFixed(2),'',days.reduce((n,x)=>n+x.r.commission,0).toFixed(2),days.reduce((n,x)=>n+x.r.owed,0).toFixed(2)]]);
  download(csv,`punchbook-statement-${id}-${payMonth}${demo?'-DEMO':''}.csv`);
}

function renderHistory(){
  const groups=[];
  for(const p of D.history.filter(p=>payRest==='all'||p.restaurantId===payRest)){const g=groups.find(x=>x.restaurantId===p.restaurantId&&x.sentAt.slice(0,16)===String(p.sentAt).slice(0,16)&&x.reference===(p.reference||''));
    if(g){g.amount+=p.amount;g.days.push(p.date)}else groups.push({restaurantId:p.restaurantId,name:p.name,sentAt:String(p.sentAt),reference:p.reference||'',amount:p.amount,days:[p.date]})}
  const shown=histMore?groups:groups.slice(0,12);
  $('history').innerHTML=groups.length?shown.map(g=>`<div class="hrow" style="--rc:${colorOf(g.restaurantId)}"><span class="when">${new Date(g.sentAt).toLocaleString([],{day:'numeric',month:'short',hour:'numeric',minute:'2-digit'})}</span>
      <div><b>${esc(g.name)}</b><small>Sales from ${range(g.days.sort())}</small></div><div><small>${g.reference?'Ref '+esc(g.reference):'No reference'}</small></div>
      <span class="amt">${money(Math.round(g.amount*100)/100)}</span><button type="button" class="linkbtn" data-unpay="${esc(g.restaurantId)}" data-days="${esc(g.days.join(','))}">Undo</button></div>`).join('')
      +(groups.length>12?`<div class="more"><button type="button" class="btn small ghost" id="histmore">${histMore?'Show less':'Show all '+groups.length}</button></div>`:'')
    :'<div class="empty">Nothing marked as sent yet.</div>';
}
function toast(msg,undo){
  const t=$('toast');clearTimeout(toast.timer);t.hidden=false;t.innerHTML=`<span>${msg}</span>${undo?'<button type="button" id="toast-undo">Undo</button>':''}`;
  toast.undo=undo;toast.timer=setTimeout(()=>{t.hidden=true;toast.undo=null},7000);
}
async function setPaid(restaurantId,days,paid){
  for(const date of days)await api('/api/accounts/payouts',paid?{body:{date,restaurantIds:[restaurantId],reference:'Ticked in HQ'}}:{body:{date,restaurantId,undo:true}});
  await load();await loadRange(true);
}

const STATUS={submitted:['New','warn'],'under-review':['Reviewing','warn'],'ipg-submitted':['With payment provider','plain'],approved:['Approved','good'],live:['Live','good'],rejected:['Rejected','bad']};
const statusPill=s=>{const [l,c]=STATUS[s]||[s,'plain'];return`<span class="pill ${c}">${esc(l)}</span>`};
function renderApps(){
  const groups={review:['To review',c=>['submitted','under-review','ipg-submitted'].includes(c.status)],done:['Approved',c=>['approved','live'].includes(c.status)],rejected:['Rejected',c=>c.status==='rejected'],all:['All',()=>true]};
  $('f-status').innerHTML=Object.entries(groups).map(([k,[l,f]])=>`<button type="button" data-fstatus="${k}" aria-pressed="${fStatus===k}">${l} (${D.apps.filter(f).length})</button>`).join('');
  const list=D.apps.filter(groups[fStatus][1]);
  $('app-list').innerHTML=list.length?list.map(c=>`<button type="button" class="app-row" data-app="${esc(c.id)}" aria-current="${openApp?.id===c.id}"><span><b>${esc(c.tradingName||c.companyName)}</b><small>${esc(c.businessCategory||'')} · ${new Date(c.createdAt).toLocaleDateString([],{day:'numeric',month:'short'})}</small></span>${statusPill(c.status)}</button>`).join('')
    :`<div class="empty">${D.apps.length?'Nothing here.':'No applications yet. Restaurants apply at punchbook.online/signup.'}</div>`;
  // On a wide screen, show the first application rather than an empty side.
  if((!openApp||!list.some(c=>c.id===openApp.id))&&list.length&&innerWidth>=900&&!renderApps.opening){renderApps.opening=true;
    api('/api/public/companies/'+encodeURIComponent(list[0].id)+'/full').then(r=>{openApp=r.company;renderApps()}).catch(()=>{}).finally(()=>renderApps.opening=false)}
  const d=$('app-detail');d.hidden=!openApp;if(!openApp)return;
  if(d.dataset.id===openApp.id&&d.contains(document.activeElement))return;
  const c=openApp,kv=(l,v)=>`<div><span>${l}</span><b>${esc(v||'—')}</b></div>`;
  d.dataset.id=c.id;
  d.innerHTML=`<h2>${esc(c.tradingName||c.companyName)}</h2><p class="ref">${esc(c.reference)} · applied ${new Date(c.createdAt).toLocaleString([],{day:'numeric',month:'short',hour:'numeric',minute:'2-digit'})}</p>
    <div class="kv"><h4>Business</h4>${kv('Registered name',c.companyName)}${kv('BR number',c.registrationNumber)}${kv('Type',c.businessType)}${kv('Category',c.businessCategory)}${kv('Address',c.registeredAddress)}
    <h4>Contact</h4>${kv('Name',c.contactName)}${kv('Role',c.contactRole)}${kv('Phone',c.phone)}${kv('Email',c.email)}${kv('NIC / passport',c.nicNumber)}
    <h4>Bank</h4>${kv('Bank',c.bankName)}${kv('Branch',c.bankBranch)}${kv('Account name',c.bankAccountName)}${kv('Account number',c.bankAccountNumber)}
    <h4>Expected sales</h4>${kv('Average order',c.averageTransactionValue?money(c.averageTransactionValue):'')}${kv('Per month',c.monthlyVolume?money(c.monthlyVolume):'')}</div>
    <div class="docs">${Object.entries(c.documents||{}).map(([k,doc])=>`<button type="button" class="btn small" data-doc="${esc(k)}">${esc({businessRegistration:'Business registration',identityDocument:'NIC / passport',bankProof:'Bank proof'}[k]||doc.name||k)} ↗</button>`).join('')}</div>
    <form class="decide" id="decide"><div class="row"><label for="app-status"><b>Status</b></label><select id="app-status">${Object.entries(STATUS).map(([v,[l]])=>`<option value="${v}" ${c.status===v?'selected':''}>${l}</option>`).join('')}</select></div>
      <textarea id="app-notes" placeholder="Notes (only you see these)" aria-label="Notes">${esc(c.adminNotes)}</textarea>
      <div class="row"><button class="btn primary">Save</button><span class="msg" id="app-msg" role="status"></span></div></form>`;
}

// ---------- Actions
document.addEventListener('click',async e=>{
  const t=e.target.closest('button,a');if(!t)return;
  if(t.dataset.mode){const want=t.dataset.mode==='demo';if(want===demo)return;demo=want;window.pbSetMode(demo?'demo':'live');reset();loadedOnce=false;render();await load();return}
  if(t.dataset.frest){fRest=t.dataset.frest;renderOrders();return}
  if(t.dataset.ftype){fType=t.dataset.ftype;renderOrders();return}
  if(t.dataset.fstatus){fStatus=t.dataset.fstatus;renderApps();return}
  if(t.dataset.step){
    const id=t.dataset.step;busy.add(id);renderOrders();
    try{const o=await api('/api/orders/'+encodeURIComponent(id)+'/status',{body:{orderStatus:t.dataset.next}});D.orders=D.orders.map(x=>x.id===id?o:x);say(title(o)+' updated.')}catch(err){showError(err.message)}
    busy.delete(id);renderOrders();render();return;
  }
  if(t.dataset.posretry){const id=t.dataset.posretry;busy.add(id);renderOrders();
    try{const o=await api('/api/orders/'+encodeURIComponent(id)+'/pos-retry',{body:{}});D.orders=D.orders.map(x=>x.id===id?o:x);say('Sent to SambaPOS again.')}catch(err){showError(err.message)}
    busy.delete(id);renderOrders();return}
  if(t.dataset.cancel){
    const id=t.dataset.cancel;
    if(armed!==id){armed=id;renderOrders();setTimeout(()=>{if(armed===id){armed=null;renderOrders()}},5000);return}
    armed=null;busy.add(id);renderOrders();
    try{const o=await api('/api/orders/'+encodeURIComponent(id)+'/cancel',{body:{reason:'Cancelled by Punchbook'}});D.orders=D.orders.map(x=>x.id===id?o:x);say(title(o)+' cancelled.')}catch(err){showError(err.message)}
    busy.delete(id);renderOrders();return;
  }
  if(t.dataset.pause){
    t.disabled=true;
    try{const r=await api('/api/restaurants/'+encodeURIComponent(t.dataset.pause)+'/pause',{body:{paused:t.dataset.paused==='true'}});D.kitchens=D.kitchens.map(k=>k.id===r.id?{...k,accepting:r.accepting}:k)}catch(err){showError(err.message)}
    render();return;
  }
  if(t.dataset.bank){editingBank=t.dataset.bank;if(!appsForCopy)appsForCopy=(await api('/api/accounts/applications').catch(()=>({applications:[]}))).applications;renderRestaurants();document.querySelector('[data-bankform] input')?.focus();return}
  if(t.hasAttribute('data-cancelbank')){editingBank=null;renderRestaurants();return}
  if(t.dataset.app){
    try{openApp=(await api('/api/public/companies/'+encodeURIComponent(t.dataset.app)+'/full')).company;$('app-detail').dataset.id='';renderApps();if(innerWidth<900)$('app-detail').scrollIntoView({behavior:'smooth'})}catch(err){showError(err.message)}
    return;
  }
  if(t.dataset.doc){
    if(demo){t.textContent='Demo: no real file';return}
    const w=window.open('','_blank');
    try{const r=await fetch('/api/public/companies/'+encodeURIComponent(openApp.id)+'/document/'+encodeURIComponent(t.dataset.doc));if(!r.ok)throw Error('Document not found.');w.location=URL.createObjectURL(await r.blob())}
    catch(err){w?.close();showError(err.message)}
    return;
  }
  if(t.dataset.unpay){const days=t.dataset.days.split(','),name=restName(t.dataset.unpay);t.disabled=true;
    try{await setPaid(t.dataset.unpay,days,false);toast(`${esc(name)} moved back to “To send”.`)}catch(err){showError(err.message)}return}
  if(t.id==='histmore'){histMore=!histMore;renderPayouts();return}
  if(t.id==='toast-undo'){const u=toast.undo;$('toast').hidden=true;toast.undo=null;if(u)try{await u()}catch(err){showError(err.message)}return}
  if(t.dataset.sub){paySub=t.dataset.sub;renderPayouts();return}
  if(t.dataset.day&&!t.disabled){payDay=t.dataset.day;if(monthOf(payDay)!==payMonth){payMonth=monthOf(payDay);await loadRange(true)}$('daybar').hidden=true;renderPayouts();return}
  if(t.id==='m-prev'||t.id==='m-next'){const [y,m]=payMonth.split('-').map(Number),d=new Date(Date.UTC(y,m-1+(t.id==='m-next'?1:-1),15));payMonth=d.toISOString().slice(0,7);payDay=null;renderPayouts();await loadRange(true);return}
  if(t.dataset.statement)return statement(t.dataset.statement);
  if(t.id==='daybank')return makeDayBankFile();
  if(t.id==='daypaid'){const rows=(rangeDays().find(d=>d.date===payDay)?.rows||[]).filter(r=>!r.payout&&r.owed>0);t.disabled=true;
    try{await api('/api/accounts/payouts',{body:{date:payDay,restaurantIds:rows.map(r=>r.restaurantId),reference:'Ticked in HQ'}});const day=payDay;await load();await loadRange(true);
      toast(`${plural(rows.length,'restaurant')} marked paid for ${nice(day)}`,async()=>{for(const r of rows)await api('/api/accounts/payouts',{body:{date:day,restaurantId:r.restaurantId,undo:true}});await load();await loadRange(true)})}catch(err){showError(err.message)}return}
  if(t.id==='bankfile')return makeBankFile();
  if(t.id==='markfile')return markFileSent(t);
});
document.addEventListener('change',async e=>{
  if(e.target.id==='pay-rest'){payRest=e.target.value;renderPayouts();await loadRange(true);return}
  const dbox=e.target.closest('[data-dpaid]');
  if(dbox){const id=dbox.dataset.dpaid,day=payDay,r=rangeDays().find(d=>d.date===day)?.rows.find(x=>x.restaurantId===id);dbox.disabled=true;
    try{await setPaid(id,[day],true);toast(`${esc(restName(id))} marked paid for ${nice(day)}${r?' · '+money(r.owed):''}`,()=>setPaid(id,[day],false))}catch(err){dbox.checked=false;dbox.disabled=false;showError(err.message)}return}
  const box=e.target.closest('[data-paid]');
  if(box){const id=box.dataset.paid,r=dueList().find(x=>x.restaurantId===id);if(!r)return;box.disabled=true;
    try{await setPaid(id,r.days,true);toast(`${esc(r.name)} marked paid · ${money(r.owed)}`,()=>setPaid(id,r.days,false))}catch(err){box.checked=false;box.disabled=false;showError(err.message)}return}
  if(e.target.name!=='app')return;const a=(appsForCopy||[]).find(x=>x.id===e.target.value),f=e.target.form;if(!a)return;
  for(const k of ['accountName','bankName','branch','accountNumber'])f[k].value=a[k]||'';
});
document.addEventListener('submit',async e=>{
  const f=e.target;
  if(f.dataset.bankform){e.preventDefault();const msg=f.querySelector('.msg');
    try{await api('/api/accounts/banks',{body:{restaurantId:f.dataset.bankform,accountName:f.accountName.value,bankName:f.bankName.value,branch:f.branch.value,accountNumber:f.accountNumber.value}});editingBank=null;document.activeElement.blur();await load()}
    catch(err){msg.textContent=err.message}return}
  if(f.id==='decide'){e.preventDefault();const msg=$('app-msg');msg.textContent='Saving…';
    try{const r=await api('/api/public/companies/'+encodeURIComponent(openApp.id)+'/status',{method:'PATCH',body:{status:$('app-status').value,adminNotes:$('app-notes').value}});
      openApp={...openApp,status:r.company.status,adminNotes:r.company.adminNotes};D.apps=D.apps.map(c=>c.id===openApp.id?{...c,status:openApp.status}:c);msg.textContent='Saved.';document.activeElement.blur();renderApps();render()}
    catch(err){msg.textContent=err.message}return}
  if(f.id==='settings'){e.preventDefault();
    try{await api('/api/accounts/settings',{body:{commissionPct:Number($('pct').value)}});$('settings-msg').textContent='Saved.';$('pct').blur();await load()}
    catch(err){$('settings-msg').textContent=err.message}}
});

// Bank bulk-transfer file: one transfer per restaurant. entries = [{date, restaurantId}] it covers.
const csvOf=rows=>rows.map(l=>l.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')).join('\r\n');
const download=(text,name)=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type:'text/csv'}));a.download=name;a.click();URL.revokeObjectURL(a.href)};
function bankFile(items,entries,label,barId){
  const ok=items.filter(r=>r.bank),missing=items.filter(r=>!r.bank),stamp=window.pbDemo.colomboDay(),ref=`Punchbook payout ${label}`;
  const bar=$(barId);bar.hidden=false;
  if(!ok.length){bar.innerHTML=`<div class="warn">Add bank details first: ${missing.map(r=>esc(r.name)).join(', ')}.</div>`;return}
  download(csvOf([['Beneficiary name','Account number','Bank','Branch','Amount','Reference'],...ok.map(r=>[r.bank.accountName,r.bank.accountNumber,r.bank.bankName,r.bank.branch||'',r.owed.toFixed(2),ref])]),`punchbook-bank-transfers-${label}${demo?'-DEMO':''}.csv`);
  fileJob=entries.filter(u=>ok.some(r=>r.restaurantId===u.restaurantId));
  bar.innerHTML=`<div><b>File downloaded:</b> ${plural(ok.length,'transfer')}, ${money(ok.reduce((n,r)=>n+r.owed,0))}. Upload it to your bank, approve it, then come back and press the button.</div>
    <div class="row"><input id="fileref" placeholder="Bank batch reference (optional)" aria-label="Bank batch reference"><button type="button" class="btn primary" id="markfile">I’ve paid them: mark ${ok.length} as sent</button></div>
    ${missing.length?`<div class="warn">Left out (no bank details): ${missing.map(r=>esc(r.name)).join(', ')}.</div>`:''}`;
}
function makeBankFile(){
  const due=dueList().filter(r=>payRest==='all'||r.restaurantId===payRest);
  bankFile(due,(D.acc.unpaid||[]).filter(u=>due.some(r=>r.restaurantId===u.restaurantId)),window.pbDemo.colomboDay(),'filebar');
}
function makeDayBankFile(){
  const rows=(rangeDays().find(d=>d.date===payDay)?.rows||[]).filter(r=>!r.payout&&r.owed>0);
  bankFile(rows.map(r=>({restaurantId:r.restaurantId,name:r.name,owed:r.owed,bank:r.bank||(D.acc.banks||{})[r.restaurantId]})),rows.map(r=>({date:payDay,restaurantId:r.restaurantId})),payDay,'daybar');
}
async function markFileSent(btn){
  if(!fileJob)return;btn.disabled=true;const ref=$('fileref').value.trim()||`Punchbook payout ${window.pbDemo.colomboDay()}`;
  try{
    const byDate={};for(const u of fileJob)(byDate[u.date]||=[]).push(u.restaurantId);
    for(const [date,ids] of Object.entries(byDate))await api('/api/accounts/payouts',{body:{date,restaurantIds:ids,reference:ref}});
    fileJob=null;$('filebar').hidden=true;$('daybar').hidden=true;toast('Payouts marked as sent.');await load();await loadRange(true);
  }catch(err){btn.disabled=false;showError(err.message)}
}

// ---------- Tabs
function route(){const t=location.hash.slice(1);tab=['overview','orders','restaurants','payouts','applications','waitlist'].includes(t)?t:'overview';render();scrollTo(0,0);if(tab==='payouts')loadRange();if(tab==='waitlist')loadWaitlist()}
addEventListener('hashchange',route);

window.staffReady.then(me=>{
  if(!me)return;
  if(me.role!=='admin'){location.replace('/restaurant');return}
  $('main').hidden=false;route();load();
  setInterval(()=>{if(!document.hidden)load()},8000);
  setInterval(()=>{if(!document.hidden&&tab==='orders'&&!document.activeElement?.closest('.tab'))renderOrders()},30000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)load()});
});

// ---------- Waitlist (sign-ups from /negombo)
let WL=null;
async function loadWaitlist(){
  if(demo){WL={total:0,top:[],entries:[]};renderWaitlist();return}
  try{WL=await api('/api/waitlist');renderWaitlist()}catch(err){showError(err.message)}
}
function renderWaitlist(){
  if(!WL){$('wl-rows').innerHTML='<tr><td colspan="4">Loading…</td></tr>';return}
  $('wl-count').textContent=`Sign-ups (${WL.total})`;
  $('wl-top').innerHTML=WL.top.length?WL.top.map(t=>`<tr><td>${esc(t.name)}</td><td class="num">${t.votes}</td></tr>`).join(''):'<tr><td colspan="2">No requests yet.</td></tr>';
  $('wl-rows').innerHTML=WL.entries.length?WL.entries.map(e=>`<tr><td>${esc(new Date(e.createdAt).toLocaleString('en-GB',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}))}</td><td>${esc(e.contact)}</td><td>${esc(e.restaurant)}</td><td class="hide-m">${esc(e.source||'')}</td></tr>`).join(''):'<tr><td colspan="4">No sign-ups yet. Share punchbook.online/negombo.</td></tr>';
}
document.addEventListener('click',e=>{
  if(e.target.id!=='wl-csv'||!WL)return;
  const cell=v=>`"${String(v??'').replace(/"/g,'""')}"`;
  const csv=[['Joined','Contact','Type','Restaurant','Area','Source'],...WL.entries.map(x=>[x.createdAt,x.contact,x.kind,x.restaurant,x.area,x.source])].map(r=>r.map(cell).join(',')).join('\n');
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));a.download='punchbook-waitlist.csv';a.click();
});
