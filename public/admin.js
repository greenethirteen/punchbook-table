const $=id=>document.getElementById(id);
const money=n=>'LKR '+Number(n).toLocaleString('en-LK');
const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const hm=iso=>iso?new Date(iso).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}):'';
const statusNames={new:'New',preparing:'Preparing',served:'Ready & done'};
const pickupNames={new:'New',preparing:'Preparing',ready:'Ready',collected:'Collected',cancelled:'Cancelled'};
const UNPAID_HIDE_MS=30*60000,LATE_MS=5*60000;
const isDelivery=o=>o.fulfilment==='delivery';
// Delivery orders wait in the last lane once the food is ready (kitchenReadyAt) until the rider has it.
const laneOf=o=>{
  if(o.orderStatus==='cancelled')return'served';
  if(o.orderType!=='pickup')return statusNames[o.orderStatus]?o.orderStatus:'new';
  if(isDelivery(o)&&o.kitchenReadyAt&&o.orderStatus==='preparing')return'served';
  return{new:'new',preparing:'preparing',ready:'served',collected:'served'}[o.orderStatus]||'new';
};
const title=o=>o.orderType==='pickup'?`${isDelivery(o)?'Delivery':'Pickup'} · ${o.customer?.name||'Guest'}`:`Table ${o.table}`;
/** The next step for an order: [status to send, button label], or null when it is finished. */
function nextStep(o){
  if(o.orderStatus==='cancelled')return null;
  if(o.orderType!=='pickup')return{new:['preparing','Start preparing →'],preparing:['served','Mark as served ✓']}[o.orderStatus]||null;
  if(isDelivery(o)){
    if(o.orderStatus==='new')return['preparing','Start preparing →'];
    if(o.orderStatus==='preparing')return o.kitchenReadyAt?['ready','Handed to rider →']:['food_ready','Food ready ✓'];
    if(o.orderStatus==='ready')return['collected','Mark delivered ✓'];
    return null;
  }
  return{new:['preparing','Start preparing →'],preparing:['ready','Ready for pickup ✓'],ready:['collected','Mark collected ✓']}[o.orderStatus]||null;
}
// Delivery progress from the rider page (/rider): who took it, how, and each step's time.
const riderBox=o=>{if(!isDelivery(o)||o.orderStatus==='cancelled')return'';const d=o.dispatch;
  if(!d)return`<div class="rider-box waiting"><b>${o.paymentStatus==='paid'?'Waiting for a rider':'Rider: after payment'}</b><span>No one has accepted this delivery yet.</span></div>`;
  const how=d.method==='pickme'?'Booked a PickMe Flash':'Riding it',steps=[['Accepted',d.assignedAt],['Picked up',d.pickedUpAt],['Delivered',d.deliveredAt]];
  return`<div class="rider-box ${d.status}"><b>${escapeHtml(d.rider?.name)} · <a href="tel:${escapeHtml(d.rider?.phone)}">${escapeHtml(d.rider?.phone)}</a></b><span>${how}${d.courierRef?' · '+escapeHtml(d.courierRef):''}${d.courierCost?' · cost '+money(d.courierCost):''}</span><ol>${steps.map(([label,at])=>`<li class="${at?'done':''}">${at?'✓':'○'} ${label}${at?' '+hm(at):''}</li>`).join('')}</ol></div>`};
