const $=id=>document.getElementById(id);
const money=n=>'LKR '+Number(n).toLocaleString('en-LK');
const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const statusNames={new:'New',preparing:'Preparing',served:'Served'};
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
let samples=sampleOrders(),live=[],mode='sample',filter='all',chosenMode=false,loading=false;
const saving=new Set();
function render(){
  const rows=mode==='sample'?samples:live;
  $('sample-mode').setAttribute('aria-pressed',String(mode==='sample'));
  $('live-mode').setAttribute('aria-pressed',String(mode==='live'));
  $('notice').textContent=mode==='sample'?'You’re viewing sample orders. Try the status buttons; no restaurant data will change.':'Live orders from the restaurant menu. New orders appear automatically.';
  $('reset-samples').hidden=mode!=='sample';
  $('paid-label').textContent=mode==='sample'?'Sample paid total':'Paid order total';
  for(const key of ['new','preparing','served'])$(key+'-count').textContent=rows.filter(o=>o.orderStatus===key).length;
  $('paid-total').textContent=money(rows.filter(o=>o.paymentStatus==='paid').reduce((n,o)=>n+o.total,0));
  document.querySelectorAll('[data-filter]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.filter===filter)));
  const visible=rows.filter(o=>filter==='all'||o.orderStatus===filter);
  $('orders').innerHTML=visible.length?visible.map(o=>{
    const status=statusNames[o.orderStatus]?o.orderStatus:'new';
    const pending=o.paymentStatus!=='paid';const busy=saving.has(o.id);
    const next=status==='new'?'preparing':'served';
    const label=busy?'Updating…':status==='served'?'✓ Served':pending?'Awaiting payment':status==='new'?'Start preparing →':'Mark as served ✓';
    return `<article class="order ${status}"><div class="order-head"><h2>Table ${escapeHtml(o.table)}</h2><span class="status">${statusNames[status]}</span></div><p class="meta">${escapeHtml(o.id)} · ${escapeHtml(new Date(o.createdAt).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}))}${mode==='sample'?' · Sample':''}</p><ul class="items">${o.items.map(i=>`<li><span><b>${escapeHtml(i.qty)} ×</b> ${escapeHtml(i.name)}</span><span>${money(i.price*i.qty)}</span></li>`).join('')}</ul><div class="order-total"><span>Total</span><span>${money(o.total)}</span></div><p class="payment ${pending?'pending':''}">${pending?'Payment pending':'✓ Paid'} · ${o.paymentMethod==='justpay'?'JustPay':'Card'}</p><button type="button" data-id="${escapeHtml(o.id)}" data-next="${next}" ${busy||pending||status==='served'?'disabled':''}>${label}</button></article>`;
  }).join(''):`<div class="empty"><h2>${filter==='all'?'No live orders yet.':'No '+statusNames[filter].toLowerCase()+' orders.'}</h2><p>${filter==='all'?'Place an order from the menu or switch to Sample orders to explore.':'Orders will appear here when they reach this stage.'}</p>${filter==='all'?'<a class="link" href="/peppermint">Open the restaurant menu ↗</a>':''}</div>`;
}
async function load(){
  if(loading||document.hidden)return;loading=true;
  try{
    const response=await fetch('/api/orders');if(!response.ok)throw Error('Unable to load live orders.');
    const data=await response.json();if(!Array.isArray(data))throw Error('Unexpected orders response.');
    const changed=JSON.stringify(data)!==JSON.stringify(live);live=data;
    let switched=false;if(!chosenMode&&live.length){mode='live';chosenMode=true;switched=true;}
    $('connection').textContent='Connected · Refreshes every 5 seconds';
    if($('error').dataset.kind==='connection'){$('error').hidden=true;$('error').textContent='';}
    if(switched||(changed&&mode==='live'))render();
  }catch(error){$('connection').textContent='Connection unavailable';$('error').dataset.kind='connection';$('error').textContent='Couldn’t refresh live orders. Retrying automatically; sample orders still work.';$('error').hidden=false;}
  finally{loading=false;}
}
$('orders').addEventListener('click',async event=>{
  const button=event.target.closest('button[data-id]');if(!button||button.disabled)return;
  const {id,next}=button.dataset;
  if(mode==='sample'){const order=samples.find(o=>o.id===id);if(order)order.orderStatus=next;render();return;}
  saving.add(id);render();
  try{const response=await fetch('/api/orders/'+encodeURIComponent(id)+'/status',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({orderStatus:next})});if(!response.ok)throw Error('Update failed');const updated=await response.json();live=live.map(o=>o.id===id?updated:o);$('error').hidden=true;}
  catch(error){$('error').dataset.kind='update';$('error').textContent='Couldn’t update this order. Please try again.';$('error').hidden=false;}
  finally{saving.delete(id);render();}
});
for(const selected of ['live','sample'])$(selected+'-mode').addEventListener('click',()=>{mode=selected;chosenMode=true;filter='all';render();});
document.querySelectorAll('[data-filter]').forEach(button=>button.addEventListener('click',()=>{filter=button.dataset.filter;render();}));
$('reset-samples').addEventListener('click',()=>{samples=sampleOrders();filter='all';render();});
$('qr-form').addEventListener('submit',event=>{event.preventDefault();if(event.target.reportValidity())location.href='/qr?table='+encodeURIComponent($('qr-table').value);});
render();load();setInterval(load,5000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)load();});
