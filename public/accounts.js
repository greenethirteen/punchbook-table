// Accounts page (/accounts). Reads /api/accounts for a day and records payouts as sent.
const $=id=>document.getElementById(id);
const money=n=>'LKR '+Number(n).toLocaleString('en-LK',{maximumFractionDigits:2});
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const nice=d=>new Date(d+'T12:00:00').toLocaleDateString([],{weekday:'short',day:'numeric',month:'short'});
const shift=(d,n)=>{const x=new Date(d+'T12:00:00');x.setDate(x.getDate()+n);return x.toISOString().slice(0,10)};
let data=null,editing=null,apps=null,fileIds=null,date=new URLSearchParams(location.search).get('date')||'';

// Live/Demo is shared with /hq (demo-data.js).
let demo=window.pbMode()==='demo';

async function api(path,body){
  if(demo)return window.pbDemo.api(path,body);
  const res=await fetch(path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json'},body:body&&JSON.stringify(body)});
  const out=await res.json().catch(()=>({}));
  if(res.status===401)throw Error('auth');
  if(res.status===403){$('page').hidden=false;throw Error('Only the Punchbook admin can see accounts.')}
  if(!res.ok)throw Error(out.error||'Something went wrong.');
  return out;
}

async function load(){
  try{
    data=await api('/api/accounts'+(date?'?date='+date:''));date=data.date;
    $('page').hidden=false;$('error').hidden=true;render();
  }catch(e){if(e.message!=='auth'){$('error').textContent='Couldn’t load accounts: '+e.message;$('error').hidden=false;$('page').hidden=false}}
}

function render(){
  document.querySelectorAll('[data-mode]').forEach(b=>b.setAttribute('aria-pressed',String((b.dataset.mode==='demo')===demo)));
  $('demo-note').hidden=!demo;
  const rows=data.rows,sum=k=>rows.reduce((n,r)=>n+r[k],0);
  $('date').value=data.date;$('date').max=data.today;$('next').disabled=data.date>=data.today;
  history.replaceState(null,'',data.date===data.today?'/accounts':'/accounts?date='+data.date);
  $('s-orders').textContent=sum('orders');$('s-food').textContent=money(sum('food'));$('s-owed').textContent=money(sum('owed'));
  $('s-keep').textContent=money(sum('commission')+sum('deliveryFees')-sum('cardFees')-sum('courierCosts'));
  $('keep-note').textContent=rows.length?`Commission ${money(sum('commission'))} + delivery fees ${money(sum('deliveryFees'))} − card fees ${money(sum('cardFees'))} − rider/PickMe ${money(sum('courierCosts'))}`:'';
  if(document.activeElement!==$('pct'))$('pct').value=data.commissionPct;

  $('unpaid').hidden=!data.unpaid.length;
  $('unpaid').innerHTML=data.unpaid.length?`<b>Still to send from earlier days</b>${data.unpaid.map(u=>`${esc(u.name)} · ${nice(u.date)} · ${money(u.owed)} — <button type="button" data-goto="${u.date}">open day</button>`).join('<br>')}`:'';

  $('rows').innerHTML=rows.length?rows.map(r=>{
    const kinds=[['delivery','delivery'],['pickup','pickup'],['table','table']].filter(([k])=>r[k]).map(([k,l])=>`${r[k]} ${l}`).join(' · ');
    const p=r.payout;
    const action=p?`<div class="sent-note"><b>✓ Sent ${money(p.amount)}</b>${new Date(p.sentAt).toLocaleString([],{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}${p.reference?' · Ref '+esc(p.reference):''}${p.amount!==r.owed?`<br>Now owed ${money(r.owed)} — a later order changed the total`:''}<br><button type="button" data-undo="${esc(r.restaurantId)}">Undo</button></div>`
      :`<form class="pay" data-pay="${esc(r.restaurantId)}"><input name="reference" placeholder="Bank transfer ref (optional)" aria-label="Bank transfer reference for ${esc(r.name)}"><button>Mark sent</button></form>`;
    const b=r.bank,bankLine=b?`<div class="bankline">${esc(b.bankName)}${b.branch?' · '+esc(b.branch):''} · ••••${esc(b.accountNumber.slice(-4))}<button type="button" data-bank="${esc(r.restaurantId)}">edit</button></div>`
      :`<div class="bankline missing">No bank account<button type="button" data-bank="${esc(r.restaurantId)}">add</button></div>`;
    return `<article class="row ${p?'sent':''}"><div><h3>${esc(r.name)}</h3><div class="sub">${r.orders} paid order${r.orders===1?'':'s'} · ${kinds}</div>${bankLine}</div>
      <div class="cell"><span>Food sales</span><b>${money(r.food)}</b>${r.service?`<div class="sub">+ ${money(r.service)} service charge</div>`:''}</div>
      <div class="cell"><span>Delivery fees (yours)</span><b>${money(r.deliveryFees)}</b></div>
      <div class="cell minus"><span>Commission ${r.commissionPct}%</span><b>− ${money(r.commission)}</b></div>
      <div class="cell owed"><span>Send them</span><b>${money(r.owed)}</b></div>
      ${action}${editing===r.restaurantId?bankForm(r):''}</article>`;
  }).join(''):`<div class="empty-day">No paid orders on ${nice(data.date)}.</div>`;
}

function bankForm(r){
  const b=r.bank||{},opts=(apps||[]).map(a=>`<option value="${esc(a.id)}">${esc(a.name)} · ${esc(a.bankName)} ••••${esc(String(a.accountNumber).slice(-4))}</option>`).join('');
  return `<form class="bankform" data-bankform="${esc(r.restaurantId)}">
    ${opts?`<select name="app" aria-label="Copy from a signup application"><option value="">Copy from a signup application…</option>${opts}</select>`:''}
    <input name="accountName" placeholder="Account name" value="${esc(b.accountName)}" aria-label="Account name">
    <input name="bankName" placeholder="Bank" value="${esc(b.bankName)}" aria-label="Bank">
    <input name="branch" placeholder="Branch" value="${esc(b.branch)}" aria-label="Branch">
    <input name="accountNumber" placeholder="Account number" inputmode="numeric" value="${esc(b.accountNumber)}" aria-label="Account number">
    <div class="acts"><button class="save">Save</button><button type="button" data-cancel>Cancel</button><span class="msg" role="status"></span></div></form>`;
}

$('rows').addEventListener('change',e=>{
  if(e.target.name!=='app')return;const a=(apps||[]).find(x=>x.id===e.target.value),f=e.target.form;if(!a)return;
  for(const k of ['accountName','bankName','branch','accountNumber'])f[k].value=a[k]||'';
});
$('rows').addEventListener('submit',async e=>{
  const bf=e.target.closest('form[data-bankform]');
  if(bf){e.preventDefault();const msg=bf.querySelector('.msg');
    try{await api('/api/accounts/banks',{restaurantId:bf.dataset.bankform,accountName:bf.accountName.value,bankName:bf.bankName.value,branch:bf.branch.value,accountNumber:bf.accountNumber.value});editing=null;await load()}
    catch(err){if(err.message!=='auth')msg.textContent=err.message}
    return}
  const f=e.target.closest('form[data-pay]');if(!f)return;e.preventDefault();f.querySelector('button').disabled=true;
  try{await api('/api/accounts/payouts',{date:data.date,restaurantId:f.dataset.pay,reference:f.reference.value});await load()}
  catch(err){if(err.message!=='auth'){$('error').textContent=err.message;$('error').hidden=false;f.querySelector('button').disabled=false}}
});
$('rows').addEventListener('click',async e=>{
  const eb=e.target.closest('[data-bank]');
  if(eb){editing=eb.dataset.bank;if(!apps)apps=(await api('/api/accounts/applications').catch(()=>({applications:[]}))).applications;render();return}
  if(e.target.closest('[data-cancel]')){editing=null;render();return}
  const b=e.target.closest('[data-undo]');if(!b)return;b.disabled=true;
  try{await api('/api/accounts/payouts',{date:data.date,restaurantId:b.dataset.undo,undo:true});await load()}catch(err){if(err.message!=='auth'){$('error').textContent=err.message;$('error').hidden=false}}
});
// Bank bulk-transfer file: one line per restaurant still to be paid for this day.
const csvOf=rows=>rows.map(l=>l.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')).join('\r\n');
const download=(text,name)=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type:'text/csv'}));a.download=name;a.click();URL.revokeObjectURL(a.href)};
$('bankfile').addEventListener('click',()=>{
  const due=data.rows.filter(r=>!r.payout&&r.owed>0),ok=due.filter(r=>r.bank),missing=due.filter(r=>!r.bank);
  const bar=$('filebar');bar.hidden=false;
  if(!ok.length){fileIds=null;bar.innerHTML=due.length?`<span class="warn">Add bank accounts first: ${missing.map(r=>esc(r.name)).join(', ')}.</span>`:'Nothing left to send for this day.';return}
  const ref=`Punchbook ${data.date}`;
  download(csvOf([['Beneficiary name','Account number','Bank','Branch','Amount','Reference'],...ok.map(r=>[r.bank.accountName,r.bank.accountNumber,r.bank.bankName,r.bank.branch,r.owed.toFixed(2),ref])]),`punchbook-bank-transfers-${data.date}.csv`);
  fileIds={date:data.date,ids:ok.map(r=>r.restaurantId)};
  const total=ok.reduce((n,r)=>n+r.owed,0);
  bar.innerHTML=`<span>File downloaded: ${ok.length} transfer${ok.length===1?'':'s'}, ${money(total)}. After your bank approves it:</span><input id="fileref" placeholder="Bank batch ref (optional)" aria-label="Bank batch reference"><button type="button" id="markfile">Mark ${ok.length} as sent</button>${missing.length?`<span class="warn">Not in the file (no bank account): ${missing.map(r=>esc(r.name)).join(', ')}.</span>`:''}`;
});
$('filebar').addEventListener('click',async e=>{
  if(e.target.id!=='markfile'||!fileIds)return;e.target.disabled=true;
  try{await api('/api/accounts/payouts',{date:fileIds.date,restaurantIds:fileIds.ids,reference:$('fileref').value||`Punchbook ${fileIds.date}`});fileIds=null;$('filebar').hidden=true;await load()}
  catch(err){e.target.disabled=false;if(err.message!=='auth'){$('error').textContent=err.message;$('error').hidden=false}}
});
const resetFile=()=>{fileIds=null;$('filebar').hidden=true};
document.querySelector('.mode').addEventListener('click',e=>{
  const b=e.target.closest('[data-mode]');if(!b||(b.dataset.mode==='demo')===demo)return;
  demo=b.dataset.mode==='demo';window.pbSetMode(demo?'demo':'live');
  editing=null;apps=null;resetFile();$('error').hidden=true;load();
});
$('unpaid').addEventListener('click',e=>{const b=e.target.closest('[data-goto]');if(b){resetFile();date=b.dataset.goto;load()}});
$('prev').addEventListener('click',()=>{resetFile();date=shift(data.date,-1);load()});
$('next').addEventListener('click',()=>{resetFile();date=shift(data.date,1);load()});
$('today').addEventListener('click',()=>{resetFile();date='';load()});
$('date').addEventListener('change',()=>{if($('date').value){resetFile();date=$('date').value;load()}});
$('settings').addEventListener('submit',async e=>{
  e.preventDefault();
  try{await api('/api/accounts/settings',{commissionPct:Number($('pct').value)});$('settings-msg').textContent='Saved';$('pct').blur();await load()}
  catch(err){if(err.message!=='auth')$('settings-msg').textContent=err.message}
});
$('csv').addEventListener('click',()=>{
  const head=['Date','Restaurant','Paid orders','Food sales','Service charge','Delivery fees (Punchbook)','Card fees (Punchbook)','Rider/PickMe costs (Punchbook)','Commission %','Commission','Send restaurant','Sent','Reference'];
  const lines=data.rows.map(r=>[data.date,r.name,r.orders,r.food,r.service,r.deliveryFees,r.cardFees,r.courierCosts,r.commissionPct,r.commission,r.owed,r.payout?'yes':'no',r.payout?.reference||'']);
  download(csvOf([head,...lines]),`punchbook-payouts-${data.date}.csv`);
});
window.staffReady.then(me=>{if(me)load()});setInterval(()=>{if(!document.hidden&&!$('page').hidden&&!$('rows').contains(document.activeElement)&&!editing)load()},30000);
