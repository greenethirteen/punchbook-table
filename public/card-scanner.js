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

function openCardScanner(){
  if(cardScannerOpen)return;
  cardScannerOpen=true;
  const modal=document.createElement('div');
  modal.id='cardScanner';
  modal.innerHTML=`<div style="position:fixed;inset:0;background:#000;z-index:9999;display:flex;flex-direction:column;color:#fff">
    <div style="display:flex;justify-content:space-between;padding:18px 20px;font-weight:700"><span>Scan card</span><button type="button" onclick="closeCardScanner()" style="background:transparent;border:0;color:#fff;font-size:16px">Cancel</button></div>
    <div style="position:relative;flex:1;display:flex;align-items:center;justify-content:center;overflow:hidden">
      <video id="cardVideo" autoplay playsinline muted style="width:100%;height:100%;object-fit:cover"></video>
      <div style="position:absolute;width:min(88vw,520px);aspect-ratio:1.586;border:2px solid #fff;border-radius:18px;box-shadow:0 0 0 9999px rgba(0,0,0,.28)"></div>
      <div style="position:absolute;bottom:22px;left:20px;right:20px;text-align:center;font-size:14px">Place the front of your card inside the frame</div>
    </div>
    <div style="padding:18px 20px 28px;background:#000">
      <button id="captureCardBtn" type="button" onclick="captureCard()" style="display:block;margin:auto;width:68px;height:68px;border-radius:50%;border:6px solid #fff;background:#ddd;cursor:pointer" aria-label="Capture card"></button>
      <div id="cardScanStatus" style="text-align:center;margin-top:12px;color:#bbb;font-size:13px"></div>
    </div>
    <canvas id="cardCanvas" style="display:none"></canvas>
  </div>`;
  document.body.appendChild(modal);
  if(!navigator.mediaDevices?.getUserMedia){
    document.getElementById('cardScanStatus').textContent='Camera is not available in this browser.';
    return;
  }
  navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false})
    .then(stream=>{cardStream=stream;document.getElementById('cardVideo').srcObject=stream;})
    .catch(()=>{document.getElementById('cardScanStatus').textContent='Please allow camera access and try again.';});
}

function closeCardScanner(){
  if(cardStream){cardStream.getTracks().forEach(t=>t.stop());cardStream=null;}
  document.getElementById('cardScanner')?.remove();
  cardScannerOpen=false;
}

async function captureCard(){
  const video=document.getElementById('cardVideo'),canvas=document.getElementById('cardCanvas'),button=document.getElementById('captureCardBtn'),status=document.getElementById('cardScanStatus');
  if(!video||!canvas||video.readyState<2){alert('Camera is not ready yet.');return;}
  button.disabled=true;status.textContent='Reading card…';
  canvas.width=video.videoWidth;canvas.height=video.videoHeight;
  canvas.getContext('2d').drawImage(video,0,0);
  try{
    const Tesseract=await loadCardOCR();
    const result=await Tesseract.recognize(canvas,'eng',{logger:m=>{if(m.status==='recognizing text')status.textContent='Reading card… '+Math.round((m.progress||0)*100)+'%';}});
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
  const lines=raw.split(/\r?\n/).map(x=>x.replace(/[^A-Za-z0-9\/- ]/g,' ').replace(/\s+/g,' ').trim()).filter(Boolean);
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
