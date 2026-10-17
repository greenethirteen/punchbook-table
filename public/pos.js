const $=id=>document.getElementById(id);
const lkr=n=>'LKR '+Number(n).toLocaleString('en-LK');
const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const time=iso=>iso?new Date(iso).toLocaleTimeString([],{hour:'numeric',minute:'2-digit',second:'2-digit'}):'—';
const squareMoney=m=>m?`${(m.amount/(['JPY','KRW'].includes(m.currency)?1:100)).toFixed(['JPY','KRW'].includes(m.currency)?0:2)} ${m.currency}`:'—';
const nextStatus={pickup:{new:'preparing',preparing:'ready',ready:'collected'},table:{new:'preparing',preparing:'served'}};
const stateTone={PROPOSED:'warn',RESERVED:'warn',PREPARED:'ok',COMPLETED:'ok',CANCELED:'bad'};
const TABLE_RESTAURANTS=['peppermint','amra'];
let status=null,menu=[],menuFor='',cart={},orderType='pickup',payMethod='card',busy=new Set(),loading=false;

async function call(url,options={}){
  const response=await fetch(url,{headers:{'Content-Type':'application/json'},...options,body:options.body?JSON.stringify(options.body):undefined});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw Error(data.error||`Request failed (${response.status})`);
  return data;
}
function showError(message){$('error').hidden=!message;$('error').textContent=message||''}
async function act(key,fn){
  if(busy.has(key))return;busy.add(key);render();
  try{showError('');await fn()}catch(e){showError(e.message)}finally{busy.delete(key);await load(true)}
}

function renderStatus(){
  const s=status,ok=s.configured&&s.location&&!s.error;
  $('setup').hidden=s.configured;
  $('connection').textContent=!s.configured?'Not connected':s.error?'Connection error':`Connected · Square ${s.environment}`;
  $('connection').className='pill '+(ok?'ok':s.configured?'bad':'');
  if(s.error)showError('Square: '+s.error);
  const rows=[['Provider','Square'],['Environment',s.environment],['API version',s.apiVersion]];
  if(s.location)rows.push(['Location',`${s.location.name} (${s.location.country})`],['Currency',`${s.location.currency} · LKR ${s.lkrPerUnit} = 1 ${s.location.currency}`]);
  $('conn-details').innerHTML=rows.map(([k,v])=>`<dt>${k}</dt><dd>${escapeHtml(v)}</dd>`).join('');
  $('restaurant').innerHTML=s.restaurants.map(r=>`<option value="${escapeHtml(r.id)}" ${r.id===s.restaurant.id?'selected':''}>${escapeHtml(r.name)}</option>`).join('');
  $('catalog-status').textContent=`${s.catalogCount} of ${s.menuCount} menu items are linked to Square catalog items.${s.catalogCount?'':' Without a sync, orders still go through as custom line items.'}`;
  $('sync').disabled=!ok||busy.has('sync');$('sync').textContent=busy.has('sync')?'Syncing…':s.catalogCount?'Re-sync menu to Square':'Sync menu to Square';
  $('return-details').innerHTML=[['Webhooks',s.webhook?'Signature key set':'Off (needs public HTTPS)'],['Polling',s.configured?`Every 10s · last ${time(s.lastPollAt)}`:'—']].map(([k,v])=>`<dt>${k}</dt><dd>${escapeHtml(v)}</dd>`).join('');
  $('dashboard').href=s.environment==='production'?'https://app.squareup.com/dashboard/orders/overview':'https://developer.squareup.com/console/en/sandbox-test-accounts';
  $('log').innerHTML=s.log.length?s.log.map(l=>`<li><time>${time(l.at)}</time><span class="${l.level==='error'?'error':''}">${escapeHtml(l.message)}</span></li>`).join(''):'<li><span class="hint">Nothing yet. Place a test order to see it flow through.</span></li>';
}

