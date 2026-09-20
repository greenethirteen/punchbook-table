let cardStream=null,cardScannerOpen=false;

function loadCardOCR(){
  return new Promise((resolve,reject)=>{
    if(window.Tesseract)return resolve(window.Tesseract);
    const script=document.createElement('script');
    script.src='https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
    script.onload=()=>resolve(window.Tesseract);
    script.onerror=()=>reject(new Error('OCR unavailable'));
    document.head.appendChild(script);
  });
}

function scannerStatus(message){const el=document.getElementById('cardScanStatus');if(el)el.textContent=message;}

async function startCardCamera(){
  if(!window.isSecureContext){
    scannerStatus('Camera requires a secure connection (HTTPS).');
    return false;
  }
  if(!navigator.mediaDevices||typeof navigator.mediaDevices.getUserMedia!=='function'){
    scannerStatus('This browser does not support camera access.');
    return false;
  }
  try{
    scannerStatus('Starting camera…');
    const stream=await navigator.mediaDevices.getUserMedia({
      audio:false,
      video:{facingMode:{ideal:'environment'},width:{ideal:1920},height:{ideal:1080}}
    });
    cardStream=stream;
    const video=document.getElementById('cardVideo');
    if(!video)throw new Error('Camera view unavailable');
    video.srcObject=stream;
    await video.play();
    scannerStatus('Ready. Place the card inside the frame.');
    return true;
  }catch(e){
    const name=e?.name||'CameraError';
    const messages={
      NotAllowedError:'Camera permission was blocked. Allow camera access for this site, then tap Try again.',
      PermissionDeniedError:'Camera permission was blocked. Allow camera access for this site, then tap Try again.',
      NotFoundError:'No camera was found on this device.',
      NotReadableError:'The camera is being used by another app. Close it and try again.',
      SecurityError:'Camera access was blocked by the browser security settings.',
      OverconstrainedError:'This camera does not support the requested mode.'
    };
    scannerStatus(messages[name]||('Could not open the camera ('+name+'). Tap Try again.'));
    return false;
  }
}

function openCardScanner(){
  if(cardScannerOpen)return;
  cardScannerOpen=true;
  const modal=document.createElement('div');
  modal.id='cardScanner';
  modal.innerHTML=`<div style="position:fixed;inset:0;background:#000;z-index:9999;display:flex;flex-direction:column;color:#fff">
    <div style="display:flex;justify-content:space-between;align-items:center;padding:18px 20px;font-weight:700">
      <span>Scan card</span>
      <button type="button" onclick="closeCardScanner()" style="background:transparent;border:0;color:#fff;font-size:16px">Cancel</button>
    </div>
    <div style="position:relative;flex:1;display:flex;align-items:center;justify-content:center;overflow:hidden">
      <video id="cardVideo" autoplay playsinline muted style="width:100%;height:100%;object-fit:cover;background:#111"></video>
      <div style="position:absolute;width:min(88vw,520px);aspect-ratio:1.586;border:2px solid #fff;border-radius:18px;box-shadow:0 0 0 9999px rgba(0,0,0,.28);pointer-events:none"></div>
      <div style="position:absolute;bottom:22px;left:20px;right:20px;text-align:center;font-size:14px;text-shadow:0 1px 4px #000;pointer-events:none">Place the front of your card inside the frame</div>
    </div>
    <div style="padding:18px 20px 28px;background:#000">
      <button id="captureCardBtn" type="button" onclick="captureCard()" style="display:block;margin:auto;width:68px;height:68px;border-radius:50%;border:6px solid #fff;background:#ddd;cursor:pointer" aria-label="Capture card"></button>
      <div id="cardScanStatus" style="text-align:center;margin-top:12px;color:#bbb;font-size:13px;min-height:18px">Starting camera…</div>
      <button id="retryCameraBtn" type="button" onclick="startCardCamera()" style="display:none;margin:10px auto 0;padding:10px 16px;border:1px solid #555;border-radius:10px;background:#222;color:#fff;cursor:pointer">Try again</button>
    </div>
    <canvas id="cardCanvas" style="display:none"></canvas>
  </div>`;
  document.body.appendChild(modal);
  startCardCamera().then(ok=>{
    const retry=document.getElementById('retryCameraBtn');
    if(retry)retry.style.display=ok?'none':'block';
    const capture=document.getElementById('captureCardBtn');
    if(capture)capture.disabled=!ok;
  });
}

