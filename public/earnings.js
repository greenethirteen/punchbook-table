// Restaurant earnings (/earnings): a restaurant's sales day by day, Punchbook's commission, and when each
// day is paid (T+2). Restaurant keys see their own restaurant; the admin can switch between restaurants.
const $=id=>document.getElementById(id);
const money=n=>'LKR '+Number(n||0).toLocaleString('en-LK',{maximumFractionDigits:2});
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const nice=d=>new Date(d+'T12:00:00').toLocaleDateString([],{weekday:'short',day:'numeric',month:'short'});
const short=d=>new Date(d+'T12:00:00').toLocaleDateString([],{day:'numeric',month:'short'});
let demo=window.pbMode()==='demo',me=null,pick=new URLSearchParams(location.search).get('restaurant')||'',data=null;

async function api(path){
  if(demo)return window.pbDemo.api(path);
  const r=await fetch(path),out=await r.json().catch(()=>({}));
  if(!r.ok)throw Error(out.error||'Couldn’t load your earnings.');
  return out;
}

async function load(){
  try{data=await api('/api/accounts/mine'+(pick?'?restaurant='+encodeURIComponent(pick):''));$('error').hidden=true;render()}
  catch(e){$('error').textContent=e.message;$('error').hidden=false}
}

function payment(d){
  if(d.status==='paid')return`<span class="pill good">Paid ${short(d.payout.sentAt.slice(0,10))}</span>${d.payout.reference?`<small>Ref ${esc(d.payout.reference)}</small>`:''}`;
  if(d.status==='today')return`<span class="pill plain">Day still open</span><small>Paid ${nice(d.dueDate)}</small>`;
  if(d.status==='overdue')return`<span class="pill bad">Late · was due ${short(d.dueDate)}</span>`;
  if(d.status==='due')return'<span class="pill warn">Being paid today</span>';
  return`<span class="pill info">Coming ${nice(d.dueDate)}</span>`;
}

function render(){
  document.querySelectorAll('[data-mode]').forEach(b=>b.setAttribute('aria-pressed',String((b.dataset.mode==='demo')===demo)));
  $('demo-note').hidden=!demo;
  const R=data.restaurant,days=data.days,sum=(list,k)=>list.reduce((n,d)=>n+d[k],0);
  $('title').textContent=R.name;$('kicker').textContent='Earnings';document.title=R.name+' · Earnings';
  $('sub').textContent=data.bank?`Paid to ${data.bank.bankName} ••••${data.bank.last4}`:'Bank account not set up yet. Ask Punchbook to add it.';
  $('rule').textContent=`Each day is paid ${data.settleDays} days later (T+${data.settleDays}). Commission is ${data.commissionPct}% of food sales.`;
  if(data.restaurants&&me.role==='admin'){$('picker-wrap').hidden=false;$('picker').innerHTML=data.restaurants.map(r=>`<button type="button" data-pick="${esc(r.id)}" aria-pressed="${r.id===R.id}">${esc(r.name)}</button>`).join('')}

  const paid=days.filter(d=>d.status==='paid'),waiting=days.filter(d=>d.status!=='paid'&&d.status!=='today');
  const next=[...waiting].sort((a,b)=>a.dueDate.localeCompare(b.dueDate)),nextDate=next[0]?.dueDate,nextAmt=sum(next.filter(d=>d.dueDate===nextDate),'owed');
  const todayRow=days.find(d=>d.status==='today'),late=waiting.filter(d=>d.status==='overdue');
  $('tiles').innerHTML=[
    ['green','Paid to you · 30 days',money(sum(paid,'owed')),`${paid.length} day${paid.length===1?'':'s'} paid`],
    [late.length?'rose':'orange','Waiting to be paid',money(sum(waiting,'owed')),late.length?`${late.length} late, Punchbook has been alerted`:waiting.length?`${waiting.length} day${waiting.length===1?'':'s'}`:'nothing waiting'],
    ['blue','Next payment',nextDate?money(nextAmt):'—',nextDate?(nextDate<=data.today?'due now':nice(nextDate)):'nothing scheduled'],
    ['purple','Today so far',money(todayRow?.owed),todayRow?`${todayRow.orders} orders · paid ${nice(todayRow.dueDate)}`:'no paid orders yet'],
  ].map(([c,l,v,s])=>`<div class="tile ${c}"><span><i></i>${l}</span><strong>${esc(v)}</strong><small>${esc(s)}</small></div>`).join('');

  // Last 14 days as bars (oldest left).
  const span=[];for(let i=13;i>=0;i--){const d=new Date(Date.parse(data.today+'T12:00:00Z')-i*864e5).toISOString().slice(0,10);span.push(days.find(x=>x.date===d)||{date:d,owed:0,status:'none'})}
  const max=Math.max(1,...span.map(d=>d.owed));
  $('bars').innerHTML=span.map(d=>`<div class="${d.status==='paid'?'':['due','overdue'].includes(d.status)?'due':'soon'}" data-tip="${short(d.date)} · ${money(d.owed)}"><i style="height:${Math.round(d.owed/max*100)}%"></i></div>`).join('');
  $('bar-labels').innerHTML=span.map((d,i)=>`<span>${i%2?'':short(d.date)}</span>`).join('');

  $('rows').innerHTML=days.length?days.map(d=>`<tr><td style="white-space:nowrap"><b>${short(d.date)}</b></td><td class="num hide-m">${d.orders}</td><td class="num hide-m">${money(d.food+d.service)}</td><td class="num hide-m">− ${money(d.commission)}</td><td class="num"><b>${money(d.owed)}</b></td><td>${payment(d)}</td></tr>`).join('')
    :'<tr><td colspan="6" class="empty">No paid orders in the last 30 days.</td></tr>';
  $('foot').innerHTML=days.length?`<tr><td>30 days</td><td class="num hide-m">${sum(days,'orders')}</td><td class="num hide-m">${money(sum(days,'food')+sum(days,'service'))}</td><td class="num hide-m">− ${money(sum(days,'commission'))}</td><td class="num">${money(sum(days,'owed'))}</td><td></td></tr>`:'';
}

document.addEventListener('click',e=>{
  const b=e.target.closest('button');if(!b)return;
  if(b.dataset.mode){const want=b.dataset.mode==='demo';if(want!==demo){demo=want;window.pbSetMode(demo?'demo':'live');load()}}
  if(b.dataset.pick){pick=b.dataset.pick;history.replaceState(null,'','/earnings?restaurant='+encodeURIComponent(pick));load()}
});

window.staffReady.then(m=>{
  if(!m)return;me=m;$('main').hidden=false;
  if(me.role==='admin')$('hq-link').hidden=false;
  else{document.querySelector('.mode').hidden=true;if(demo){demo=false}}
  load();setInterval(()=>{if(!document.hidden)load()},30000);
});
