const $=id=>document.getElementById(id);
const money=n=>'LKR '+Number(n).toLocaleString('en-LK');
const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const time=iso=>new Date(iso).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});
const lanes={new:'New',preparing:'Preparing',ready:'Ready for pickup',collected:'Collected'};
const descriptions={new:'Paid and waiting to be accepted',preparing:'Being made in the kitchen',ready:'Waiting at the counter · customer notified',collected:'Handed over to the customer'};
const emptyMessages={new:'No new pickup orders.',preparing:'Nothing being prepared.',ready:'Nothing waiting at the counter.',collected:'Collected orders will appear here.'};
const actions={new:['preparing','Start preparing →'],preparing:['ready','Mark ready for pickup ✓'],ready:['collected','Handed over ✓']};
let orders=[],restaurants=[],restaurant=new URLSearchParams(location.search).get('restaurant')||'all',loading=false;
const saving=new Set();
function renderFilters(){
  $('restaurants').innerHTML=[{id:'all',name:'All restaurants'},...restaurants].map(r=>`<button type="button" data-restaurant="${escapeHtml(r.id)}" aria-pressed="${r.id===restaurant}">${escapeHtml(r.name)}</button>`).join('');
}
function render(){
  const rows=orders.filter(o=>restaurant==='all'||o.restaurantId===restaurant);
  for(const key of ['new','preparing','ready'])$(key+'-count').textContent=rows.filter(o=>o.orderStatus===key).length;
  $('paid-total').textContent=money(rows.filter(o=>o.paymentStatus==='paid').reduce((n,o)=>n+o.total,0));
  const card=o=>{
    const status=lanes[o.orderStatus]?o.orderStatus:'new',pending=o.paymentStatus!=='paid',busy=saving.has(o.id),[next,label]=actions[status]||[];
    const button=status==='collected'?'<div class="served-note">✓ Collected</div>':`<button type="button" data-id="${escapeHtml(o.id)}" data-next="${next}" ${busy||pending?'disabled':''}>${busy?'Updating…':pending?'Awaiting payment':label}</button>`;
    return `<article class="order ${status}"><div class="order-head"><h2>${escapeHtml(o.customer?.name||'Guest')}</h2></div>
<p class="meta">${escapeHtml(o.id)} · ${escapeHtml(o.restaurantName)}</p>
<p class="who"><a href="tel:${escapeHtml(o.customer?.phone)}">${escapeHtml(o.customer?.phone)}</a></p>
<span class="pickup-at">Pickup ${o.asap?'ASAP · ':''}${escapeHtml(time(o.pickupAt))}</span>
${o.note?`<p class="note">“${escapeHtml(o.note)}”</p>`:''}
<ul class="items">${o.items.map(i=>`<li><span><b>${escapeHtml(i.qty)} ×</b> ${escapeHtml(i.name)}</span><span>${money(i.price*i.qty)}</span></li>`).join('')}</ul>
<div class="order-total"><span>Total</span><span>${money(o.total)}</span></div><p class="payment ${pending?'pending':''}">${pending?'Payment pending':'✓ Paid'} · ${o.paymentMethod==='justpay'?'JustPay':'Card'}</p>${button}</article>`;
  };
  $('orders').innerHTML=Object.keys(lanes).map(status=>{
    const group=rows.filter(o=>(lanes[o.orderStatus]?o.orderStatus:'new')===status)
      .sort((a,b)=>status==='collected'?new Date(b.pickupAt)-new Date(a.pickupAt):new Date(a.pickupAt)-new Date(b.pickupAt));
    return `<section class="order-lane lane-${status}" aria-labelledby="lane-${status}"><header class="lane-header"><div><h2 id="lane-${status}">${lanes[status]} <span>${group.length}</span></h2><p>${descriptions[status]}</p></div></header><div class="lane-cards">${group.length?group.map(card).join(''):`<div class="lane-empty">${emptyMessages[status]}</div>`}</div></section>`;
  }).join('');
}
async function load(){
  if(loading||document.hidden)return;loading=true;
  try{
    const response=await fetch('/api/orders');if(!response.ok)throw Error('Unable to load orders.');
    const data=await response.json();if(!Array.isArray(data))throw Error('Unexpected orders response.');
    const pickup=data.filter(o=>o.orderType==='pickup'),changed=JSON.stringify(pickup)!==JSON.stringify(orders);orders=pickup;
    $('connection').textContent='Connected · Refreshes every 5 seconds';
    if($('error').dataset.kind==='connection'){$('error').hidden=true;$('error').textContent='';}
    if(changed)render();
  }catch(error){$('connection').textContent='Connection unavailable';$('error').dataset.kind='connection';$('error').textContent='Couldn’t refresh pickup orders. Retrying automatically.';$('error').hidden=false;}
  finally{loading=false;}
}
$('restaurants').addEventListener('click',event=>{
  const button=event.target.closest('button[data-restaurant]');if(!button)return;
  restaurant=button.dataset.restaurant;history.replaceState(null,'',restaurant==='all'?location.pathname:'?restaurant='+encodeURIComponent(restaurant));renderFilters();render();
});
$('orders').addEventListener('click',async event=>{
  const button=event.target.closest('button[data-id]');if(!button||button.disabled)return;
  const {id,next}=button.dataset;
  saving.add(id);render();
  try{const response=await fetch('/api/orders/'+encodeURIComponent(id)+'/status',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({orderStatus:next})});if(!response.ok)throw Error('Update failed');const updated=await response.json();orders=orders.map(o=>o.id===id?updated:o);$('order-update').textContent=`${updated.customer?.name||'Order'} moved to ${lanes[next]}.`;$('error').hidden=true;}
  catch(error){$('error').dataset.kind='update';$('error').textContent='Couldn’t update this order. Please try again.';$('error').hidden=false;}
  finally{saving.delete(id);render();}
});
fetch('/api/pickup/restaurants').then(r=>r.json()).then(d=>{restaurants=d.restaurants||[];renderFilters();}).catch(()=>{});
renderFilters();render();load();setInterval(load,5000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)load();});