function closeCardScanner(){
  if(cardStream){cardStream.getTracks().forEach(t=>t.stop());cardStream=null;}
  document.getElementById('cardScanner')?.remove();
  cardScannerOpen=false;
}

async function captureCard(){
  const video=document.getElementById('cardVideo'),canvas=document.getElementById('cardCanvas'),button=document.getElementById('captureCardBtn');
  if(!video||!canvas||video.readyState<2){scannerStatus('Camera is not ready yet.');return;}
  button.disabled=true;
  scannerStatus('Reading card…');
  canvas.width=video.videoWidth;
  canvas.height=video.videoHeight;
  canvas.getContext('2d').drawImage(video,0,0);
  try{
    const Tesseract=await loadCardOCR();
    const result=await Tesseract.recognize(canvas,'eng',{logger:m=>{if(m.status==='recognizing text')scannerStatus('Reading card… '+Math.round((m.progress||0)*100)+'%');}});
    const parsed=parseCardOCR(result.data.text||'');
    if(parsed.number)document.getElementById('cardnumber').value=parsed.number;
    if(parsed.expiry)document.getElementById('cardexpiry').value=parsed.expiry;
    if(parsed.name)document.getElementById('cardname').value=parsed.name;
    closeCardScanner();
    if(parsed.number||parsed.expiry||parsed.name){
      alert('Card scanned. Please check the details and enter CVC manually.');
      document.getElementById('cardcvc')?.focus();
    }else alert('Could not read the card. Try again in good light with the card inside the frame.');
  }catch(e){
    closeCardScanner();
    alert('Card scanning failed. You can enter the details manually.');
  }
}

function parseCardOCR(raw){
  const lines=raw.split(/\r?\n/).map(x=>x.replace(/[^A-Za-z0-9/ -]/g,' ').replace(/\s+/g,' ').trim()).filter(Boolean);
  let number='';
  const candidates=lines.map(x=>x.replace(/[OoQqDd]/g,'0').replace(/[Il|]/g,'1').replace(/\D/g,'')).filter(x=>x.length>=13&&x.length<=19);
  if(candidates.length)number=candidates.sort((a,b)=>Math.abs(a.length-16)-Math.abs(b.length-16))[0];
  if(!number){
    const m=raw.replace(/[OoQqDd]/g,'0').replace(/[Il|]/g,'1').match(/(?:\d[ -]?){13,19}/g)||[];
    const nums=m.map(x=>x.replace(/\D/g,'')).filter(x=>x.length>=13&&x.length<=19);
    if(nums.length)number=nums[0];
  }
  let expiry='';
  const e=raw.match(/(?:0?[1-9]|1[0-2])[ \/-](?:\d{2}|\d{4})/);
  if(e){const p=e[0].match(/\d+/g);let y=p[1];if(y.length===4)y=y.slice(-2);expiry=p[0].padStart(2,'0')+' / '+y;}
  let name='';
  const bad=/^(visa|mastercard|debit|credit|platinum|gold|signature|world|infinite|valid|thru|bank|card|member|since|maestro|amex)$/i;
  const names=lines.filter(x=>/[A-Za-z]{3}/.test(x)&&!/[0-9]{3,}/.test(x)&&x.split(' ').length>=2&&!bad.test(x));
  if(names.length)name=names.sort((a,b)=>b.length-a.length)[0].replace(/\b(VALID|THRU|FROM|BANK|CARD)\b/gi,'').trim().toUpperCase();
  return {number:number?number.replace(/(\d{4})(?=\d)/g,'$1 '):'',expiry,name};
}

window.openCardScanner=openCardScanner;
window.scanCard=()=>openCardScanner();
