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
let samples=sampleOrders(),live=[],mode='sample',loading=false;
const saving=new Set();
function render(){
  const rows=mode==='sample'?samples:live;
  $('sample-mode').setAttribute('aria-pressed',String(mode==='sample'));
  $('live-mode').setAttribute('aria-pressed',String(mode==='live'));
  $('notice').textContent=mode==='sample'?'You’re viewing sample orders. Try the status buttons; no restaurant data will change.':'Live orders · Updates automatically.';
  $('reset-samples').hidden=mode!=='sample';
  $('paid-label').textContent=mode==='sample'?'Sample paid total':'Paid order total';
  for(const key of ['new','preparing','served'])$(key+'-count').textContent=rows.filter(o=>o.orderStatus===key).length;
  $('paid-total').textContent=money(rows.filter(o=>o.paymentStatus==='paid').reduce((n,o)=>n+o.total,0));
  const descriptions={new:'Received · waiting to be started',preparing:'Being made · not yet delivered',served:'Delivered to the guest’s table'};
  const emptyMessages={new:'No new orders waiting.',preparing:'Nothing being prepared.',served:'Served orders will appear here.'};
  const card=o=>{
    const status=statusNames[o.orderStatus]?o.orderStatus:'new';
    const pending=o.paymentStatus!=='paid';const busy=saving.has(o.id);
    const next=status==='new'?'preparing':'served';
    const label=busy?'Updating…':status==='served'?'✓ Served':pending?'Awaiting payment':status==='new'?'Start preparing →':'Mark as served ✓';
    return `<article class="order ${status}"><div class="order-head"><h2>Table ${escapeHtml(o.table)}</h2><span class="status">${statusNames[status]}</span></div><p class="meta">${escapeHtml(o.id)} · ${escapeHtml(new Date(o.createdAt).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}))}${mode==='sample'?' · Sample':''}</p><ul class="items">${o.items.map(i=>`<li><span><b>${escapeHtml(i.qty)} ×</b> ${escapeHtml(i.name)}</span><span>${money(i.price*i.qty)}</span></li>`).join('')}</ul><div class="order-total"><span>Total</span><span>${money(o.total)}</span></div><p class="payment ${pending?'pending':''}">${pending?'Payment pending':'✓ Paid'} · ${o.paymentMethod==='justpay'?'JustPay':'Card'}</p>${status==='served'?'<div class="served-note">✓ Delivered to the table</div>':`<button type="button" data-id="${escapeHtml(o.id)}" data-next="${next}" ${busy||pending?'disabled':''}>${label}</button>`}</article>`;
  };
  $('orders').innerHTML=Object.keys(statusNames).map(status=>{
    const group=rows.filter(o=>(statusNames[o.orderStatus]?o.orderStatus:'new')===status)
      .sort((a,b)=>status==='served'?new Date(b.createdAt)-new Date(a.createdAt):new Date(a.createdAt)-new Date(b.createdAt));
    return `<section class="order-lane lane-${status}" aria-labelledby="lane-${status}"><header class="lane-header"><div><h2 id="lane-${status}">${statusNames[status]} <span>${group.length}</span></h2><p>${descriptions[status]}</p></div></header><div class="lane-cards">${group.length?group.map(card).join(''):`<div class="lane-empty">${emptyMessages[status]}</div>`}</div></section>`;
  }).join('');

}
async function load(){
  if(loading||document.hidden)return;loading=true;
  try{
    const response=await fetch('/api/orders');if(!response.ok)throw Error('Unable to load live orders.');
    const data=await response.json();if(!Array.isArray(data))throw Error('Unexpected orders response.');
    const changed=JSON.stringify(data)!==JSON.stringify(live);live=data;
    $('connection').textContent='Connected · Refreshes every 5 seconds';
    if($('error').dataset.kind==='connection'){$('error').hidden=true;$('error').textContent='';}
    if(changed&&mode==='live')render();
  }catch(error){$('connection').textContent='Connection unavailable';$('error').dataset.kind='connection';$('error').textContent='Couldn’t refresh live orders. Retrying automatically; sample orders still work.';$('error').hidden=false;}
  finally{loading=false;}
}
$('orders').addEventListener('click',async event=>{
  const button=event.target.closest('button[data-id]');if(!button||button.disabled)return;
  const {id,next}=button.dataset;
  if(mode==='sample'){const order=samples.find(o=>o.id===id);if(order){order.orderStatus=next;$('order-update').textContent=`Table ${order.table} moved to ${statusNames[next]}.`;}render();return;}
  saving.add(id);render();
  try{const response=await fetch('/api/orders/'+encodeURIComponent(id)+'/status',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({orderStatus:next})});if(!response.ok)throw Error('Update failed');const updated=await response.json();live=live.map(o=>o.id===id?updated:o);$('order-update').textContent=`Table ${updated.table} moved to ${statusNames[next]}.`;$('error').hidden=true;}
  catch(error){$('error').dataset.kind='update';$('error').textContent='Couldn’t update this order. Please try again.';$('error').hidden=false;}
  finally{saving.delete(id);render();}
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
render();load();setInterval(load,5000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)load();});
