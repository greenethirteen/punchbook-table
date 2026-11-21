// A restaurant's own page (/restaurant): Live orders, Payments (each paid order, the card fee and what
// they get) and Earnings (day by day, paid T+2). Restaurant keys see only their restaurant; the admin picks
// one (?restaurant=) and can switch to Demo. Uses the same API as HQ, scoped by staff.js on the server.
const $=id=>document.getElementById(id);
const money=n=>{const v=Math.round(Number(n||0)*100)/100;return'LKR '+v.toLocaleString('en-LK',{minimumFractionDigits:v%1?2:0,maximumFractionDigits:2})};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const hm=iso=>iso?new Date(iso).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'}):'';
const minsAgo=iso=>Math.max(0,Math.floor((Date.now()-Date.parse(iso))/60000));
const ago=iso=>{const m=minsAgo(iso);return m<1?'just now':m<60?m+' min ago':hm(iso)};
const nice=d=>new Date(d+'T12:00:00').toLocaleDateString([],{weekday:'short',day:'numeric',month:'short'});
const short=d=>new Date(d+'T12:00:00').toLocaleDateString([],{day:'numeric',month:'short'});
const addDays=(d,n)=>new Date(Date.parse(d+'T12:00:00Z')+n*864e5).toISOString().slice(0,10);
const colomboDay=iso=>window.pbDemo.colomboDay(new Date(iso));
const round=n=>Math.round(n*100)/100;
const plural=(n,w)=>`${n} ${w}${n===1?'':'s'}`;
const LATE_MIN=5,UNPAID_HIDE_MIN=30;

const params=new URLSearchParams(location.search);
let demo=window.pbMode()==='demo',me=null,pick=params.get('restaurant')||'',tab='orders';
let orders=[],kitchen=null,acc=null,lastOk=null,seen=null,armed=null,fType='all',payDay=null,loaded=false;
const busy=new Set();

