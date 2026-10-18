// Accounts page (/accounts). Reads /api/accounts for a day and records payouts as sent.
const $=id=>document.getElementById(id);
const money=n=>'LKR '+Number(n).toLocaleString('en-LK',{maximumFractionDigits:2});
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const nice=d=>new Date(d+'T12:00:00').toLocaleDateString([],{weekday:'short',day:'numeric',month:'short'});
const shift=(d,n)=>{const x=new Date(d+'T12:00:00');x.setDate(x.getDate()+n);return x.toISOString().slice(0,10)};
let key='';try{key=sessionStorage.getItem('pb-admin-key')||''}catch{}
let data=null,date=new URLSearchParams(location.search).get('date')||'';

async function api(path,body){
  const res=await fetch(path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json','x-admin-key':key},body:body&&JSON.stringify(body)});
  const out=await res.json().catch(()=>({}));
  if(res.status===401){$('page').hidden=true;$('key-form').hidden=false;if(key){$('key-error').textContent='That key didn’t work.';$('key-error').hidden=false}throw Error('auth')}
  if(!res.ok)throw Error(out.error||'Something went wrong.');
  return out;
}

async function load(){
  try{
    data=await api('/api/accounts'+(date?'?date='+date:''));date=data.date;
    $('key-form').hidden=true;$('page').hidden=false;$('error').hidden=true;render();
  }catch(e){if(e.message!=='auth'){$('error').textContent='Couldn’t load accounts: '+e.message;$('error').hidden=false;$('page').hidden=false}}
}

function render(){
  const rows=data.rows,sum=k=>rows.reduce((n,r)=>n+r[k],0);
  $('date').value=data.date;$('date').max=data.today;$('next').disabled=data.date>=data.today;
  history.replaceState(null,'',data.date===data.today?'/accounts':'/accounts?date='+data.date);
  $('s-orders').textContent=sum('orders');$('s-food').textContent=money(sum('food'));$('s-owed').textContent=money(sum('owed'));
  $('s-keep').textContent=money(sum('commission')+sum('deliveryFees'));
  $('keep-note').textContent=rows.length?`Commission ${money(sum('commission'))} + delivery fees ${money(sum('deliveryFees'))}, before rider/PickMe and card costs`:'';
  if(document.activeElement!==$('pct'))$('pct').value=data.commissionPct;

  $('unpaid').hidden=!data.unpaid.length;
  $('unpaid').innerHTML=data.unpaid.length?`<b>Still to send from earlier days</b>${data.unpaid.map(u=>`${esc(u.name)} · ${nice(u.date)} · ${money(u.owed)} — <button type="button" data-goto="${u.date}">open day</button>`).join('<br>')}`:'';

  $('rows').innerHTML=rows.length?rows.map(r=>{
    const kinds=[['delivery','delivery'],['pickup','pickup'],['table','table']].filter(([k])=>r[k]).map(([k,l])=>`${r[k]} ${l}`).join(' · ');
    const p=r.payout;
    const action=p?`<div class="sent-note"><b>✓ Sent ${money(p.amount)}</b>${new Date(p.sentAt).toLocaleString([],{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}${p.reference?' · Ref '+esc(p.reference):''}${p.amount!==r.owed?`<br>Now owed ${money(r.owed)} — a later order changed the total`:''}<br><button type="button" data-undo="${esc(r.restaurantId)}">Undo</button></div>`
      :`<form class="pay" data-pay="${esc(r.restaurantId)}"><input name="reference" placeholder="Bank transfer ref (optional)" aria-label="Bank transfer reference for ${esc(r.name)}"><button>Mark sent</button></form>`;
    return `<article class="row ${p?'sent':''}"><div><h3>${esc(r.name)}</h3><div class="sub">${r.orders} paid order${r.orders===1?'':'s'} · ${kinds}</div></div>
      <div class="cell"><span>Food sales</span><b>${money(r.food)}</b>${r.service?`<div class="sub">+ ${money(r.service)} service charge</div>`:''}</div>
      <div class="cell"><span>Delivery fees (yours)</span><b>${money(r.deliveryFees)}</b></div>
      <div class="cell minus"><span>Commission ${r.commissionPct}%</span><b>− ${money(r.commission)}</b></div>
      <div class="cell owed"><span>Send them</span><b>${money(r.owed)}</b></div>
      ${action}</article>`;
  }).join(''):`<div class="empty-day">No paid orders on ${nice(data.date)}.</div>`;
}

$('rows').addEventListener('submit',async e=>{
  const f=e.target.closest('form[data-pay]');if(!f)return;e.preventDefault();f.querySelector('button').disabled=true;
  try{await api('/api/accounts/payouts',{date:data.date,restaurantId:f.dataset.pay,reference:f.reference.value});await load()}
  catch(err){if(err.message!=='auth'){$('error').textContent=err.message;$('error').hidden=false;f.querySelector('button').disabled=false}}
});
$('rows').addEventListener('click',async e=>{
  const b=e.target.closest('[data-undo]');if(!b)return;b.disabled=true;
  try{await api('/api/accounts/payouts',{date:data.date,restaurantId:b.dataset.undo,undo:true});await load()}catch(err){if(err.message!=='auth'){$('error').textContent=err.message;$('error').hidden=false}}
});
$('unpaid').addEventListener('click',e=>{const b=e.target.closest('[data-goto]');if(b){date=b.dataset.goto;load()}});
$('prev').addEventListener('click',()=>{date=shift(data.date,-1);load()});
$('next').addEventListener('click',()=>{date=shift(data.date,1);load()});
$('today').addEventListener('click',()=>{date='';load()});
$('date').addEventListener('change',()=>{if($('date').value){date=$('date').value;load()}});
$('settings').addEventListener('submit',async e=>{
  e.preventDefault();
  try{await api('/api/accounts/settings',{commissionPct:Number($('pct').value)});$('settings-msg').textContent='Saved';$('pct').blur();await load()}
  catch(err){if(err.message!=='auth')$('settings-msg').textContent=err.message}
});
$('key-form').addEventListener('submit',e=>{e.preventDefault();key=$('key').value;try{sessionStorage.setItem('pb-admin-key',key)}catch{}load()});
$('csv').addEventListener('click',()=>{
  const head=['Date','Restaurant','Paid orders','Food sales','Service charge','Delivery fees (Punchbook)','Commission %','Commission','Send restaurant','Sent','Reference'];
  const lines=data.rows.map(r=>[data.date,r.name,r.orders,r.food,r.service,r.deliveryFees,r.commissionPct,r.commission,r.owed,r.payout?'yes':'no',r.payout?.reference||'']);
  const csv=[head,...lines].map(l=>l.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));a.download=`punchbook-payouts-${data.date}.csv`;a.click();URL.revokeObjectURL(a.href);
});
load();setInterval(()=>{if(!document.hidden&&!$('page').hidden&&!$('rows').contains(document.activeElement))load()},30000);
