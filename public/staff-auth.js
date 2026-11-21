// Shared by the staff screens (/admin, /pickup-admin, /accounts, /hq, /owner-admin). Adds the staff key
// to this page's /api/ requests, asks for it when the server says 401, shows who is signed in and any
// setup warnings, and offers window.staffAlert() for a new-order sound. See staff.js on the server.
(()=>{
  const KEY='pb-staff-key';
  const read=()=>{try{return localStorage.getItem(KEY)||''}catch{return''}};
  const write=v=>{try{v?localStorage.setItem(KEY,v):localStorage.removeItem(KEY)}catch{}};
  const css=`.staff-bar{display:flex;flex-wrap:wrap;align-items:center;gap:8px 14px;padding:8px max(16px,calc((100vw - 1200px)/2));background:#244633;color:#fff;font:600 12px/1.4 Inter,system-ui,sans-serif}
.staff-bar button{border:1px solid #ffffff55;background:transparent;color:#fff;border-radius:16px;padding:6px 12px;min-height:32px;font:inherit;cursor:pointer}
.staff-bar .sp{margin-left:auto}.staff-warn{background:#963517;color:#fff;padding:10px max(16px,calc((100vw - 1200px)/2));font:600 12px/1.5 Inter,system-ui,sans-serif}
`;
  document.head.insertAdjacentHTML('beforeend',`<style>${css}</style>`);

  // Not signed in (or the session ended): go to the sign-in page, then come back here.
  let loginShown=false;
  function showLogin(wrong){
    if(loginShown)return;loginShown=true;write('');
    location.replace('/dashboard?next='+encodeURIComponent(location.pathname+location.search+location.hash)+(wrong?'&expired=1':''));
  }

  const nativeFetch=window.fetch.bind(window);
  window.fetch=(input,init={})=>{
    const url=typeof input==='string'?input:input.url;
    if(!url.startsWith('/api/'))return nativeFetch(input,init);
    return nativeFetch(input,{...init,headers:{...(init.headers||{}),'x-staff-key':read()}}).then(r=>{if(r.status===401&&!url.startsWith('/api/rider/'))showLogin(Boolean(read()));return r});
  };

  // A short two-tone chime. Browsers only allow sound after a tap, hence the button.
  let audio=null;
  window.staffAlert=()=>{
    try{navigator.vibrate?.([200,100,200])}catch{}
    if(!audio)return;
    for(const [i,f] of [[0,880],[1,1175],[2,880],[3,1175]].entries()){const o=audio.createOscillator(),g=audio.createGain();o.frequency.value=f;g.gain.value=.2;o.connect(g).connect(audio.destination);o.start(audio.currentTime+i*.2);o.stop(audio.currentTime+i*.2+.16)}
  };

  window.staffReady=nativeFetch('/api/staff/me',{headers:{'x-staff-key':read()}}).then(async r=>{
    if(r.status===401){showLogin(Boolean(read()));return null}
    const me=await r.json();
    const bar=document.createElement('div');bar.className='staff-bar';
    bar.innerHTML=`<span>${me.role==='admin'?'Punchbook admin · all restaurants':'Signed in · '+String(me.restaurantName||me.restaurantId).replace(/[<>&]/g,'')}</span><button type="button" data-sound>🔔 Turn on order sound</button><button type="button" data-push hidden>📲 Alerts when closed</button>${me.open?'':'<button type="button" class="sp" data-out>Sign out</button>'}`;
    bar.querySelector('[data-sound]').addEventListener('click',e=>{audio||=new (window.AudioContext||window.webkitAudioContext)();audio.resume?.();e.target.textContent='🔔 Sound on';window.staffAlert()});
    bar.querySelector('[data-out]')?.addEventListener('click',()=>{write('');location.replace('/dashboard')});
    // Phone/desktop notifications for new orders, even with this page closed (push-client.js, sw.js).
    const pushBtn=bar.querySelector('[data-push]'),s=document.createElement('script');s.src='/push-client.js?v=1';
    s.onload=async()=>{const p=window.punchbookPush;if(!p.supported)return;const st=await p.state();pushBtn.hidden=false;if(st==='on')pushBtn.textContent='📲 Alerts on';
      pushBtn.addEventListener('click',async()=>{pushBtn.disabled=true;try{await p.enable('/api/push/staff');pushBtn.textContent='📲 Alerts on'}catch(e){pushBtn.textContent='📲 '+e.message}pushBtn.disabled=false})};
    document.head.append(s);
    document.body.prepend(bar);
    const warnings=[];
    if(me.open)warnings.push('Not locked: anyone with this link can see customer details and change orders. Set PUNCHBOOK_ADMIN_KEY (and RESTAURANT_KEYS) in Railway.');
    if(!me.persistent&&me.role==='admin')warnings.push('Orders are wiped on every deploy: add a Railway volume and set DATA_DIR to its path.');
    if(warnings.length){const w=document.createElement('div');w.className='staff-warn';w.innerHTML=warnings.join('<br>');bar.after(w)}
    return me;
  }).catch(()=>null);
})();