async function api(path,{body}={}){
  if(demo)return window.pbDemo.api(path,body);
  const res=await fetch(path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json'},body:body&&JSON.stringify(body)});
  const out=await res.json().catch(()=>({}));
  if(!res.ok)throw Error(out.error||'Something went wrong. Please try again.');
  return out;
}
const showError=m=>{$('error').textContent=m;$('error').hidden=!m};

// ---------- Loading
async function load(){
  const [o,k,a]=await Promise.allSettled([api('/api/orders'),api('/api/restaurants/status'),api('/api/accounts/mine'+(pick?'?restaurant='+encodeURIComponent(pick):''))]);
  if(a.status==='fulfilled'){acc=a.value;pick||=acc.restaurant.id}
  const rid=acc?.restaurant.id;
  if(o.status==='fulfilled'&&Array.isArray(o.value)){
    const mine=o.value.filter(x=>x.restaurantId===rid);
    const paidNew=new Set(mine.filter(x=>x.paymentStatus==='paid'&&x.orderStatus==='new').map(x=>x.id));
    if(!demo&&seen&&[...paidNew].some(id=>!seen.has(id)))window.staffAlert?.();
    seen=new Set([...(seen||[]),...paidNew]);orders=mine;
  }
  if(k.status==='fulfilled')kitchen=(k.value.restaurants||[]).find(r=>r.id===rid)||null;
  const failed=[o,a].find(r=>r.status==='rejected');
  showError(failed?'Couldn’t reach Punchbook: '+failed.reason.message+' Retrying…':'');
  if(!failed)lastOk=Date.now();
  loaded=true;pulse();render();
}
function pulse(){
  const p=$('pulse'),fresh=lastOk&&Date.now()-lastOk<30000;
  p.className='pulse '+(fresh?'on':loaded?'off':'');
  p.querySelector('span').textContent=demo?'Demo data':fresh?'Live · '+Math.max(0,Math.round((Date.now()-lastOk)/1000))+'s ago':loaded?'Offline':'Connecting…';
}
setInterval(pulse,1000);

// ---------- Money: what the restaurant gets from one order (same rule as accounts.js)
const pct=()=>acc?.commissionPct??3;
const base=o=>(Number(o.subtotal)||0)+(Number(o.service)||0);
const fee=o=>round(base(o)*pct()/100);
// A sandbox restaurant (the demo) only has test payments, and they count on its page.
const counts=o=>o.paymentStatus==='paid'&&o.orderStatus!=='cancelled'&&(o.testPayment===false||Boolean(acc?.restaurant.sandbox));
const paidDay=o=>colomboDay(o.paidAt||o.createdAt);

// ---------- Orders (same steps as HQ and /admin)
const isDelivery=o=>o.fulfilment==='delivery';
const kind=o=>o.orderType!=='pickup'?'table':isDelivery(o)?'delivery':'pickup';
const title=o=>kind(o)==='table'?`Table ${o.table}`:`${isDelivery(o)?'Delivery':'Pickup'} · ${o.customer?.name||'Guest'}`;
const laneOf=o=>{
  if(o.orderStatus==='cancelled')return'done';
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

// ---------- Render
function render(){
  document.querySelectorAll('[data-mode]').forEach(b=>b.setAttribute('aria-pressed',String((b.dataset.mode==='demo')===demo)));
  document.querySelectorAll('[data-tab]').forEach(a=>a.dataset.tab===tab?a.setAttribute('aria-current','page'):a.removeAttribute('aria-current'));
  document.querySelectorAll('.tab').forEach(s=>s.hidden=s.id!=='tab-'+tab);
  $('demo-note').hidden=!demo;
  if(!acc)return;
  $('sandbox-note').hidden=!acc.restaurant.sandbox||demo;
  const R=acc.restaurant;
  $('kicker').textContent={orders:'Live orders',payments:'Payments',earnings:'Earnings'}[tab];
  $('title').textContent=R.name;document.title=R.name+' · Punchbook';
  $('sub').textContent=acc.bank?`Paid to ${acc.bank.bankName} ••••${acc.bank.last4}`:'Bank account not set up yet. Ask Punchbook to add it.';
  if(acc.restaurants&&me.role==='admin'){$('picker-wrap').hidden=false;$('picker').innerHTML=acc.restaurants.map(r=>`<button type="button" data-pick="${esc(r.id)}" aria-pressed="${r.id===R.id}">${esc(r.name)}</button>`).join('')}
  const pb=$('pause');pb.hidden=!kitchen;
  if(kitchen){pb.textContent=kitchen.accepting?'Pause new orders':'Resume orders';pb.className='btn small '+(kitchen.accepting?'ghost':'primary');pb.dataset.paused=String(kitchen.accepting)}
  const waiting=orders.filter(o=>isPaid(o)&&o.orderStatus==='new').length,late=acc.days.filter(d=>d.status==='overdue').length;
  $('b-orders').hidden=!waiting;$('b-orders').textContent=waiting;$('b-earn').hidden=!late;$('b-earn').textContent=late;
  // Don't redraw while a button is mid-tap or someone is typing.
  ({orders:renderOrders,payments:renderPayments,earnings:renderEarnings})[tab]();
}
const tiles=(id,list)=>{$(id).innerHTML=list.map(([c,l,v,s])=>`<div class="tile ${c}"><span><i></i>${l}</span><strong>${esc(v)}</strong><small>${esc(s)}</small></div>`).join('')};

function renderOrders(){
  const today=acc.today,todays=orders.filter(o=>counts(o)&&paidDay(o)===today);
  const cooking=orders.filter(o=>isPaid(o)&&laneOf(o)!=='done'),waiting=cooking.filter(o=>o.orderStatus==='new');
  const sales=todays.reduce((n,o)=>n+base(o),0),get=todays.reduce((n,o)=>n+base(o)-fee(o),0);
  tiles('o-tiles',[
    [waiting.some(isLate)?'rose':'orange','Waiting to start',waiting.length,waiting.some(isLate)?'someone has waited 5+ min':waiting.length?'tap Start cooking':'all started'],
    ['blue','In the kitchen',cooking.length-waiting.length,'cooking now'],
    ['purple','Orders today',todays.length,money(sales)+' in sales'],
    ['green','You get today',money(get),`after ${pct()}% card fee · paid ${nice(addDays(today,acc.settleDays))}`],
  ]);
  $('f-type').innerHTML=[['all','All'],['table','Table'],['pickup','Pickup'],['delivery','Delivery']].map(([v,l])=>`<button type="button" data-ftype="${v}" aria-pressed="${fType===v}">${l}</button>`).join('');
  const list=orders.filter(visible).filter(o=>fType==='all'||kind(o)===fType);
  const lanes=[['new','New','No new orders.'],['cooking','Cooking','Nothing cooking.'],['done','Done','Finished orders show here.']];
  $('board').innerHTML=lanes.map(([key,label,empty])=>{
    let group=list.filter(o=>laneOf(o)===key).sort((a,b)=>key==='done'?Date.parse(b.createdAt)-Date.parse(a.createdAt):Date.parse(a.createdAt)-Date.parse(b.createdAt));
    if(key==='done')group=group.filter(o=>paidDay(o)===today||colomboDay(o.createdAt)===today).slice(0,15);
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
    <div class="where">${esc(o.id)}</div><div class="tags">${tags.join('')}</div>
    <ul>${o.items.map(i=>`<li><span>${esc(i.qty)} × ${esc(i.name)}</span><span>${money(i.price*i.qty)}</span></li>`).join('')}${o.deliveryFee?`<li><span>Delivery</span><span>${money(o.deliveryFee)}</span></li>`:''}</ul>
    <div class="total"><span>Total</span><span>${money(o.total)}</span></div>${extra}${done}${main||cancel?`<div class="acts">${main}${cancel}</div>`:''}</article>`;
}

// ---------- Payments: every order on a day, the card fee and what the restaurant gets
function dayStatus(d){return acc.days.find(x=>x.date===d)}
function payLine(d){
  const row=dayStatus(d),due=addDays(d,acc.settleDays);
  if(row?.status==='paid')return[`Paid to you ${short(row.payout.sentAt.slice(0,10))}${row.payout.reference?' · ref '+row.payout.reference:''}`,'good'];
  if(d===acc.today)return[`Day still open · paid ${nice(due)}`,'plain'];
  if(due<acc.today)return[`Late · was due ${nice(due)}`,'bad'];
  if(due===acc.today)return['Being paid today','warn'];
  return[`Coming ${nice(due)}`,'info'];
}
function renderPayments(){
  const t=acc.today;payDay||=t;
  const days=[];for(let i=0;i<7;i++)days.push(addDays(t,-i));
  $('p-days').innerHTML=days.map((d,i)=>`<button type="button" data-pday="${d}" aria-pressed="${d===payDay}">${i===0?'Today':i===1?'Yesterday':short(d)}</button>`).join('');
  const list=orders.filter(o=>o.paymentStatus!=='pending'&&paidDay(o)===payDay).sort((a,b)=>Date.parse(b.paidAt||b.createdAt)-Date.parse(a.paidAt||a.createdAt));
  const real=list.filter(counts),sales=real.reduce((n,o)=>n+base(o),0),fees=real.reduce((n,o)=>n+fee(o),0),[pl,pc]=payLine(payDay);
  tiles('p-tiles',[
    ['purple','Paid orders',real.length,list.length>real.length?`${list.length-real.length} cancelled or test, not counted`:payDay===t?'so far today':nice(payDay)],
    ['blue','Guests paid',money(sales),'food and service charge'],
    ['orange',`Card fee · ${pct()}%`,'− '+money(round(fees)),'taken by the card payment'],
    ['green','You get',money(round(sales-fees)),pl],
  ]);
  $('p-title').textContent=payDay===t?'Today’s payments':nice(payDay);
  $('p-help').innerHTML=`<span class="pill ${pc}">${esc(pl)}</span> Each day is paid to your bank ${acc.settleDays} days later (T+${acc.settleDays}).`;
  const status=o=>o.orderStatus==='cancelled'?`<span class="pill bad">${o.paymentStatus==='refunded'?'Refunded':o.paymentStatus==='refund_pending'?'Refund on its way':'Cancelled'}</span>`
    :o.testPayment!==false?(acc.restaurant.sandbox?'<span class="pill good">Paid · test</span>':'<span class="pill plain">Test</span>'):'<span class="pill good">Paid</span>';
  $('p-rows').innerHTML=list.length?list.map(o=>{const c=counts(o);return`<tr${c?'':' class="muted"'}><td style="white-space:nowrap">${hm(o.paidAt||o.createdAt)}</td>
      <td><b>${esc(title(o))}</b><small>${esc(o.id)} · ${plural(o.items.reduce((n,i)=>n+Number(i.qty||1),0),'item')}</small></td><td class="hide-m">${{table:'Table',pickup:'Pickup',delivery:'Delivery'}[kind(o)]}</td>
      <td class="num">${money(base(o))}</td><td class="num hide-m">${c?'− '+money(fee(o)):'—'}</td><td class="num"><b>${c?money(round(base(o)-fee(o))):'—'}</b></td><td>${status(o)}</td></tr>`}).join('')
    :`<tr><td colspan="7" class="empty">No payments ${payDay===t?'yet today':'on this day'}.</td></tr>`;
  $('p-foot').innerHTML=real.length?`<tr><td colspan="2">Total · ${plural(real.length,'order')}</td><td class="hide-m"></td><td class="num">${money(sales)}</td><td class="num hide-m">− ${money(round(fees))}</td><td class="num">${money(round(sales-fees))}</td><td></td></tr>`:'';
}

// ---------- Earnings: day by day and when each day is paid
function payment(d){
  if(d.status==='paid')return`<span class="pill good">Paid ${short(d.payout.sentAt.slice(0,10))}</span>${d.payout.reference?`<small>Ref ${esc(d.payout.reference)}</small>`:''}`;
  if(d.status==='today')return`<span class="pill plain">Day still open</span><small>Paid ${nice(d.dueDate)}</small>`;
  if(d.status==='overdue')return`<span class="pill bad">Late · was due ${short(d.dueDate)}</span>`;
  if(d.status==='due')return'<span class="pill warn">Being paid today</span>';
  return`<span class="pill info">Coming ${nice(d.dueDate)}</span>`;
}
function renderEarnings(){
  const days=acc.days,sum=(l,k)=>l.reduce((n,d)=>n+d[k],0);
  $('rule').textContent=`Each day is paid ${acc.settleDays} days later (T+${acc.settleDays}). The card fee is ${acc.commissionPct}% of what guests paid.`;
  const paid=days.filter(d=>d.status==='paid'),waiting=days.filter(d=>d.status!=='paid'&&d.status!=='today');
  const next=[...waiting].sort((a,b)=>a.dueDate.localeCompare(b.dueDate)),nextDate=next[0]?.dueDate,nextAmt=sum(next.filter(d=>d.dueDate===nextDate),'owed');
  const todayRow=days.find(d=>d.status==='today'),late=waiting.filter(d=>d.status==='overdue');
  tiles('e-tiles',[
    ['green','Paid to you · 30 days',money(round(sum(paid,'owed'))),`${plural(paid.length,'day')} paid`],
    [late.length?'rose':'orange','Waiting to be paid',money(round(sum(waiting,'owed'))),late.length?`${late.length} late, Punchbook has been alerted`:waiting.length?plural(waiting.length,'day'):'nothing waiting'],
    ['blue','Next payment',nextDate?money(round(nextAmt)):'—',nextDate?(nextDate<=acc.today?'due now':nice(nextDate)):'nothing scheduled'],
    ['purple','Today so far',money(todayRow?.owed),todayRow?`${todayRow.orders} orders · paid ${nice(todayRow.dueDate)}`:'no paid orders yet'],
  ]);
  const span=[];for(let i=13;i>=0;i--){const d=addDays(acc.today,-i);span.push(days.find(x=>x.date===d)||{date:d,owed:0,status:'none'})}
  const max=Math.max(1,...span.map(d=>d.owed));
  $('bars').innerHTML=span.map(d=>`<div class="${d.status==='paid'?'':['due','overdue'].includes(d.status)?'due':'soon'}" data-tip="${short(d.date)} · ${money(d.owed)}"><i style="height:${Math.round(d.owed/max*100)}%"></i></div>`).join('');
  $('bar-labels').innerHTML=span.map((d,i)=>`<span>${i%2?'':short(d.date)}</span>`).join('');
  $('e-rows').innerHTML=days.length?days.map(d=>`<tr data-open="${d.date}" class="clickable"><td style="white-space:nowrap"><b>${short(d.date)}</b></td><td class="num hide-m">${d.orders}</td><td class="num hide-m">${money(d.food+d.service)}</td><td class="num hide-m">− ${money(d.commission)}</td><td class="num"><b>${money(d.owed)}</b></td><td>${payment(d)}</td></tr>`).join('')
    :'<tr><td colspan="6" class="empty">No paid orders in the last 30 days.</td></tr>';
  $('e-foot').innerHTML=days.length?`<tr><td>30 days</td><td class="num hide-m">${sum(days,'orders')}</td><td class="num hide-m">${money(sum(days,'food')+sum(days,'service'))}</td><td class="num hide-m">− ${money(round(sum(days,'commission')))}</td><td class="num">${money(round(sum(days,'owed')))}</td><td></td></tr>`:'';
}

// ---------- Actions
document.addEventListener('click',async e=>{
  const row=e.target.closest('tr[data-open]');
  if(row){const d=row.dataset.open;if(d>=addDays(acc.today,-6)){payDay=d;location.hash='payments'}return}
  const t=e.target.closest('button');if(!t)return;
  if(t.dataset.mode){const want=t.dataset.mode==='demo';if(want===demo)return;demo=want;window.pbSetMode(demo?'demo':'live');orders=[];acc=null;seen=null;loaded=false;render();await load();return}
  if(t.dataset.pick){pick=t.dataset.pick;history.replaceState(null,'','/restaurant?restaurant='+encodeURIComponent(pick)+location.hash);seen=null;await load();return}
  if(t.dataset.ftype){fType=t.dataset.ftype;renderOrders();return}
  if(t.dataset.pday){payDay=t.dataset.pday;renderPayments();return}
  if(t.id==='pause'){t.disabled=true;
    try{const r=await api('/api/restaurants/'+encodeURIComponent(acc.restaurant.id)+'/pause',{body:{paused:t.dataset.paused==='true'}});kitchen={...kitchen,accepting:r.accepting}}catch(err){showError(err.message)}
    t.disabled=false;render();return}
  if(t.dataset.step){
    const id=t.dataset.step;busy.add(id);renderOrders();
    try{const o=await api('/api/orders/'+encodeURIComponent(id)+'/status',{body:{orderStatus:t.dataset.next}});orders=orders.map(x=>x.id===id?o:x);$('live-status').textContent=title(o)+' updated.'}catch(err){showError(err.message)}
    busy.delete(id);render();return;
  }
  if(t.dataset.cancel){
    const id=t.dataset.cancel;
    if(armed!==id){armed=id;renderOrders();setTimeout(()=>{if(armed===id){armed=null;renderOrders()}},5000);return}
    armed=null;busy.add(id);renderOrders();
    try{const o=await api('/api/orders/'+encodeURIComponent(id)+'/cancel',{body:{reason:'Cancelled by the restaurant'}});orders=orders.map(x=>x.id===id?o:x);$('live-status').textContent=title(o)+' cancelled and refunded.'}catch(err){showError(err.message)}
    busy.delete(id);render();return;
  }
});

function route(){const h=location.hash.slice(1);tab=['orders','payments','earnings'].includes(h)?h:'orders';render();scrollTo(0,0)}
addEventListener('hashchange',route);

window.staffReady.then(m=>{
  if(!m)return;me=m;$('main').hidden=false;
  if(me.role==='admin')$('hq-link').hidden=false;
  else{document.querySelector('.mode').hidden=true;demo=false}
  route();load();
  setInterval(()=>{if(!document.hidden&&!busy.size&&!armed)load()},8000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)load()});
});