function renderMenu(){
  const tableOk=TABLE_RESTAURANTS.includes(status.restaurant.id);
  if(!tableOk&&orderType==='table')orderType='pickup';
  document.querySelectorAll('[data-type]').forEach(b=>{b.setAttribute('aria-pressed',b.dataset.type===orderType);if(b.dataset.type==='table')b.disabled=!tableOk});
  document.querySelectorAll('[data-pay]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.pay===payMethod));
  $('menu').innerHTML=menu.map(m=>{const q=cart[m.id]||0;return `<div class="pick ${q?'on':''}"><span><b>${escapeHtml(m.name)}</b><small>${lkr(m.price)}</small></span><span class="qty"><button type="button" data-item="${escapeHtml(m.id)}" data-delta="-1" aria-label="Remove ${escapeHtml(m.name)}" ${q?'':'disabled'}>−</button><span aria-live="polite">${q}</span><button type="button" data-item="${escapeHtml(m.id)}" data-delta="1" aria-label="Add ${escapeHtml(m.name)}">+</button></span></div>`}).join('');
  const total=menu.reduce((n,m)=>n+m.price*(cart[m.id]||0),0);
  $('test-total').textContent=total?`${lkr(orderType==='table'?total+Math.round(total*.05):total)}${orderType==='table'?' incl. 5% service':''}`:'Pick items';
  $('place').disabled=!total||busy.has('place');$('place').textContent=busy.has('place')?'Placing…':'Place & pay order';
}

let pbOrders=[],sqOrders=[];
function renderOrders(){
  const r=status.restaurant;
  $('pb-orders').innerHTML=pbOrders.length?pbOrders.map(o=>{
    const type=o.orderType==='pickup'?'pickup':'table',next=nextStatus[type][o.orderStatus],paid=o.paymentStatus==='paid',p=o.pos||{};
    const posTag=p.orderId?`<span class="tag ${stateTone[p.state]||''}">Square: ${escapeHtml(p.state||'synced')}</span>`:p.status==='error'?'<span class="tag bad">Square: failed</span>':`<span class="tag">${paid?'Not in Square':'Waiting for payment'}</span>`;
    const button=next&&paid?`<button type="button" class="small" data-pb="${escapeHtml(o.id)}" data-next="${next}" ${busy.has(o.id)?'disabled':''}>Mark ${next} →</button>`:(!p.orderId&&paid&&status.configured)?`<button type="button" class="small" data-push="${escapeHtml(o.id)}" ${busy.has(o.id)?'disabled':''}>Send to Square</button>`:'';
    return `<article class="row"><div class="row-top"><b>${escapeHtml(o.id)}</b><span>${lkr(o.total)}</span></div>
<p class="meta">${type==='pickup'?`Pickup · ${escapeHtml(o.customer?.name||'Guest')}`:`Table ${escapeHtml(o.table)}`} · ${time(o.createdAt)}</p>
<p class="items">${o.items.map(i=>`${escapeHtml(i.qty)}× ${escapeHtml(i.name)}`).join(', ')}</p>
<div class="tags"><span class="tag ${paid?'ok':'warn'}">${paid?'Paid':'Unpaid'}</span><span class="tag">Punchbook: ${escapeHtml(o.orderStatus)}</span>${posTag}${button}</div>
${p.error?`<p class="err">${escapeHtml(p.error)}</p>`:''}</article>`}).join(''):`<div class="empty">No ${escapeHtml(r.name)} orders yet.</div>`;
  $('sq-orders').innerHTML=!status.configured?'<div class="empty">Connect Square to see its orders here.</div>':sqOrders.length?sqOrders.map(x=>{
    const done=['COMPLETED','CANCELED'].includes(x.fulfillment)||x.state!=='OPEN';
    return `<article class="row"><div class="row-top"><b>${escapeHtml(x.recipient||'Order')}</b><span>${escapeHtml(squareMoney(x.total))}</span></div>
<p class="meta">${escapeHtml(x.id)} · ref ${escapeHtml(x.referenceId||'—')} · ${time(x.createdAt)}</p>
<p class="items">${x.items.map(i=>`${escapeHtml(i.qty)}× ${escapeHtml(i.name)}${i.catalog?'':' (custom)'}`).join(', ')}</p>
<div class="tags"><span class="tag ${x.paid?'ok':'warn'}">${x.paid?'Paid (external)':'Unpaid'}</span><span class="tag">Order: ${escapeHtml(x.state)}</span><span class="tag ${stateTone[x.fulfillment]||''}">Fulfillment: ${escapeHtml(x.fulfillment||'—')}</span>${done?'':`<button type="button" class="small" data-sq="${escapeHtml(x.id)}" ${busy.has(x.id)?'disabled':''}>Advance in Square →</button>`}</div></article>`}).join(''):'<div class="empty">No Punchbook orders in Square yet.</div>';
}
function render(){if(!status)return;renderStatus();renderMenu();renderOrders()}

async function load(force){
  if((loading||document.hidden)&&!force)return;loading=true;
  try{
    status=await call('/api/pos/square/status');
    if(menuFor!==status.restaurant.id){menu=(await call(`/api/pickup/restaurants/${encodeURIComponent(status.restaurant.id)}`)).restaurant.menu;menuFor=status.restaurant.id;cart={}}
    const all=await call('/api/orders');
    pbOrders=all.filter(o=>(o.restaurantId||'peppermint')===status.restaurant.id).slice(0,25);
    sqOrders=status.configured&&status.location?(await call('/api/pos/square/orders')).orders:[];
    render();
  }catch(e){showError(e.message)}finally{loading=false}
}

async function placeOrder(){
  const items=Object.entries(cart).filter(([,q])=>q>0).map(([id,qty])=>({id,qty}));
  const order=orderType==='pickup'
    ?await call('/api/pickup/orders',{method:'POST',body:{restaurantId:status.restaurant.id,items,customer:{name:'POS Test Guest',phone:'+94771234567'},pickupAt:'asap',paymentMethod:payMethod,note:'Test order from the POS bridge console'}})
    :await call('/api/orders',{method:'POST',body:{table:String(1+Math.floor(Math.random()*20)),items,customer:{name:'POS Test Guest'},paymentMethod:payMethod}});
  const paid=payMethod==='justpay'?await call('/api/payments/justpay/simulate',{method:'POST',body:{orderId:order.id}}):await call('/api/payments/card',{method:'POST',body:{orderId:order.id}});
  if(!paid.simulated&&paid.redirectUrl)throw Error('Card payments are going to the live OnePay gateway. Use JustPay for test orders.');
  cart={};
}

document.addEventListener('click',e=>{
  const b=e.target.closest('button');if(!b||b.disabled)return;
  if(b.dataset.item){cart[b.dataset.item]=Math.max(0,(cart[b.dataset.item]||0)+Number(b.dataset.delta));renderMenu()}
  else if(b.dataset.type){orderType=b.dataset.type;renderMenu()}
  else if(b.dataset.pay){payMethod=b.dataset.pay;renderMenu()}
  else if(b.id==='place')act('place',placeOrder);
  else if(b.id==='sync')act('sync',()=>call('/api/pos/square/catalog/sync',{method:'POST'}));
  else if(b.dataset.pb)act(b.dataset.pb,()=>call(`/api/orders/${encodeURIComponent(b.dataset.pb)}/status`,{method:'POST',body:{orderStatus:b.dataset.next}}));
  else if(b.dataset.push)act(b.dataset.push,()=>call(`/api/pos/square/push/${encodeURIComponent(b.dataset.push)}`,{method:'POST'}));
  else if(b.dataset.sq)act(b.dataset.sq,()=>call(`/api/pos/square/orders/${encodeURIComponent(b.dataset.sq)}/advance`,{method:'POST'}));
});
$('restaurant').addEventListener('change',e=>act('link',()=>call('/api/pos/square/link',{method:'POST',body:{restaurantId:e.target.value}})));
document.addEventListener('visibilitychange',()=>load());
load();setInterval(load,5000);
