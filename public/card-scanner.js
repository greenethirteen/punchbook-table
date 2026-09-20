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