function sampleOrders(){
  return [
    [12,'new','paid','card',2,[['Crispy Chicken Burger',1750,2],['Passion Fruit Mojito',790,1]]],
    [8,'new','paid','justpay',4,[['Truffle Chicken Pasta',2350,1],['Iced Spanish Latte',890,1]]],
    [3,'preparing','paid','card',8,[['Pepper Beef Rice',1980,2],['Passion Fruit Mojito',790,2]]],
    [15,'preparing','paid','justpay',11,[['Pesto Penne',1650,1],['Chocolate Lava Cake',1100,1]]],
    [6,'new','pending','card',1,[['Iced Spanish Latte',890,2]]],
    [2,'served','paid','card',22,[['Crispy Chicken Burger',1750,1],['Chocolate Lava Cake',1100,2]]]
  ].map(([table,orderStatus,paymentStatus,paymentMethod,minutes,lines],i)=>{
    const items=lines.map(([name,price,qty])=>({name,price,qty}));const subtotal=items.reduce((n,x)=>n+x.price*x.qty,0);
    return {id:'SAMPLE-'+(i+1),table,orderStatus,paymentStatus,paymentMethod,items,total:subtotal+Math.round(subtotal*.05),createdAt:new Date(Date.now()-minutes*60000).toISOString()};
  });
}
let samples=sampleOrders(),live=[],mode='live',loading=false,seen=null,armed=null,kitchens=[];
const saving=new Set();
// Unpaid orders are only worth showing briefly: most are customers still on the payment page.
const visible=o=>o.paymentStatus==='paid'||o.paymentStatus==='refunded'||o.paymentStatus==='refund_pending'||Date.now()-Date.parse(o.createdAt)<UNPAID_HIDE_MS;
function render(){
  const rows=(mode==='sample'?samples:live).filter(visible);
  $('sample-mode').setAttribute('aria-pressed',String(mode==='sample'));
  $('live-mode').setAttribute('aria-pressed',String(mode==='live'));
  $('notice').textContent=mode==='sample'?'You’re viewing sample orders. Try the status buttons; no restaurant data will change.':'Live orders · Updates automatically.';
  $('reset-samples').hidden=mode!=='sample';
  $('paid-label').textContent=mode==='sample'?'Sample paid total':'Paid order total';
  for(const key of ['new','preparing','served'])$(key+'-count').textContent=rows.filter(o=>laneOf(o)===key&&o.orderStatus!=='cancelled').length;
  $('paid-total').textContent=money(rows.filter(o=>o.paymentStatus==='paid'&&o.orderStatus!=='cancelled').reduce((n,o)=>n+o.total,0));
  const descriptions={new:'Paid · waiting to be started',preparing:'Being made in the kitchen',served:'Ready for pickup or a rider · served · done'};
  const emptyMessages={new:'No new orders waiting.',preparing:'Nothing being prepared.',served:'Finished orders will appear here.'};
  const card=o=>{
    const status=laneOf(o),pickup=o.orderType==='pickup',cancelled=o.orderStatus==='cancelled';
    const pending=o.paymentStatus==='pending';const busy=saving.has(o.id);
    const step=nextStep(o),label=busy?'Updating…':pending?'Awaiting payment':step?.[1];
    const late=!cancelled&&!pending&&o.orderStatus==='new'&&Date.now()-Date.parse(o.paidAt||o.createdAt)>LATE_MS;
    const doneNote=cancelled?`✕ Cancelled${o.cancelReason?' · '+escapeHtml(o.cancelReason):''} · ${o.paymentStatus==='refunded'?'refunded':o.paymentStatus==='refund_pending'?'refund on its way':'not charged'}`
      :pickup?`✓ ${isDelivery(o)?'Delivered':'Collected'} · ${escapeHtml(o.customer?.phone||'')}`:'✓ Served at the table';
    const when=pickup?(isDelivery(o)?`Food ready by ${hm(o.pickupAt)} · arrive ~${hm(o.deliverBy||o.pickupAt)}`:`Pickup ${o.asap?'ASAP · ':''}${hm(o.pickupAt)}`):'';
    const extra=pickup?`<p class="meta">${isDelivery(o)?'📍 '+escapeHtml(o.customer?.address?.line||'—')+(o.customer?.address?.details?' · '+escapeHtml(o.customer.address.details):'')+(o.distanceKm!=null?` · ${o.distanceKm} km`:'')+'<br>':''}${when} · ${escapeHtml(o.restaurantName||'')} · <b>${isDelivery(o)&&o.kitchenReadyAt&&o.orderStatus==='preparing'?'Food ready':pickupNames[o.orderStatus]||'New'}</b> · <a href="tel:${escapeHtml(o.customer?.phone)}">${escapeHtml(o.customer?.phone)}</a>${o.note?'<br>“'+escapeHtml(o.note)+'”':''}</p>${riderBox(o)}`:'';
    const canCancel=mode==='live'&&!cancelled&&!pending&&step&&o.dispatch?.status!=='picked_up';
    const cancel=canCancel?`<button type="button" class="cancel" data-cancel="${escapeHtml(o.id)}" ${busy?'disabled':''}>${armed===o.id?'Tap again: cancel and refund '+money(o.total):'Cancel order'}</button>`:'';
    return `<article class="order ${status}${late?' late':''}${cancelled?' cancelled':''}"><div class="order-head"><h2>${escapeHtml(title(o))}</h2><span class="status">${statusNames[status]}</span></div><p class="meta">${escapeHtml(o.id)} · ${escapeHtml(hm(o.createdAt))}${mode==='sample'?' · Sample':''}${late?` · <b class="late-tag">Waiting ${Math.floor((Date.now()-Date.parse(o.paidAt||o.createdAt))/60000)} min</b>`:''}</p>${extra}<ul class="items">${o.items.map(i=>`<li><span><b>${escapeHtml(i.qty)} ×</b> ${escapeHtml(i.name)}</span><span>${money(i.price*i.qty)}</span></li>`).join('')}${o.deliveryFee?`<li><span>Delivery</span><span>${money(o.deliveryFee)}</span></li>`:''}</ul><div class="order-total"><span>Total</span><span>${money(o.total)}</span></div><p class="payment ${pending?'pending':''}">${pending?'Payment pending':cancelled?'Cancelled':'✓ Paid'} · ${o.paymentMethod==='justpay'?'JustPay':'Card'}</p>${step&&!cancelled?`<button type="button" data-id="${escapeHtml(o.id)}" data-next="${step[0]}" ${busy||pending?'disabled':''}>${label}</button>`:`<div class="served-note">${doneNote}</div>`}${cancel}</article>`;
  };
  $('orders').innerHTML=Object.keys(statusNames).map(status=>{
    const group=rows.filter(o=>laneOf(o)===status)
      .sort((a,b)=>status==='served'?new Date(b.createdAt)-new Date(a.createdAt):new Date(a.createdAt)-new Date(b.createdAt));
    return `<section class="order-lane lane-${status}" aria-labelledby="lane-${status}"><header class="lane-header"><div><h2 id="lane-${status}">${statusNames[status]} <span>${group.length}</span></h2><p>${descriptions[status]}</p></div></header><div class="lane-cards">${group.length?group.map(card).join(''):`<div class="lane-empty">${emptyMessages[status]}</div>`}</div></section>`;
  }).join('');
  $('kitchens').innerHTML=mode==='live'?kitchens.map(k=>`<button type="button" class="pause ${k.accepting?'':'paused'}" data-pause="${escapeHtml(k.id)}" data-paused="${k.accepting?'true':'false'}">${k.accepting?'● Taking orders':'⏸ Paused'}${kitchens.length>1?' · '+escapeHtml(k.name):''} — ${k.accepting?'pause':'resume'}</button>`).join(''):'';
}
async function load(){
  if(loading||document.hidden)return;loading=true;
  try{
    const response=await fetch('/api/orders');if(!response.ok)throw Error('Unable to load live orders.');
    const data=await response.json();if(!Array.isArray(data))throw Error('Unexpected orders response.');
    // Chime for every newly paid order after the first load.
    const paid=new Set(data.filter(o=>o.paymentStatus==='paid'&&o.orderStatus==='new').map(o=>o.id));
    if(seen&&[...paid].some(id=>!seen.has(id)))window.staffAlert?.();
    seen=new Set([...(seen||[]),...paid]);
    const changed=JSON.stringify(data)!==JSON.stringify(live);live=data;
    $('connection').textContent='Connected · Refreshes every 5 seconds';
    if($('error').dataset.kind==='connection'){$('error').hidden=true;$('error').textContent='';}
    if(mode==='live')render();
  }catch(error){$('connection').textContent='Connection unavailable';$('error').dataset.kind='connection';$('error').textContent='Couldn’t refresh live orders. Retrying automatically; sample orders still work.';$('error').hidden=false;}
  finally{loading=false;}
}
async function loadKitchens(){try{const r=await fetch('/api/restaurants/status');if(r.ok){kitchens=(await r.json()).restaurants;render()}}catch{}}
const showError=message=>{$('error').dataset.kind='update';$('error').textContent=message;$('error').hidden=false;};
async function post(url,body){const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const out=await r.json().catch(()=>({}));if(!r.ok)throw Error(out.error||'Update failed');return out}
$('orders').addEventListener('click',async event=>{
  const cancel=event.target.closest('button[data-cancel]');
  if(cancel){
    const id=cancel.dataset.cancel;
    if(armed!==id){armed=id;render();setTimeout(()=>{if(armed===id){armed=null;render()}},5000);return}
    armed=null;saving.add(id);render();
    try{const updated=await post('/api/orders/'+encodeURIComponent(id)+'/cancel',{reason:'Cancelled by the restaurant'});live=live.map(o=>o.id===id?updated:o);$('order-update').textContent=`${title(updated)} cancelled.`;$('error').hidden=true}
    catch(e){showError(e.message)}finally{saving.delete(id);render()}
    return;
  }
  const button=event.target.closest('button[data-id]');if(!button||button.disabled)return;
  const {id,next}=button.dataset;
  if(mode==='sample'){const order=samples.find(o=>o.id===id);if(order){order.orderStatus=next;$('order-update').textContent=`Table ${order.table} moved to ${statusNames[next]}.`;}render();return;}
  saving.add(id);render();
  try{const updated=await post('/api/orders/'+encodeURIComponent(id)+'/status',{orderStatus:next});live=live.map(o=>o.id===id?updated:o);$('order-update').textContent=`${title(updated)} updated.`;$('error').hidden=true;}
  catch(error){showError(error.message==='Update failed'?'Couldn’t update this order. Please try again.':error.message);}
  finally{saving.delete(id);render();}
});
$('kitchens').addEventListener('click',async e=>{
  const b=e.target.closest('[data-pause]');if(!b)return;b.disabled=true;
  try{const r=await post('/api/restaurants/'+encodeURIComponent(b.dataset.pause)+'/pause',{paused:b.dataset.paused==='true'});kitchens=kitchens.map(k=>k.id===r.id?{...k,accepting:r.accepting}:k)}catch(err){showError(err.message)}
  render();
});
for(const selected of ['live','sample'])$(selected+'-mode').addEventListener('click',()=>{mode=selected;render();});
$('reset-samples').addEventListener('click',()=>{samples=sampleOrders();render();});
$('qr-form').addEventListener('submit',event=>{
  event.preventDefault();
  if(!event.target.reportValidity())return;
  const table=encodeURIComponent($('qr-table').value);
  if(event.submitter?.value==='menu')window.open('/peppermint/t/'+table,'_blank','noopener,noreferrer');
  else location.href='/qr?table='+table;
});
window.staffReady?.then(me=>{if(!me)return;$('restaurant-name').innerHTML=me.role==='admin'?'All restaurants <span>Punchbook admin</span>':`${escapeHtml(me.restaurantName)} <span>${escapeHtml(me.restaurantArea||'')}</span>`;loadKitchens();load();});
render();setInterval(load,5000);setInterval(()=>{if(mode==='live')render()},30000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)load();});
