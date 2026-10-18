// Turns on web push alerts for this browser (see sw.js and push.js on the server).
// window.punchbookPush.enable(path, headers) asks permission and registers; .state() says where things stand.
window.punchbookPush=(()=>{
  const supported='serviceWorker' in navigator&&'PushManager' in window&&'Notification' in window;
  const toKey=b64=>{const s=atob((b64+'='.repeat((4-b64.length%4)%4)).replace(/-/g,'+').replace(/_/g,'/'));return Uint8Array.from(s,c=>c.charCodeAt(0))};
  async function registration(){return navigator.serviceWorker.register('/sw.js')}
  async function state(){
    if(!supported)return'unsupported';
    if(Notification.permission==='denied')return'blocked';
    const reg=await navigator.serviceWorker.getRegistration('/');
    return reg&&await reg.pushManager.getSubscription()?'on':'off';
  }
  async function enable(path,headers={}){
    if(!supported)throw Error('This browser can’t show alerts. On Android use Chrome; on iPhone add the page to your home screen first.');
    if(await Notification.requestPermission()!=='granted')throw Error('Alerts are blocked. Allow notifications for this site in your browser settings.');
    const reg=await registration();await navigator.serviceWorker.ready;
    const {publicKey}=await fetch('/api/push/key').then(r=>r.json());
    let sub=await reg.pushManager.getSubscription();
    if(sub&&btoa(String.fromCharCode(...new Uint8Array(sub.options.applicationServerKey||[]))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')!==publicKey){await sub.unsubscribe();sub=null}
    sub||=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:toKey(publicKey)});
    const res=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify({subscription:sub.toJSON()})});
    if(!res.ok)throw Error((await res.json().catch(()=>({}))).error||'Couldn’t turn on alerts.');
  }
  return{supported,state,enable};
})();
