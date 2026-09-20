let data=null, cart={}, selected='All', payMethod='card';
const table=(location.pathname.match(/\/t\/([^/]+)/)||[])[1]||'12';
document.getElementById('tablePill').textContent='Table '+table;
const money=n=>'LKR '+Number(n).toLocaleString('en-LK');
const iconPaths = {
  card: '<rect x="8" y="15" width="48" height="34" rx="5"/><path d="M8 26h48M17 39h11"/>',
  bank: '<path d="m8 22 24-13 24 13ZM12 51h40M18 29v16m14-16v16m14-16v16"/>'
};
function icon(name){return `<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${iconPaths[name]||''}</svg>`;}
function cardBrands(){return '<span style="display:inline-flex;align-items:center;gap:5px;margin-left:7px;vertical-align:middle" aria-label="Visa, Mastercard"><span style="font-size:10px;font-weight:800;font-style:italic;color:#1434CB">VISA</span><span style="display:inline-flex;align-items:center;font-size:8px;font-weight:800"><span style="display:inline-block;width:13px;height:13px;border-radius:50%;background:#EB001B"></span><span style="display:inline-block;width:13px;height:13px;border-radius:50%;background:#F79E1B;margin-left:-6px;opacity:.95"></span></span></span>';}
async function boot(){ data=await fetch(location.pathname.startsWith('/amraleaf-v3')?'/api/menu?restaurant=amra':'/api/menu').then(r=>r.json()); renderCats(); renderMenu(); }
function renderCats(){ const cats=['All',...new Set(data.menu.map(x=>x.category))];document.getElementById('cats').innerHTML=cats.map(c=>`<button data-category="${c}" class="cat ${c===selected?'active':''}" onclick="selected='${c}';renderCats();renderMenu()">${c}</button>`).join(''); }
function renderMenu(){ const items=data.menu.filter(x=>selected==='All'||x.category===selected); document.getElementById('menu').innerHTML=items.map(x=>`<article class="item" data-category="${x.category}"><div><h3>${x.name}</h3><p>${x.desc}</p><div class="row"><span class="price">${money(x.price)}</span><button class="add" aria-label="Add ${x.name}" onclick="add('${x.id}')">+</button></div></div><div class="food"><img src="${x.image||('/images/menu/'+x.id+'.jpg')}" alt="${x.name}" width="600" height="600" loading="lazy" decoding="async"></div></article>`).join(''); }
function add(id){cart[id]=(cart[id]||0)+1;syncCart();}
function change(id,d){cart[id]=Math.max(0,(cart[id]||0)+d);if(!cart[id])delete cart[id];syncCart();renderCart();}
function summary(){const rows=Object.entries(cart).map(([id,qty])=>({...data.menu.find(x=>x.id===id),qty}));const subtotal=rows.reduce((s,x)=>s+x.price*x.qty,0);const service=Math.round(subtotal*.05);return{rows,subtotal,service,total:subtotal+service};}
function syncCart(){const s=summary(), count=s.rows.reduce((n,x)=>n+x.qty,0), bar=document.getElementById('cartbar');bar.classList.toggle('show',count>0);document.getElementById('cartCount').textContent=count+' item'+(count===1?'':'s');document.getElementById('cartPrice').textContent=money(s.total);}
function openCart(){document.getElementById('sheet').classList.add('open');renderCart();}function closeCart(){document.getElementById('sheet').classList.remove('open');}
function renderCart(){const s=summary();document.getElementById('sheetContent').innerHTML=`<div class="checkoutBlock orderBlock"><h2>Your order · Table ${table}</h2>${s.rows.map(x=>`<div class="cartLine"><div><b>${x.name}</b><div style="color:#777;font-size:13px">${money(x.price)}</div></div><div class="qty"><button onclick="change('${x.id}',-1)">−</button><b>${x.qty}</b><button onclick="change('${x.id}',1)">+</button></div></div>`).join('')}<div class="totals"><div class="totalrow"><span>Subtotal</span><span>${money(s.subtotal)}</span></div><div class="totalrow"><span>Service charge · 5%</span><span>${money(s.service)}</span></div><div class="totalrow big"><span>Total</span><span>${money(s.total)}</span></div></div></div><div class="checkoutBlock paymentBlock"><div class="payChoices"><button class="pay ${payMethod==='card'?'selected':''}" onclick="payMethod='card';renderCart()"><b>${icon('card')} Card ${cardBrands()}</b><small>Visa / Mastercard</small></button><button class="pay ${payMethod==='justpay'?'selected':''}" onclick="payMethod='justpay';renderCart()"><b>${icon('bank')} JustPay</b><small>Bank account payment</small></button></div><button class="primary" onclick="placeOrder()">Pay ${money(s.total)}</button></div><p class="prototypeNote">Prototype mode · No real money moves unless live gateway credentials are configured.</p>`;}
async function createOrder(customer={}){const items=Object.entries(cart).map(([id,qty])=>({id,qty}));return fetch('/api/orders',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({table,items,customer,paymentMethod:payMethod})}).then(r=>r.json());}
async function placeOrder(){if(payMethod==='card')return showCardForm();const order=await createOrder();if(order.error)return alert(order.error);return justPay(order);}
function showCardForm(){const s=summary();document.getElementById('sheetContent').innerHTML=`<div class="checkoutBlock cardBlock"><h2>Card details</h2><p class="checkoutSub">Pay ${money(s.total)} for Table ${table}</p><div class="fields" style="margin-top:22px"><div style="position:relative"><input class="wide" id="cardname" placeholder="Name on card"><button type="button" aria-label="Scan card" onclick="scanCard()" style="position:absolute;right:8px;top:7px;width:42px;height:42px;border:1px solid #ddd;border-radius:10px;background:#fff;font-size:19px;cursor:pointer">📷</button></div><input class="wide" id="cardnumber" inputmode="numeric" autocomplete="cc-number" placeholder="Card number"><input id="cardexpiry" inputmode="numeric" autocomplete="cc-exp" placeholder="MM / YY"><input id="cardcvc" inputmode="numeric" autocomplete="cc-csc" placeholder="CVC"></div><div class="checkoutTotal"><div class="totalrow big"><span>Total</span><span>${money(s.total)}</span></div></div><button class="primary" onclick="confirmCardPayment()">Pay ${money(s.total)}</button><button class="pay backButton" onclick="renderCart()"><b>← Back</b></button></div><p class="prototypeNote">Tap the camera to scan card details. Demo scan auto-fills the form.</p>`;}
let cardStream=null;
let cardScannerOpen=false;

