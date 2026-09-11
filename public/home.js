const demoScreen = document.getElementById('phone-demo-screen');
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
let demoStage = 0;
let demoPaused = reduceMotion.matches;
let demoTimer;
const demoScreens = [
  `<p class="demo-step-label">01 / SELECT</p><h2>Choose your food.</h2><div class="demo-food-row"><span>🍔</span><div><b>Chicken Burger</b><small>LKR 1,750</small></div><span class="demo-add">+</span></div><div class="demo-food-row"><span>🍹</span><div><b>Passion Fruit Mojito</b><small>LKR 790</small></div><span class="demo-add">+</span></div><div class="demo-selection">✓ Burger added to your order</div><div class="demo-cta">View order · 1 item →</div>`,
  `<p class="demo-step-label">02 / CHECKOUT</p><h2>Review your order.</h2><div class="demo-food-row"><span>🍔</span><div><b>Chicken Burger</b><small>Quantity: 1</small></div></div><div class="demo-total"><span>Subtotal</span><b>LKR 1,750</b></div><div class="demo-total"><span>Service · 5%</span><b>LKR 88</b></div><div class="demo-total final-total"><span>Total</span><b>LKR 1,838</b></div><div class="demo-cta">Continue to payment →</div>`,
  `<p class="demo-step-label">03 / PAY</p><h2>Choose how to pay.</h2><div class="demo-payment selected-payment"><span>●</span><div><b>Card</b><small>Visa / Mastercard</small></div><span>✓</span></div><div class="demo-payment"><span>○</span><div><b>JustPay</b><small>Bank account</small></div></div><div class="demo-cta">Pay LKR 1,838 →</div><p class="demo-disclaimer">Demo payment · No charge</p>`,
  `<p class="demo-step-label">04 / CONFIRMED</p><div class="demo-success"><span>✓</span><h2>Order confirmed.</h2><p>Your order has been sent to the kitchen.</p><b>Table 12</b><small>Paid · LKR 1,838</small></div>`
];
let demoTransition;
let demoRevision = 0;
function renderDemo(){
  demoScreen.innerHTML = `<div class="demo-frame" data-demo-stage="${demoStage}">${demoScreens[demoStage]}</div>`;
}
async function advanceDemo(){
  const revision = demoRevision;
  const frame = demoScreen.firstElementChild;
  demoTransition = frame.animate([
    {opacity:1,transform:'translateX(0)'},
    {opacity:0,transform:'translateX(-18px)'}
  ],{duration:220,easing:'ease-in',fill:'forwards'});
  try { await demoTransition.finished; } catch { return; }
  if(revision !== demoRevision || demoPaused || document.hidden) return;
  demoStage=(demoStage+1)%demoScreens.length;
  renderDemo();
  demoTransition=demoScreen.firstElementChild.animate([
    {opacity:0,transform:'translateX(22px)'},
    {opacity:1,transform:'translateX(0)'}
  ],{duration:360,easing:'cubic-bezier(.2,.8,.2,1)'});
  try { await demoTransition.finished; } catch { return; }
  if(revision === demoRevision) scheduleDemo();
}
function scheduleDemo(){
  clearTimeout(demoTimer);
  if(!demoPaused && !document.hidden) demoTimer=setTimeout(advanceDemo,4000);
}
function resetDemoPlayback(){
  demoRevision++;
  clearTimeout(demoTimer);
  demoTransition?.cancel();
  renderDemo();
  scheduleDemo();
}
reduceMotion.addEventListener('change',event=>{
  demoPaused=event.matches;
  resetDemoPlayback();
});
document.addEventListener('visibilitychange',resetDemoPlayback);
renderDemo();
scheduleDemo();
