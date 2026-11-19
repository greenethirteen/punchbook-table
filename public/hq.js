// Punchbook HQ (/hq): the admin's one screen. Overview, Orders, Restaurants, Payouts, Applications.
// Live reads the real server; Demo answers the same calls from demo-data.js and changes nothing.
// Restaurant staff (restaurant keys) are sent to their own order screen at /admin.
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
}
function pulse(){
  const p=$('pulse'),fresh=lastOk&&Date.now()-lastOk<30000;
  p.className='pulse '+(fresh?'on':lastOk===null&&!loadedOnce?'':'off');
  p.querySelector('span').textContent=demo?'Demo data':fresh?'Live · '+Math.max(0,Math.round((Date.now()-lastOk)/1000))+'s ago':'Offline';
}
setInterval(pulse,1000);
function reset(){D={orders:[],kitchens:[],bridges:{},acc:null,apps:[],history:[]};lastOk=null;seen=null;armed=null;editingBank=null;appsForCopy=null;openApp=null;fileJob=null}

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
  const H={overview:['Command centre','Overview','Today across every restaurant'],orders:['Kitchen','Orders','New, cooking and done, as it happens'],restaurants:['Network','Restaurants','Who’s open, their till and their bank'],payouts:['Money · T+2','Payouts','Each day is paid two days later'],applications:['Onboarding','Applications','Restaurants that want to join']}[tab];
  $('kicker').textContent=H[0];$('page-title').textContent=H[1];$('page-sub').textContent=H[2];document.title=H[1]+' · Punchbook HQ';
  document.querySelectorAll('.tab').forEach(s=>s.hidden=s.id!=='tab-'+tab);
  $('demo-note').hidden=!demo;
  const waiting=D.orders.filter(o=>isPaid(o)&&o.orderStatus==='new').length,due=dueList(),toReview=D.apps.filter(c=>c.status==='submitted').length;
  badge('b-orders',waiting);badge('b-payouts',due.length);badge('b-apps',toReview);
  if(!loadedOnce)return;
  // Don't redraw a tab while someone is typing in it.
  const typing=document.activeElement?.closest?.('.tab form, .tab textarea, .filebar');
  if(typing&&!typing.closest('#tab-orders'))return;
  ({overview:renderOverview,orders:renderOrders,restaurants:renderRestaurants,payouts:renderPayouts,applications:renderApps})[tab]();
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
  const main=step&&!cancelled?`<button type="button" class="btn ${o.orderStatus==='new'?'primary':''}" data-step="${esc(o.id)}" data-next="${step[0]}" ${b||pending?'disabled':''}>${b?'Updating…':pending?'Waiting for payment':step[1]}</button>`:'';
  const canCancel=!cancelled&&!pending&&step&&o.dispatch?.status!=='picked_up';
  const cancel=canCancel?`<button type="button" class="btn small danger" data-cancel="${esc(o.id)}" ${b?'disabled':''}>${armed===o.id?'Tap again to cancel & refund':'Cancel'}</button>`:'';
  const done=!step&&!cancelled?`<div class="done">✓ ${kind(o)==='table'?'Served':isDelivery(o)?(o.orderStatus==='collected'?'Delivered':'With the rider'):'Collected'}</div>`:'';
  return`<article class="order${late?' late':''}${cancelled?' cancelled':''}"><div class="order-top"><b>${esc(title(o))}</b><time datetime="${esc(o.createdAt)}">${ago(o.paidAt||o.createdAt)}</time></div>
    <div class="where">${esc(o.restaurantName||restName(o.restaurantId))} · ${esc(o.id)}</div><div class="tags">${tags.join('')}</div>
    <ul>${o.items.map(i=>`<li><span>${esc(i.qty)} × ${esc(i.name)}</span><span>${money(i.price*i.qty)}</span></li>`).join('')}${o.deliveryFee?`<li><span>Delivery</span><span>${money(o.deliveryFee)}</span></li>`:''}</ul>
    <div class="total"><span>Total</span><span>${money(o.total)}</span></div>${extra}${done}${main||cancel?`<div class="acts">${main}${cancel}</div>`:''}</article>`;
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
function renderPayouts(){
  const due=dueList(),total=due.reduce((n,r)=>n+r.owed,0);
  const when=r=>r.overdue?`<span class="pill bad">Overdue · was due ${nice(r.dueBy)}</span>`:r.dueToday?'<span class="pill warn">Due today</span>':`<span class="pill info">Due ${nice(r.dueBy)}</span>`;
  $('due').innerHTML=due.length?`<div class="due">${due.map(r=>`<div class="due-row${r.overdue?' overdue':''}">
      <label class="tick" title="Mark ${esc(r.name)} as paid"><input type="checkbox" data-paid="${esc(r.restaurantId)}" aria-label="Mark ${esc(r.name)} as paid">${TICK}</label>
      <div><b>${esc(r.name)}</b><small>Sales from ${range(r.days)}</small></div>
      <div>${r.bank?`${esc(r.bank.bankName)} <span class="mono">••••${esc(String(r.bank.accountNumber).slice(-4))}</span><small>${esc(r.bank.accountName)}</small>`:'<span class="pill warn">No bank details</span><small><a href="#restaurants">Add them in Restaurants</a></small>'}</div>
      <div class="amt">${money(r.owed)}<small>${when(r)}</small></div></div>`).join('')}</div><div class="due-total"><span>Left to send</span><b>${money(total)}</b></div>`
    :'<div class="empty">Nothing left to send. Everyone is paid up.</div>';
  $('bankfile').disabled=!due.some(r=>r.bank);
  // Sent: one line per restaurant per payment (days paid together are grouped).
  const groups=[];
  for(const p of D.history){const g=groups.find(x=>x.restaurantId===p.restaurantId&&x.sentAt.slice(0,16)===String(p.sentAt).slice(0,16)&&x.reference===(p.reference||''));
    if(g){g.amount+=p.amount;g.days.push(p.date)}else groups.push({restaurantId:p.restaurantId,name:p.name,sentAt:String(p.sentAt),reference:p.reference||'',amount:p.amount,days:[p.date]})}
  const shown=histMore?groups:groups.slice(0,8);
  $('history').innerHTML=groups.length?shown.map(g=>`<div class="hrow"><span class="when">${new Date(g.sentAt).toLocaleString([],{day:'numeric',month:'short',hour:'numeric',minute:'2-digit'})}</span>
      <div><b>${esc(g.name)}</b><small>Sales from ${range(g.days.sort())}</small></div><div><small>${g.reference?'Ref '+esc(g.reference):'No reference'}</small></div>
      <span class="amt">${money(Math.round(g.amount*100)/100)}</span><button type="button" class="linkbtn" data-unpay="${esc(g.restaurantId)}" data-days="${esc(g.days.join(','))}">Undo</button></div>`).join('')
      +(groups.length>8?`<div class="more"><button type="button" class="btn small ghost" id="histmore">${histMore?'Show less':'Show all '+groups.length}</button></div>`:'')
    :'<div class="empty">Nothing marked as sent yet.</div>';
  const rows=D.acc?.rows||[];
  $('today-pay').innerHTML=rows.length?rows.map(r=>`<tr><td><b>${esc(r.name)}</b><small>Due ${nice(dueOn(D.acc.date))}</small></td><td class="num">${r.orders}</td><td class="num">${money(r.food)}</td><td class="num">− ${money(r.commission)}</td><td class="num"><b>${money(r.owed)}</b></td></tr>`).join('')
    :'<tr><td colspan="5" class="empty">No paid orders yet today.</td></tr>';
  if(document.activeElement!==$('pct')&&D.acc)$('pct').value=D.acc.commissionPct;
}
function toast(msg,undo){
  const t=$('toast');clearTimeout(toast.timer);t.hidden=false;t.innerHTML=`<span>${msg}</span>${undo?'<button type="button" id="toast-undo">Undo</button>':''}`;
  toast.undo=undo;toast.timer=setTimeout(()=>{t.hidden=true;toast.undo=null},7000);
}
async function setPaid(restaurantId,days,paid){
  for(const date of days)await api('/api/accounts/payouts',paid?{body:{date,restaurantIds:[restaurantId],reference:'Ticked in HQ'}}:{body:{date,restaurantId,undo:true}});
  await load();
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
  if(t.id==='bankfile')return makeBankFile();
  if(t.id==='markfile')return markFileSent(t);
});
document.addEventListener('change',async e=>{
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

// Bank bulk-transfer file: one transfer per restaurant for everything owed from earlier days.
const csvOf=rows=>rows.map(l=>l.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')).join('\r\n');
function makeBankFile(){
  const due=dueList(),ok=due.filter(r=>r.bank),missing=due.filter(r=>!r.bank),stamp=window.pbDemo.colomboDay();
  const ref=`Punchbook payout ${stamp}`;
  const csv=csvOf([['Beneficiary name','Account number','Bank','Branch','Amount','Reference'],...ok.map(r=>[r.bank.accountName,r.bank.accountNumber,r.bank.bankName,r.bank.branch||'',r.owed.toFixed(2),ref])]);
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));a.download=`punchbook-bank-transfers-${stamp}${demo?'-DEMO':''}.csv`;a.click();URL.revokeObjectURL(a.href);
  fileJob=(D.acc.unpaid||[]).filter(u=>ok.some(r=>r.restaurantId===u.restaurantId));
  const total=ok.reduce((n,r)=>n+r.owed,0),bar=$('filebar');bar.hidden=false;
  bar.innerHTML=`<div><b>File downloaded:</b> ${plural(ok.length,'transfer')}, ${money(total)}. Upload it to your bank, approve it, then come back and press the button.</div>
    <div class="row"><input id="fileref" placeholder="Bank batch reference (optional)" aria-label="Bank batch reference"><button type="button" class="btn primary" id="markfile">I’ve paid them: mark ${ok.length} as sent</button></div>
    ${missing.length?`<div class="warn">Left out (no bank details): ${missing.map(r=>esc(r.name)).join(', ')}.</div>`:''}`;
}
async function markFileSent(btn){
  if(!fileJob)return;btn.disabled=true;const ref=$('fileref').value.trim()||`Punchbook payout ${window.pbDemo.colomboDay()}`;
  try{
    const byDate={};for(const u of fileJob)(byDate[u.date]||=[]).push(u.restaurantId);
    for(const [date,ids] of Object.entries(byDate))await api('/api/accounts/payouts',{body:{date,restaurantIds:ids,reference:ref}});
    fileJob=null;$('filebar').hidden=true;say('Payouts marked as sent.');await load();
  }catch(err){btn.disabled=false;showError(err.message)}
}

// ---------- Tabs
function route(){const t=location.hash.slice(1);tab=['overview','orders','restaurants','payouts','applications'].includes(t)?t:'overview';render();scrollTo(0,0)}
addEventListener('hashchange',route);

window.staffReady.then(me=>{
  if(!me)return;
  if(me.role!=='admin'){location.replace('/admin');return}
  $('main').hidden=false;route();load();
  setInterval(()=>{if(!document.hidden)load()},8000);
  setInterval(()=>{if(!document.hidden&&tab==='orders'&&!document.activeElement?.closest('.tab'))renderOrders()},30000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)load()});
});