function loadCardOCR(){
  return new Promise((resolve,reject)=>{
    if(window.Tesseract)return resolve(window.Tesseract);
    const existing=document.querySelector('script[data-tesseract]');
    if(existing){existing.addEventListener('load',()=>resolve(window.Tesseract));existing.addEventListener('error',reject);return;}
    const script=document.createElement('script');
    script.src='https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
    script.dataset.tesseract='1';
    script.onload=()=>resolve(window.Tesseract);
    script.onerror=()=>reject(new Error('Could not load the card scanner.'));
    document.head.appendChild(script);
  });
}

function openCardScanner(){
  if(cardScannerOpen)return;
  cardScannerOpen=true;
  const modal=document.createElement('div');
  modal.id='cardScanner';
  modal.innerHTML=`<div style="position:fixed;inset:0;background:#000;z-index:9999;display:flex;flex-direction:column;color:#fff">
    <div style="display:flex;align-items:center;justify-content:space-between;padding:18px 20px;font-weight:700">
      <span>Scan card</span><button type="button" onclick="closeCardScanner()" style="background:transparent;border:0;color:#fff;font-size:16px">Cancel</button>
    </div>
    <div style="position:relative;flex:1;display:flex;align-items:center;justify-content:center;overflow:hidden">
      <video id="cardVideo" autoplay playsinline muted style="width:100%;height:100%;object-fit:cover"></video>
      <div style="position:absolute;width:min(88vw,520px);aspect-ratio:1.586/1;border:2px solid #fff;border-radius:18px;box-shadow:0 0 0 9999px rgba(0,0,0,.28)"></div>
      <div style="position:absolute;bottom:22px;left:20px;right:20px;text-align:center;font-size:14px;text-shadow:0 1px 4px #000">Place the front of your card inside the frame</div>
    </div>
    <div style="padding:18px 20px 28px;background:#000">
      <button id="captureCardBtn" type="button" onclick="captureCard()" style="display:block;margin:auto;width:68px;height:68px;border-radius:50%;border:6px solid #fff;background:#ddd;font-size:0;cursor:pointer" aria-label="Capture card"></button>
      <div id="cardScanStatus" style="text-align:center;margin-top:12px;color:#bbb;font-size:13px"></div>
    </div>
    <canvas id="cardCanvas" style="display:none"></canvas>
  </div>`;
  document.body.appendChild(modal);
  navigator.mediaDevices?.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1920},height:{ideal:1080}},audio:false})
    .then(stream=>{cardStream=stream;const video=document.getElementById('cardVideo');if(video)video.srcObject=stream;})
    .catch(()=>{const s=document.getElementById('cardScanStatus');if(s)s.textContent='Camera access is unavailable. Please allow camera access and try again.';});
}

