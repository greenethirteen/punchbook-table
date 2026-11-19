// Light/dark switch for HQ and Earnings. The choice is remembered in this browser; until one is made,
// the page follows the device setting. Each page sets data-theme early (inline in <head>) to avoid a flash.
(()=>{
  const KEY='pb-theme',root=document.documentElement;
  const saved=()=>{try{return localStorage.getItem(KEY)}catch{return null}};
  const system=()=>matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';
  const SUN='<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
  const MOON='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>';
  function apply(t){
    root.dataset.theme=t;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content',t==='light'?'#f3f5fa':'#080c17');
    const b=document.getElementById('theme');
    if(b){const next=t==='light'?'dark':'light';b.innerHTML=(t==='light'?MOON:SUN)+`<span>${next==='light'?'Light':'Dark'} mode</span>`;b.setAttribute('aria-label',`Switch to ${next} mode`)}
  }
  apply(saved()||system());
  matchMedia('(prefers-color-scheme: light)').addEventListener?.('change',()=>{if(!saved())apply(system())});
  document.getElementById('theme')?.addEventListener('click',()=>{const t=root.dataset.theme==='light'?'dark':'light';try{localStorage.setItem(KEY,t)}catch{}apply(t)});
})();
