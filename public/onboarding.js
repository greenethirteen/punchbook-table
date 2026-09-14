const form = document.getElementById('company-form');
const submitBtn = document.getElementById('submit-btn');
const statusEl = document.getElementById('form-status');
const MAX_FILE = 3 * 1024 * 1024;
const ALLOWED = ['application/pdf','image/jpeg','image/png'];

async function fileToPayload(file){
  if(!file) return null;
  if(file.size > MAX_FILE) throw new Error(`${file.name} is larger than 3 MB.`);
  if(!ALLOWED.includes(file.type)) throw new Error(`${file.name} must be a PDF, JPG or PNG.`);
  const data = await new Promise((resolve,reject)=>{
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = () => reject(new Error(`Could not read ${file.name}.`));
    r.readAsDataURL(file);
  });
  return { name:file.name, type:file.type, size:file.size, data };
}

form.addEventListener('submit', async e=>{
  e.preventDefault();
  statusEl.textContent = '';
  submitBtn.disabled = true;
  submitBtn.textContent = 'Submitting…';
  try{
    const fd = new FormData(form);
    const docs = {
      businessRegistration: await fileToPayload(fd.get('businessRegistration')),
      identityDocument: await fileToPayload(fd.get('identityDocument')),
      bankProof: await fileToPayload(fd.get('bankProof'))
    };
    const payload = {};
    for(const [key,value] of fd.entries()){
      if(value instanceof File || key === 'declaration') continue;
      payload[key] = String(value).trim();
    }
    payload.documents = docs;
    payload.declaration = fd.get('declaration') === 'on';
    payload.consent = payload.declaration;

    const res = await fetch('/api/companies', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify(payload)
    });
    const data = await res.json().catch(()=>({}));
    if(!res.ok) throw new Error(data.error || 'Could not submit.');
    window.location.href = `/signup-success.html?ref=${encodeURIComponent(data.reference)}`;
  }catch(err){
    statusEl.textContent = err.message || 'Something went wrong.';
  }finally{
    submitBtn.disabled = false;
    submitBtn.textContent = 'Submit →';
  }
});