function closeCardScanner(){
  if(cardStream){cardStream.getTracks().forEach(t=>t.stop());cardStream=null;}
  document.getElementById('cardScanner')?.remove();
  cardScannerOpen=false;
}

async function captureCard(){
  const video=document.getElementById('cardVideo');
  const canvas=document.getElementById('cardCanvas');
  const button=document.getElementById('captureCardBtn');
  const status=document.getElementById('cardScanStatus');
  if(!video||!canvas||video.readyState<2)return;
  button.disabled=true;button.style.opacity='.5';status.textContent='Reading card…';
  canvas.width=video.videoWidth;canvas.height=video.videoHeight;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});
  ctx.drawImage(video,0,0,canvas.width,canvas.height);
  try{
    const Tesseract=await loadCardOCR();
    const result=await Tesseract.recognize(canvas,'eng',{logger:m=>{
      if(m.status==='recognizing text'&&m.progress)status.textContent=`Reading card… ${Math.round(m.progress*100)}%`;
    }});
    const text=result.data.text||'';
    const parsed=parseCardOCR(text);
    if(parsed.number)document.getElementById('cardnumber').value=parsed.number;
    if(parsed.expiry)document.getElementById('cardexpiry').value=parsed.expiry;
    if(parsed.name)document.getElementById('cardname').value=parsed.name;
    closeCardScanner();
    if(parsed.number||parsed.expiry||parsed.name){
      const missing=[];
      if(!parsed.number)missing.push('card number');
      if(!parsed.expiry)missing.push('expiry');
      if(!parsed.name)missing.push('name');
      alert(missing.length?`Card scanned. Please check the details and enter the missing ${missing.join(', ')}.`:'Card scanned. Please check the details before paying. Enter CVC manually.');
      document.getElementById('cardcvc')?.focus();
    }else{
      alert('Could not read the card. Try again with the card flat, well lit and inside the frame.');
    }
  }catch(e){
    closeCardScanner();
    alert('Card scanning failed. Please try again or enter the details manually.');
  }
}

function parseCardOCR(raw){
  const lines=raw.split(/\\r?\\n/).map(x=>x.replace(/[^A-Za-z0-9\\/\\- ]/g,' ').replace(/\\s+/g,' ').trim()).filter(Boolean);
  const compact=raw.replace(/[^0-9]/g,'');
  let number='';
  const candidates=lines.map(line=>line.replace(/[OoQqDd]/g,'0').replace(/[Il|]/g,'1').replace(/[Ss]/g,'5').replace(/[^0-9]/g,'')).filter(x=>x.length>=13&&x.length<=19);
  if(candidates.length)number=candidates.sort((a,b)=>Math.abs(a.length-16)-Math.abs(b.length-16))[0];
  if(!number){
    const spaced=raw.replace(/[OoQqDd]/g,'0').replace(/[Il|]/g,'1').match(/(?:\\d[ -]?){13,19}/g)||[];
    const nums=spaced.map(x=>x.replace(/\\D/g,'')).filter(x=>x.length>=13&&x.length<=19);
    if(nums.length)number=nums[0];
  }
  let expiry='';
  const exp=raw.match(/(?:0?[1-9]|1[0-2])\\s*[\\/\\-]\\s*(?:2?\\d{2}|\\d{2})/);
  if(exp){
    const m=exp[0].match(/\\d+/g);
    if(m?.length>=2){let y=m[1];if(y.length===4)y=y.slice(-2);expiry=String(m[0]).padStart(2,'0')+' / '+y;}
  }
  let name='';
  const bad=/^(visa|mastercard|debit|credit|platinum|gold|signature|world|infinite|valid|thru|good|bank|card|member|since|maestro|amex|american express)$/i;
  const nameLines=lines.filter(x=>/[A-Za-z]{3}/.test(x)&&!/[0-9]{3,}/.test(x)&&x.split(' ').length>=2&&!bad.test(x));
  if(nameLines.length)name=nameLines.sort((a,b)=>b.length-a.length)[0].replace(/\\b(VALID|THRU|FROM|BANK|CARD)\\b/gi,'').replace(/\\s+/g,' ').trim().toUpperCase();
  return{number:number?number.replace(/(\\d{4})(?=\\d)/g,'$1 '):'',expiry,name};
}

