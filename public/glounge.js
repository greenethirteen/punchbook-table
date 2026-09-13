let data=null,cart={},selected='All',payMethod='card';
const table=(location.pathname.match(/\/t\/([^/]+)/)||[])[1]||'12';
const money=n=>'LKR '+Number(n).toLocaleString('en-LK');
const images={
 pasta:'https://images.unsplash.com/photo-1702827761984-205e57a3a633?auto=format&fit=crop&w=900&q=80',
 pasta2:'https://images.unsplash.com/photo-1621427016981-25b2381f5538?auto=format&fit=crop&w=900&q=80',
 chocolate:'https://images.unsplash.com/photo-1726039468346-2f3e0f1f5b52?auto=format&fit=crop&w=900&q=80',
 strawberry:'https://images.unsplash.com/photo-1579954115545-a95591f28bfc?auto=format&fit=crop&w=900&q=80',
 mango:'https://images.unsplash.com/photo-1546173159-315724a31696?auto=format&fit=crop&w=900&q=80',
 coffee:'https://images.unsplash.com/photo-1497636577773-f1231844b336?auto=format&fit=crop&w=900&q=80',
 coffee2:'https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&w=900&q=80',
 waffle:'https://images.unsplash.com/photo-1634215751955-5bdb12db6c0c?auto=format&fit=crop&w=900&q=80',
 waffle2:'https://images.unsplash.com/photo-1633997455043-434ee7ca3e1a?auto=format&fit=crop&w=900&q=80',
 burger:'https://images.unsplash.com/photo-1481070555726-e2fe8357725c?auto=format&fit=crop&w=900&q=80',
 wings:'https://images.unsplash.com/photo-1586809104697-1d438a00455f?auto=format&fit=crop&w=900&q=80',
 brownie:'https://images.unsplash.com/photo-1702827402870-7c33dc7b67be?auto=format&fit=crop&w=900&q=80',
 cake:'https://images.unsplash.com/photo-1540337706094-da10342c93d8?auto=format&fit=crop&w=900&q=80',
 enchilada:'https://images.unsplash.com/photo-1565299585323-38d6b0865b47?auto=format&fit=crop&w=900&q=80',
 slider:'https://images.unsplash.com/photo-1528735602780-2552fd46c7af?auto=format&fit=crop&w=900&q=80',
 pistachio:'https://images.unsplash.com/photo-1530373239216-42518e6b4063?auto=format&fit=crop&w=900&q=80'
};
const demoMenu=[
{id:'g1',category:'Popular',name:'Chicken Pasta',desc:'Creamy chicken pasta.',price:1550,image:images.pasta},
{id:'g2',category:'Popular',name:'Chocolate Blast',desc:'Rich chocolate waffle creation.',price:1215,image:images.chocolate},
{id:'g3',category:'Popular',name:'Chicken Enchilada',desc:'Two tortillas filled with chicken and special sauce, topped with cheese.',price:1850,image:images.enchilada},
{id:'g4',category:'Popular',name:'Pistachio Shake',desc:'Rich pistachio milkshake.',price:1360,image:images.pistachio},
{id:'g5',category:'Popular',name:'Chicken Slider',desc:'Two crispy chicken sliders with house sauce, cheese and jalapeno.',price:1070,image:images.slider},
{id:'g6',category:'Bubble Tea',name:'Strawberry Bubble Tea',desc:'Strawberry bubble tea.',price:790,image:images.strawberry},
{id:'g7',category:'Bubble Tea',name:'Passion Bubble Tea',desc:'Passion fruit bubble tea.',price:790,image:images.mango},
{id:'g8',category:'Bubble Tea',name:'Mango Bubble Tea',desc:'Mango bubble tea.',price:790,image:images.pasta2},
{id:'g9',category:'Coffee',name:'Cappuccino',desc:'Espresso with steamed milk and foam.',price:690,image:images.coffee},
{id:'g10',category:'Coffee',name:'Iced Spanish Latte',desc:'Espresso, milk and condensed milk served over ice.',price:890,image:images.coffee2},
{id:'g11',category:'Waffles',name:'Nutella Waffle',desc:'Warm waffle with Nutella and toppings.',price:1090,image:images.waffle},
{id:'g12',category:'Waffles',name:'Chocolate Waffle',desc:'Warm waffle with rich chocolate sauce.',price:1090,image:images.waffle2},
{id:'g13',category:'Mains',name:'Chicken Burger',desc:'Crispy chicken burger with cheese and house sauce.',price:1750,image:images.burger},
{id:'g14',category:'Mains',name:'Chicken Wings',desc:'Crispy chicken wings with house seasoning.',price:1650,image:images.wings},
{id:'g15',category:'Desserts',name:'Brownie with Ice Cream',desc:'Warm chocolate brownie served with vanilla ice cream.',price:990,image:images.brownie},
{id:'g16',category:'Desserts',name:'Chocolate Cake',desc:'Rich chocolate cake.',price:950,image:images.cake}
];
const iconPaths={card:'<rect x="8" y="15" width="48" height="34" rx="5"/><path d="M8 26h48M17 39h11"/>',bank:'<path d="m8 22 24-13 24 13ZM12 51h40M18 29v16m14-16v16m14-16v16"/>'};
function icon(name){return `<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${iconPaths[name]||''}</svg>`}
function boot(){data={menu:demoMenu};document.getElementById('tablePill').textContent='Table '+table;renderCats();renderMenu()}
function renderCats(){const cats=['All',...new Set(data.menu.map(x=>x.category))];document.getElementById('cats').innerHTML=cats.map(c=>`<button class="cat ${c===selected?'active':''}" onclick="selected='${c}';renderCats();renderMenu()">${c}</button>`).join('')}
function renderMenu(){const items=data.menu.filter(x=>selected==='All'||x.category===selected);document.getElementById('menu').innerHTML=items.map(x=>`<article class="item"><div><h3>${x.name}</h3><p>${x.desc}</p><div class="row"><span class="price">${money(x.price)}</span><button class="add" aria-label="Add ${x.name}" onclick="add('${x.id}')">+</button></div></div><div class="food"><img src="${x.image}" alt="${x.name}" loading="lazy"></div></article>`).join('')}
function add(id){cart[id]=(cart[id]||0)+1;syncCart()}
function change(id,d){cart[id]=Math.max(0,(cart[id]||0)+d);if(!cart[id])delete cart[id];syncCart();renderCart()}
function summary(){const rows=Object.entries(cart).map(([id,qty])=>({...data.menu.find(x=>x.id===id),qty}));const subtotal=rows.reduce((s,x)=>s+x.price*x.qty,0);const service=Math.round(subtotal*.05);return{rows,subtotal,service,total:subtotal+service}}
function syncCart(){const s=summary(),count=s.rows.reduce((n,x)=>n+x.qty,0);document.getElementById('cartbar').classList.toggle('show',count>0);document.getElementById('cartCount').textContent=count+' item'+(count===1?'':'s');document.getElementById('cartPrice').textContent=money(s.total)}
function openCart(){document.getElementById('sheet').classList.add('open');renderCart()}
function closeCart(){document.getElementById('sheet').classList.remove('open')}
function renderCart(){const s=summary();document.getElementById('sheetContent').innerHTML=`<div class="checkoutBlock orderBlock"><h2>Your order · Table ${table}</h2>${s.rows.map(x=>`<div class="cartLine"><div><b>${x.name}</b><div style="color:#777;font-size:13px">${money(x.price)}</div></div><div class="qty"><button onclick="change('${x.id}',-1)">−</button><b>${x.qty}</b><button onclick="change('${x.id}',1)">+</button></div></div>`).join('')}<div class="totals"><div class="totalrow"><span>Subtotal</span><span>${money(s.subtotal)}</span></div><div class="totalrow"><span>Service charge · 5%</span><span>${money(s.service)}</span></div><div class="totalrow big"><span>Total</span><span>${money(s.total)}</span></div></div></div><div class="checkoutBlock paymentBlock"><div class="payChoices"><button class="pay ${payMethod==='card'?'selected':''}" onclick="payMethod='card';renderCart()"><b>${icon('card')} Card</b><small>Visa / Mastercard</small></button><button class="pay ${payMethod==='justpay'?'selected':''}" onclick="payMethod='justpay';renderCart()"><b>${icon('bank')} JustPay</b><small>Bank account payment</small></button></div><button class="primary" onclick="placeOrder()">Pay ${money(s.total)}</button></div><p class="prototypeNote">Demo mode · No real money moves.</p>`}
function createOrder(customer={}){const s=summary();if(!s.rows.length)return null;return{id:'GL-'+Date.now().toString(36).toUpperCase().slice(-6),table:String(table),items:s.rows,subtotal:s.subtotal,service:s.service,total:s.total,customer,paymentMethod:payMethod,paymentStatus:'pending'}}
function placeOrder(){if(payMethod==='card')return showCardForm();const order=createOrder();if(!order)return alert('Cart is empty');return justPay(order)}
function showCardForm(){const s=summary();document.getElementById('sheetContent').innerHTML=`<div class="checkoutBlock cardBlock"><h2>Card details</h2><p class="checkoutSub">Pay ${money(s.total)} for Table ${table}</p><div class="fields" style="margin-top:22px"><input class="wide" id="cardname" placeholder="Name on card" value="James Miller"><input class="wide" id="cardnumber" inputmode="numeric" autocomplete="cc-number" placeholder="Card number"><input id="cardexpiry" inputmode="numeric" autocomplete="cc-exp" placeholder="MM / YY"><input id="cardcvc" inputmode="numeric" autocomplete="cc-csc" placeholder="CVC"></div><div class="checkoutTotal"><div class="totalrow big"><span>Total</span><span>${money(s.total)}</span></div></div><button class="primary" onclick="confirmCardPayment()">Pay ${money(s.total)}</button><button class="pay backButton" onclick="renderCart()"><b>← Back</b></button></div><p class="prototypeNote">Demo card form · No real money moves.</p>`}
function confirmCardPayment(){const fullName=(document.getElementById('cardname')?.value||'').trim(),parts=fullName.split(/\s+/).filter(Boolean),order=createOrder({firstName:parts[0]||'',lastName:parts.slice(1).join(' ')});if(!order)return alert('Cart is empty');order.paymentStatus='paid';order.paymentRef='CARD-DEMO';showSuccess(order,'Card demo')}
function justPay(order){document.getElementById('sheetContent').innerHTML=`<div class="checkoutBlock justpayBlock"><h2>Pay with JustPay</h2><p class="checkoutSub">Choose your linked bank account.</p><button class="pay selected bankChoice"><b>Linked bank account</b><small>Demo account</small></button><div class="checkoutTotal"><div class="totalrow big"><span>Authorise</span><span>${money(order.total)}</span></div></div><button class="primary" onclick="confirmJustPay('${order.id}')">Authorise payment</button><button class="pay backButton" onclick="renderCart()"><b>← Back</b></button></div><p class="prototypeNote">Demo JustPay authorisation · No real money moves.</p>`;window.demoOrder=order}
function confirmJustPay(){const order=window.demoOrder;if(!order)return;order.paymentStatus='paid';order.paymentRef='JP-DEMO';showSuccess(order,'JustPay demo')}
function startArrivalCountdown(seconds=600){const el=document.getElementById('arrivalCountdown');if(!el)return;let remaining=seconds;const render=()=>{const mins=Math.floor(remaining/60),secs=remaining%60;el.textContent=`${mins}:${String(secs).padStart(2,'0')}`;if(remaining<=0){clearInterval(timer);const label=document.getElementById('arrivalLabel');if(label)label.textContent='Ready now';return}remaining--};render();const timer=setInterval(render,1000)}
function showSuccess(order,label){cart={};syncCart();document.getElementById('sheetContent').innerHTML=`<div class="success"><div class="check">✓</div><div class="eyebrow">Payment confirmed</div><h2 style="font-size:30px;margin:8px 0">Order sent to the kitchen.</h2><p style="color:#666">Table ${order.table} · ${money(order.total)} · ${label}</p><div style="background:#f6f5f0;border-radius:18px;padding:18px 20px;margin:20px 0;text-align:center"><div id="arrivalLabel" style="font-size:14px;font-weight:700;color:#666;margin-bottom:3px">Ready in</div><div id="arrivalCountdown" style="font-size:46px;font-weight:800;letter-spacing:-2px;line-height:1">10:00</div></div><div class="ref">Order ${order.id} · ${order.paymentRef||'Payment recorded'}</div><button class="primary" style="margin-top:20px" onclick="closeCart()">Done</button></div>`;startArrivalCountdown(600)}
boot();