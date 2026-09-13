const keyInput=document.getElementById('admin-key');
const loadBtn=document.getElementById('load');
const listEl=document.getElementById('company-list');
const message=document.getElementById('message');
const search=document.getElementById('search');
const statusFilter=document.getElementById('status-filter');
const drawer=document.getElementById('drawer');
const detailTitle=document.getElementById('detail-title');
const detailRef=document.getElementById('detail-ref');
const details=document.getElementById('details');
const docs=document.getElementById('docs');
const editStatus=document.getElementById('edit-status');
const notes=document.getElementById('admin-notes');
const saveStatus=document.getElementById('save-status');
const saveMessage=document.getElementById('save-message');
let companies=[];
let active=null;

keyInput.value=sessionStorage.getItem('punchbookAdminKey')||'';
const key=()=>keyInput.value.trim();
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>Number(n||0).toLocaleString('en-LK');

async function load(){
  if(!key()){message.textContent='Enter the admin key.';return;}
  sessionStorage.setItem('punchbookAdminKey',key());
  message.textContent='Loading…';
  const res=await fetch('/api/admin/companies',{headers:{'x-admin-key':key()}});
  const data=await res.json().catch(()=>({}));
  if(!res.ok){message.textContent=data.error||'Could not load applications.';companies=[];render();return;}
  companies=data.companies||[];message.textContent='';render();
}

function render(){
  const q=search.value.trim().toLowerCase(), st=statusFilter.value;
  const rows=companies.filter(c=>{
    const hay=[c.companyName,c.tradingName,c.registrationNumber,c.contactName,c.email].join(' ').toLowerCase();
    return (!q||hay.includes(q))&&(!st||c.status===st);
  });
  if(!rows.length){listEl.innerHTML='<div class="empty">No matching company applications.</div>';return;}
  listEl.innerHTML=rows.map(c=>`<article class="company-row" data-id="${esc(c.id)}"><div><strong>${esc(c.tradingName||c.companyName)}</strong><small>${esc(c.companyName)} · ${esc(c.registrationNumber)}</small></div><div>${esc(c.contactName)}<small>${esc(c.email)}</small></div><div><span class="badge ${esc(c.status)}">${esc(c.status)}</span><small>${new Date(c.createdAt).toLocaleDateString()}</small></div><button type="button">Review →</button></article>`).join('');
  document.querySelectorAll('.company-row').forEach(el=>el.addEventListener('click',()=>openCompany(el.dataset.id)));
}

async function openCompany(id){
  saveMessage.textContent='';
  const res=await fetch(`/api/admin/companies/${encodeURIComponent(id)}`,{headers:{'x-admin-key':key()}});
  const data=await res.json().catch(()=>({}));
  if(!res.ok){message.textContent=data.error||'Could not load application.';return;}
  active=data.company;
  detailTitle.textContent=active.tradingName||active.companyName;
  detailRef.textContent=`${active.reference} · Submitted ${new Date(active.createdAt).toLocaleString()}`;
  const fields=[
    ['Registered company',active.companyName],['BR number',active.registrationNumber],['Business type',active.businessType],['Category',active.businessCategory],['Registered address',active.registeredAddress],['Website',active.website||'—'],
    ['Contact',active.contactName],['Role',active.contactRole],['Email',active.email],['Phone',active.phone],['NIC / passport',active.nicNumber],
    ['Bank',active.bankName],['Branch',active.bankBranch],['Account name',active.bankAccountName],['Account number',active.bankAccountNumber],['Avg. transaction',`LKR ${fmt(active.averageTransactionValue)}`],['Monthly volume',`LKR ${fmt(active.monthlyVolume)}`]
  ];
  details.innerHTML=fields.map(([a,b])=>`<div class="detail"><span>${esc(a)}</span><strong>${esc(b)}</strong></div>`).join('');
  docs.innerHTML=Object.entries(active.documents||{}).map(([name,d])=>`<a target="_blank" rel="noopener" href="/api/admin/companies/${encodeURIComponent(active.id)}/document/${encodeURIComponent(name)}?key=${encodeURIComponent(key())}"><span>${esc(d.name||name)}</span><span>Open ↗</span></a>`).join('')||'<p>No documents.</p>';
  editStatus.value=active.status||'submitted';notes.value=active.adminNotes||'';drawer.hidden=false;
}

async function save(){
  if(!active)return;
  saveStatus.disabled=true;saveMessage.textContent='Saving…';
  try{
    const res=await fetch(`/api/admin/companies/${encodeURIComponent(active.id)}/status`,{method:'PATCH',headers:{'Content-Type':'application/json','x-admin-key':key()},body:JSON.stringify({status:editStatus.value,adminNotes:notes.value})});
    const data=await res.json().catch(()=>({}));
    if(!res.ok)throw new Error(data.error||'Could not save review.');
    saveMessage.textContent='Saved.';active=data.company;await load();
  }catch(e){saveMessage.textContent=e.message;}finally{saveStatus.disabled=false;}
}

loadBtn.addEventListener('click',load);search.addEventListener('input',render);statusFilter.addEventListener('change',render);saveStatus.addEventListener('click',save);document.getElementById('close').addEventListener('click',()=>drawer.hidden=true);drawer.addEventListener('click',e=>{if(e.target===drawer)drawer.hidden=true;});
if(key())load();