async function scanCard(){openCardScanner();}
async function confirmCardPayment(){const fullName=(document.getElementById('cardname')?.value||'').trim();const parts=fullName.split(/\s+/).filter(Boolean);const customer={firstName:parts[0]||'',lastName:parts.slice(1).join(' ')};const order=await createOrder(customer);if(order.error)return alert(order.error);const result=await fetch('/api/payments/card',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({orderId:order.id})}).then(r=>r.json());if(result.redirectUrl){location.href=result.redirectUrl;return;}if(result.ok)showSuccess(result.order,result.simulated?'Card sandbox simulation':'Card');else alert(result.error||'Payment failed');}
async function justPay(order){document.getElementById('sheetContent').innerHTML=`<div class="checkoutBlock justpayBlock"><h2>Pay with JustPay</h2><p class="checkoutSub">Enter your bank details.</p><div class="fields" style="margin-top:22px"><select class="wide" id="jpbank"><option value="">Select your bank</option><option>Amana Bank</option><option>Commercial Bank</option><option>Hatton National Bank</option><option>People's Bank</option><option>Sampath Bank</option><option>Bank of Ceylon</option></select><input class="wide" id="jpaccount" inputmode="numeric" placeholder="Bank account number"><input class="wide" id="jpname" placeholder="Account holder name"></div><div class="checkoutTotal"><div class="totalrow big"><span>Authorise</span><span>${money(order.total)}</span></div></div><button class="primary" onclick="justPayNext('${order.id}')">Next</button><button class="pay backButton" onclick="renderCart()"><b>← Back</b></button></div><p class="prototypeNote">Simulated JustPay verification for prototype testing.</p>`;}
function justPayNext(id){const bank=document.getElementById('jpbank')?.value,account=(document.getElementById('jpaccount')?.value||'').trim(),name=(document.getElementById('jpname')?.value||'').trim();if(!bank||!account||!name)return alert('Please select your bank and enter your account number and name.');document.getElementById('sheetContent').innerHTML=`<div class="checkoutBlock justpayBlock"><h2>Verify with OTP</h2><p class="checkoutSub">Enter the 4-digit code sent to your mobile number.</p><div style="display:flex;justify-content:center;gap:10px;margin:28px 0"><input class="otpBox" maxlength="1" inputmode="numeric" value="1"><input class="otpBox" maxlength="1" inputmode="numeric" value="2"><input class="otpBox" maxlength="1" inputmode="numeric" value="3"><input class="otpBox" maxlength="1" inputmode="numeric" value="4"></div><div class="checkoutTotal"><div class="totalrow big"><span>Authorise</span><span>${money(summary().total)}</span></div></div><button class="primary" onclick="confirmJustPay('${id}')">Verify & pay</button><button class="pay backButton" onclick="renderCart()"><b>← Back</b></button></div><p class="prototypeNote">Demo OTP: 1234</p>`;}
async function confirmJustPay(id){const result=await fetch('/api/payments/justpay/simulate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({orderId:id})}).then(r=>r.json());showSuccess(result.order,'JustPay demo');}
function startArrivalCountdown(seconds=600){const el=document.getElementById('arrivalCountdown');if(!el)return;let remaining=seconds;const render=()=>{const mins=Math.floor(remaining/60);const secs=remaining%60;el.textContent=`${mins}:${String(secs).padStart(2,'0')}`;if(remaining<=0){clearInterval(timer);const label=document.getElementById('arrivalLabel');if(label)label.textContent='Ready now';return;}remaining-=1;};render();const timer=setInterval(render,1000);}
function showSuccess(order,label){cart={};syncCart();document.getElementById('sheetContent').innerHTML=`<div class="success"><div class="check">✓</div><div class="eyebrow">Payment confirmed</div><h2 style="font-size:30px;margin:8px 0">Order sent to the kitchen.</h2><p style="color:#666">Table ${order.table} · ${money(order.total)} · ${label}</p><div style="background:#f6f5f0;border-radius:18px;padding:18px 20px;margin:20px 0;text-align:center"><div id="arrivalLabel" style="font-size:14px;font-weight:700;color:#666;margin-bottom:3px">Ready in</div><div id="arrivalCountdown" style="font-size:46px;font-weight:800;letter-spacing:-2px;line-height:1">10:00</div></div><div class="ref">Order ${order.id} · ${order.paymentRef||'Payment recorded'}</div><button class="primary" style="margin-top:20px" onclick="closeCart()">Done</button></div>`;startArrivalCountdown(600);}
boot();