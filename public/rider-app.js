// Rider page (/rider). Lists paid delivery orders from /api/rider/jobs and moves them
// open → accepted → picked up → delivered. The rider's name, number and access code stay on this device.
const $=id=>document.getElementById(id);
const money=n=>'LKR '+Number(n).toLocaleString('en-LK');
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clock=iso=>new Date(iso).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
const store={get(k){try{return JSON.parse(localStorage.getItem('pb-rider-'+k))}catch{return null}},set(k,v){try{localStorage.setItem('pb-rider-'+k,JSON.stringify(v))}catch{}}};

let me=store.get('me'),key=store.get('key')||'',tab=store.get('tab')||'open',jobs=[],loading=false,knownOpen=null,armed=null;
const busy=new Set();
const foodNames={new:'Kitchen: not started',preparing:'Kitchen: preparing',ready:'Food ready ✓',collected:'Food ready ✓'};
const mine=j=>me&&j.dispatch.rider?.phone===me.phone;

async function api(path,body){
  const res=await fetch(path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json','x-rider-key':key},body:body&&JSON.stringify({...body,rider:me})});
  const data=await res.json().catch(()=>({}));
  if(res.status===401){showSetup('That access code didn’t work.');throw Error('auth')}
  if(!res.ok){if(data.job)jobs=jobs.map(j=>j.id===data.job.id?data.job:j);throw Error(data.error||'Something went wrong. Try again.')}
  return data;
}

function showSetup(message){
  $('board').hidden=true;$('who').hidden=true;$('setup').hidden=false;
  $('name').value=me?.name||'';$('phone').value=me?.phone||'';$('key').value=key;
  if(message){$('key-row').hidden=false;$('setup-error').textContent=message;$('setup-error').hidden=false}
}
function showBoard(){
  $('setup').hidden=true;$('board').hidden=false;$('who').hidden=false;
  $('who').textContent=me.name+' · change';render();load();
}
$('setup').addEventListener('submit',e=>{
  e.preventDefault();
  const name=$('name').value.trim(),phone=$('phone').value.trim();
  if(phone.replace(/\D/g,'').length<9){$('setup-error').textContent='Enter a valid mobile number.';$('setup-error').hidden=false;return}
  me={name,phone};key=$('key').value.trim();store.set('me',me);store.set('key',key);$('setup-error').hidden=true;showBoard();
});
$('who').addEventListener('click',()=>showSetup());

// A short beep and buzz when a new open job arrives (browsers allow sound after the first tap).
let audio;
document.addEventListener('pointerdown',()=>{audio||=new (window.AudioContext||window.webkitAudioContext)()},{once:true});
function alertNewJob(){
  try{navigator.vibrate?.([200,100,200])}catch{}
  if(!audio)return;
  for(const [i,f] of [[0,880],[1,1175]].entries()){const o=audio.createOscillator(),g=audio.createGain();o.frequency.value=f;g.gain.value=.15;o.connect(g).connect(audio.destination);o.start(audio.currentTime+i*.18);o.stop(audio.currentTime+i*.18+.14)}
}

async function load(){
  if(loading||document.hidden||!me)return;loading=true;
  try{
    const data=await api('/api/rider/jobs');jobs=data.jobs;
    const open=jobs.filter(j=>j.dispatch.status==='open').map(j=>j.id);
    if(knownOpen&&open.some(id=>!knownOpen.has(id)))alertNewJob();
    knownOpen=new Set(open);
    $('status').textContent='Live · updated '+clock(new Date().toISOString());
    if($('error').dataset.kind==='connection')$('error').hidden=true;
    // Don't redraw under a rider who is typing a PickMe reference.
    if(!$('jobs').contains(document.activeElement)||document.activeElement.tagName!=='INPUT')render();
  }catch(e){if(e.message!=='auth'){$('status').textContent='Offline · retrying…';$('error').dataset.kind='connection';$('error').textContent='Can’t reach Punchbook. Retrying automatically.';$('error').hidden=false}}
  finally{loading=false}
}

const mapsTo=j=>`https://www.google.com/maps/dir/?api=1&destination=${j.customer.address.lat},${j.customer.address.lng}`;
const mapsFrom=j=>`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(j.restaurant.name+' '+j.restaurant.area)}`;
const dropText=j=>[j.customer.address.line,j.customer.address.details,`${j.customer.name} ${j.customer.phone}`].filter(Boolean).join(', ');
const pickText=j=>`${j.restaurant.name}, ${j.restaurant.area} (order ${j.id})`;

function card(j){
  const d=j.dispatch,isMine=mine(j),open=d.status==='open',done=d.status==='delivered',b=busy.has(j.id);
  const pills=[`<span class="pill ${['ready','collected'].includes(j.foodStatus)?'ok':'wait'}">${foodNames[j.foodStatus]||foodNames.new}</span>`,
    `<span class="pill">${j.asap?'ASAP · ':''}Ready ~${clock(j.readyAt)}</span>`];
  if(!open)pills.push(`<span class="pill rider">${d.method==='pickme'?'PickMe':'Rider'}: ${isMine?'you':esc(d.rider.name)}${d.courierRef?' · '+esc(d.courierRef):''}</span>`);
  const a=j.customer.address||{};
  let actions='';
  if(open)actions=`<div class="actions two"><button class="primary" data-act="accept" data-method="own" ${b?'disabled':''}>I’ll ride it</button><button class="secondary" data-act="accept" data-method="pickme" ${b?'disabled':''}>Book PickMe</button></div>`;
  else if(done)actions=`<p class="done-note">✓ Delivered ${clock(d.deliveredAt)}</p>`;
  else if(isMine){
    const courier=d.method==='pickme'?`<div class="courier"><p>Book a PickMe Flash from the restaurant to the customer, then save the trip or rider details here.</p><div class="copy-row"><button class="icon-btn" data-copy="pick">Copy pickup</button><button class="icon-btn" data-copy="drop">Copy drop-off</button></div><form data-ref><input name="ref" value="${esc(d.courierRef)}" placeholder="Trip ID or rider name/number" aria-label="PickMe trip or rider details"><button class="icon-btn" ${b?'disabled':''}>Save</button></form></div>`:'';
    const step=d.status==='assigned'?`<button class="primary" data-act="pickup" ${b?'disabled':''}>${d.method==='pickme'?'PickMe picked it up':'Picked up the food'}</button>`:`<button class="primary go" data-act="deliver" ${b?'disabled':''}>Delivered ✓</button>`;
    const release=d.status==='assigned'?`<button class="ghost" data-act="release" ${b?'disabled':''}>${armed===j.id?'Tap again to give this job back':'Give this job back'}</button>`:'';
    actions=courier+`<div class="actions">${step}${release}</div>`;
  }
  return `<article class="job ${isMine?'mine':''} ${done?'done':''}" data-id="${esc(j.id)}">
    <div class="job-head"><div><h2>${esc(j.restaurant.name)}</h2><div class="id">${esc(j.id)} · ordered ${clock(j.createdAt)}</div></div><div class="fee">${money(j.deliveryFee)}<small>delivery fee</small></div></div>
    <div class="pills">${pills.join('')}</div>
    <div class="stop"><span class="dot"></span><div><div class="label">PICK UP</div><div class="main">${esc(j.restaurant.name)}</div><div class="sub">${esc(j.restaurant.area)}</div></div><div class="stop-actions"><a class="icon-btn" href="${mapsFrom(j)}" target="_blank" rel="noopener">Map</a></div></div>
    <div class="stop"><span class="dot to"></span><div><div class="label">DROP OFF</div><div class="main">${esc(a.line)}</div><div class="sub">${esc(a.details)}${a.details?' · ':''}${esc(j.customer.name)}</div></div><div class="stop-actions"><a class="icon-btn" href="tel:${esc(j.customer.phone)}" aria-label="Call ${esc(j.customer.name)}">Call</a><a class="icon-btn" href="${mapsTo(j)}" target="_blank" rel="noopener">Map</a></div></div>
    <div class="items">${j.items.map(i=>`${esc(i.qty)}× ${esc(i.name)}`).join(' · ')}<br><b>Paid online · ${money(j.total)}</b> · nothing to collect</div>
    ${j.note?`<p class="note">“${esc(j.note)}”</p>`:''}
    ${actions}
  </article>`;
}

function render(){
  const groups={open:jobs.filter(j=>j.dispatch.status==='open'),mine:jobs.filter(j=>mine(j)&&j.dispatch.status!=='delivered'),all:jobs};
  for(const k in groups)$(k+'-count').textContent=k==='all'?jobs.filter(j=>j.dispatch.status!=='delivered').length:groups[k].length;
  for(const t of document.querySelectorAll('[data-tab]'))t.setAttribute('aria-selected',String(t.dataset.tab===tab));
  const list=groups[tab];
  const empty={open:['No open jobs','New delivery orders appear here as soon as they’re paid.'],mine:['Nothing on you','Accept a job from the Open tab.'],all:['No deliveries yet','Delivery orders from the last 12 hours show here.']}[tab];
  $('jobs').innerHTML=list.length?list.map(card).join(''):`<div class="empty"><b>${empty[0]}</b>${empty[1]}</div>`;
}

document.querySelector('.tabs').addEventListener('click',e=>{const t=e.target.closest('[data-tab]');if(!t)return;tab=t.dataset.tab;store.set('tab',tab);render()});

async function act(id,action,extra){
  busy.add(id);$('error').hidden=true;render();
  try{const {job}=await api(`/api/rider/jobs/${encodeURIComponent(id)}/${action}`,extra||{});jobs=jobs.map(j=>j.id===id?job:j);if(action==='accept'&&!extra?.courierRef){tab='mine';store.set('tab',tab)}}
  catch(e){if(e.message!=='auth'){$('error').dataset.kind='action';$('error').textContent=e.message;$('error').hidden=false}}
  finally{busy.delete(id);render()}
}
$('jobs').addEventListener('click',async e=>{
  const card=e.target.closest('.job');if(!card)return;const id=card.dataset.id,j=jobs.find(x=>x.id===id);
  const copy=e.target.closest('[data-copy]');
  if(copy){const value=copy.dataset.copy==='pick'?pickText(j):dropText(j);try{await navigator.clipboard.writeText(value);copy.textContent='Copied ✓'}catch{copy.textContent='Copy failed'}setTimeout(()=>render(),1500);return}
  const b=e.target.closest('[data-act]');if(!b||b.disabled)return;
  const action=b.dataset.act;
  if(action==='release'&&armed!==id){armed=id;render();setTimeout(()=>{if(armed===id){armed=null;render()}},4000);return}
  armed=null;
  act(id,action,action==='accept'?{method:b.dataset.method}:undefined);
});
$('jobs').addEventListener('submit',e=>{
  const f=e.target.closest('form[data-ref]');if(!f)return;e.preventDefault();
  const j=jobs.find(x=>x.id===f.closest('.job').dataset.id);
  act(j.id,'accept',{method:j.dispatch.method,courierRef:f.ref.value});
});

if(me)showBoard();else showSetup();
setInterval(load,5000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)load()});
