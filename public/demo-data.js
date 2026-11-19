// Demo data for the admin screens (/hq, /accounts): made-up restaurants, orders, payouts and signup
// applications, kept in this browser tab only. window.pbDemo.api(path, body) answers the same calls as
// the server, so the screens run the same code in Live and Demo. Nothing here is saved or sent.
// window.pbMode() / window.pbSetMode('live'|'demo') share the Live/Demo choice between the screens.
(()=>{
  const MODE_KEY='pb-admin-mode';
  // ?demo=1 or ?demo=0 in the address sets it too (handy for sharing a demo link).
  const q=new URLSearchParams(location.search).get('demo');
  if(q!==null){try{localStorage.setItem(MODE_KEY,q==='0'?'live':'demo')}catch{}}
  window.pbMode=()=>{try{return localStorage.getItem(MODE_KEY)==='demo'?'demo':'live'}catch{return q&&q!=='0'?'demo':'live'}};
  window.pbSetMode=m=>{try{localStorage.setItem(MODE_KEY,m)}catch{}};

  const colomboDay=(t=new Date())=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Colombo',year:'numeric',month:'2-digit',day:'2-digit'}).format(t);
  const seeded=str=>{let h=2166136261;for(const c of str)h=Math.imul(h^c.charCodeAt(0),16777619);return()=>((h=Math.imul(h^(h>>>15),2246822507)>>>0)%10000)/10000};
  const ago=min=>new Date(Date.now()-min*60000).toISOString();
  const ahead=min=>new Date(Date.now()+min*60000).toISOString();

  const PLACES=[
    {id:'peppermint',name:'Peppermint Café',area:'Colombo 03',base:38000,bank:{accountName:'Peppermint Cafe (Pvt) Ltd',bankName:'Commercial Bank',branch:'Kollupitiya',accountNumber:'8001234567'}},
    {id:'amra',name:'Amra Leaf',area:'Negombo · Chilaw Road',base:26000,bank:{accountName:'Amra Leaf Restaurants',bankName:'HNB',branch:'Negombo',accountNumber:'076010045123'}},
    {id:'glounge',name:'G Lounge',area:'Negombo',base:52000,bank:{accountName:'G Lounge Colombo (Pvt) Ltd',bankName:'Sampath Bank',branch:'Negombo',accountNumber:'002960001234'}},
    {id:'kade',name:'Kade Hoppers',area:'Wellawatte',base:14000,bank:null},
    {id:'sunrise',name:'Sunrise Bakehouse',area:'Nugegoda',base:9000,bank:{accountName:'Sunrise Bakehouse',bankName:'BOC',branch:'Nugegoda',accountNumber:'0083456712'}},
  ];
  const st={pct:10,payouts:{},banks:Object.fromEntries(PLACES.filter(p=>p.bank).map(p=>[p.id,p.bank])),paused:{kade:true},orders:null,applications:null};

  // ---- Accounts (same shape as /api/accounts)
  function day(date){
    const age=Math.round((Date.parse(colomboDay())-Date.parse(date))/864e5);
    if(age<0)return[];
    return PLACES.map(p=>{
      const rnd=seeded(p.id+date),share=age===0?.55:1,orders=Math.max(0,Math.round((p.base/2400)*(.6+rnd()*.8)*share));
      if(!orders)return null;
      const food=Math.round(orders*(1800+rnd()*1600)/10)*10,delivery=Math.round(orders*rnd()*.4),pickup=Math.round((orders-delivery)*rnd()*.5),table=orders-delivery-pickup;
      const key=p.id+'|'+date,saved=key in st.payouts?st.payouts[key]:(age>2?{amount:null,reference:'BATCH-'+date.replace(/-/g,''),sentAt:new Date(Date.parse(date)+33*36e5).toISOString()}:null);
      const pct=saved?.commissionPct??st.pct,commission=Math.round(food*pct)/100,owed=Math.round((food-commission)*100)/100;
      return{restaurantId:p.id,name:p.name,orders,food,service:0,deliveryFees:delivery*350,cardFees:Math.round(food*.025),courierCosts:delivery*300,delivery,pickup,table,commissionPct:pct,commission,owed,
        payout:saved?{...saved,amount:saved.amount??owed}:null,bank:st.banks[p.id]||null};
    }).filter(Boolean).sort((a,b)=>b.owed-a.owed);
  }
  function accounts(date){
    const today=colomboDay();date||=today;const unpaid=[];
    for(let i=7;i>=1;i--){const d=colomboDay(new Date(Date.parse(date+'T12:00:00+05:30')-i*864e5));for(const r of day(d))if(!r.payout&&r.owed>0)unpaid.push({date:d,restaurantId:r.restaurantId,name:r.name,owed:r.owed,bank:r.bank})}
    return{date,today,commissionPct:st.pct,rows:day(date),unpaid,banks:st.banks};
  }

  // ---- Orders (same shape as /api/orders)
  function makeOrders(){
    const L=(name,price,qty=1)=>({name,price,qty});
    const list=[
      ['peppermint','table','new',3,{table:'12'},[L('Crispy Chicken Burger',1750,2),L('Passion Fruit Mojito',790)]],
      ['glounge','pickup','new',7,{customer:{name:'Nadeesha',phone:'0771234567'},pickupAt:ahead(8)},[L('Nutella Waffle',1450),L('Brown Sugar Boba',990,2)]],
      ['amra','delivery','preparing',12,{customer:{name:'Ruwan',phone:'0769876543',address:{line:'14 Lewis Place, Negombo'}},distanceKm:2.4,deliveryFee:350,pickupAt:ahead(6),deliverBy:ahead(20)},[L('Chicken Kottu',1650,2),L('Lime Juice',450,2)]],
      ['peppermint','table','preparing',15,{table:'4'},[L('Truffle Chicken Pasta',2350),L('Iced Spanish Latte',890)]],
      ['amra','table','new',1,{table:'7'},[L('Seafood Fried Rice',2100),L('Devilled Prawns',2400)]],
      ['sunrise','pickup','ready',22,{customer:{name:'Kasun',phone:'0712223344'},pickupAt:ago(2)},[L('Butter Croissant',450,4),L('Cappuccino',750,2)]],
      ['glounge','delivery','served',48,{customer:{name:'Ishara',phone:'0754445566',address:{line:'Sea Street, Negombo'}},distanceKm:1.6,deliveryFee:350,collected:true},[L('Red Velvet Waffle',1550),L('Taro Milk Tea',990)]],
      ['peppermint','table','served',40,{table:'2'},[L('Pepper Beef Rice',1980,2)]],
      ['amra','pickup','new',0,{customer:{name:'Tharindu',phone:'0701112233'},pickupAt:ahead(20),pending:true},[L('Egg Kottu',1250)]],
    ];
    return list.map(([rid,type,status,min,x,items],i)=>{
      const p=PLACES.find(r=>r.id===rid),subtotal=items.reduce((n,l)=>n+l.price*l.qty,0),pickup=type!=='table';
      const orderStatus=pickup?(status==='served'?'collected':status):status;
      return{id:'DEMO-'+(101+i),restaurantId:rid,restaurantName:p.name,restaurantArea:p.area,orderType:pickup?'pickup':'table',fulfilment:type==='delivery'?'delivery':pickup?'pickup':undefined,
        table:x.table||null,items,subtotal,service:0,deliveryFee:x.deliveryFee||0,total:subtotal+(x.deliveryFee||0),customer:x.customer||{},pickupAt:x.pickupAt,deliverBy:x.deliverBy,distanceKm:x.distanceKm,
        paymentMethod:'card',paymentStatus:x.pending?'pending':'paid',testPayment:false,orderStatus,createdAt:ago(min+1),paidAt:x.pending?null:ago(min),
        pos:rid==='amra'&&!x.pending?{provider:'sambapos',status:'synced',ticketNumber:String(4180+i)}:undefined,
        dispatch:type==='delivery'&&status!=='new'?{status:x.collected?'delivered':'assigned',method:'rider',rider:{name:'Sahan',phone:'0778889900'},assignedAt:ago(min-2),deliveredAt:x.collected?ago(min-30):null}:undefined};
    });
  }

  // ---- Signup applications (same shape as /api/public/companies/:id/full)
  function makeApplications(){
    const a=(id,status,days,f)=>({id,reference:'PBM-DEMO-'+id.toUpperCase(),status,createdAt:new Date(Date.now()-days*864e5).toISOString(),updatedAt:new Date(Date.now()-days*864e5).toISOString(),adminNotes:'',documents:{businessRegistration:{name:'BR-certificate.pdf'},identityDocument:{name:'NIC.jpg'},bankProof:{name:'bank-statement.pdf'}},...f});
    return[
      a('d1','submitted',0.2,{tradingName:'Ministry of Crab Express',companyName:'MOC Foods (Pvt) Ltd',registrationNumber:'PV 123456',businessType:'Private limited',businessCategory:'Restaurant',registeredAddress:'Old Dutch Hospital, Colombo 01',contactName:'Dilan Perera',contactRole:'Operations manager',email:'dilan@example.lk',phone:'0771230000',nicNumber:'901234567V',bankName:'Commercial Bank',bankBranch:'Fort',bankAccountName:'MOC Foods (Pvt) Ltd',bankAccountNumber:'1000123456',averageTransactionValue:6500,monthlyVolume:2400000}),
      a('d2','under-review',2,{tradingName:'Hela Bojun Corner',companyName:'Hela Bojun Corner',registrationNumber:'WCO 99812',businessType:'Sole proprietor',businessCategory:'Sri Lankan',registeredAddress:'Kandy Road, Kiribathgoda',contactName:'Sandya Kumari',contactRole:'Owner',email:'helabojun@example.lk',phone:'0712340000',nicNumber:'198812345678',bankName:'BOC',bankBranch:'Kiribathgoda',bankAccountName:'S. Kumari',bankAccountNumber:'0081122334',averageTransactionValue:1200,monthlyVolume:450000}),
      a('d3','approved',9,{tradingName:'Kade Hoppers',companyName:'Kade Hoppers (Pvt) Ltd',registrationNumber:'PV 554433',businessType:'Private limited',businessCategory:'Street food',registeredAddress:'Galle Road, Wellawatte',contactName:'Faizal Ameen',contactRole:'Director',email:'faizal@example.lk',phone:'0753450000',nicNumber:'882345678V',bankName:'NDB',bankBranch:'Wellawatte',bankAccountName:'Kade Hoppers (Pvt) Ltd',bankAccountNumber:'101000987654',averageTransactionValue:1800,monthlyVolume:900000}),
    ];
  }

  const ok=x=>JSON.parse(JSON.stringify(x));
  async function api(path,body){
    const [route,q]=path.split('?'),b=body||{};
    st.orders||=makeOrders();st.applications||=makeApplications();
    if(route==='/api/accounts')return ok(accounts(new URLSearchParams(q).get('date')));
    if(route==='/api/accounts/settings'){st.pct=Number(b.commissionPct);return{commissionPct:st.pct}}
    if(route==='/api/accounts/payouts'){
      const rows=day(b.date);
      for(const id of b.restaurantIds||[b.restaurantId]){const k=id+'|'+b.date,r=rows.find(x=>x.restaurantId===id);
        if(b.undo){st.payouts[k]=null;continue}if(!r||(b.restaurantIds&&r.payout))continue;
        st.payouts[k]={amount:r.owed,commissionPct:r.commissionPct,reference:b.reference||'',sentAt:new Date().toISOString()}}
      return{ok:true};
    }
    if(route==='/api/accounts/banks'){
      const bank={accountName:String(b.accountName||'').trim(),bankName:String(b.bankName||'').trim(),branch:String(b.branch||'').trim(),accountNumber:String(b.accountNumber||'').replace(/[\s-]/g,'')};
      if(!bank.accountName||!bank.bankName||!/^\d{6,20}$/.test(bank.accountNumber))throw Error('Add the account name, bank and a 6 to 20 digit account number.');
      st.banks[b.restaurantId]=bank;return{ok:true};
    }
    if(route==='/api/accounts/applications')return{applications:st.applications.map(c=>({id:c.id,name:c.tradingName,accountName:c.bankAccountName,bankName:c.bankName,branch:c.bankBranch,accountNumber:c.bankAccountNumber}))};
    if(route==='/api/orders')return ok(st.orders);
    let m=route.match(/^\/api\/orders\/([^/]+)\/(status|cancel)$/);
    if(m){const o=st.orders.find(x=>x.id===decodeURIComponent(m[1]));if(!o)throw Error('Order not found.');
      if(m[2]==='cancel'){o.orderStatus='cancelled';o.cancelReason=b.reason;o.paymentStatus='refunded'}
      else if(b.orderStatus==='food_ready')o.kitchenReadyAt=new Date().toISOString();
      else o.orderStatus=b.orderStatus;
      return ok(o)}
    if(route==='/api/restaurants/status')return{restaurants:PLACES.map(p=>({id:p.id,name:p.name,area:p.area,accepting:!st.paused[p.id]}))};
    m=route.match(/^\/api\/restaurants\/([^/]+)\/pause$/);
    if(m){const id=decodeURIComponent(m[1]);st.paused[id]=Boolean(b.paused);return{id,accepting:!st.paused[id]}}
    if(route==='/api/bridge/health')return{restaurants:[{id:'amra',online:true,pos:'SambaPOS 5',lastSeenAt:ago(0.3)}]};
    if(route==='/api/public/companies')return{companies:ok(st.applications)};
    m=route.match(/^\/api\/public\/companies\/([^/]+)(\/full|\/status)?$/);
    if(m){const c=st.applications.find(x=>x.id===decodeURIComponent(m[1]));if(!c)throw Error('Application not found.');
      if(m[2]==='/status'){c.status=b.status;c.adminNotes=b.adminNotes||'';c.updatedAt=new Date().toISOString()}
      return{ok:true,company:ok(c)}}
    throw Error('Not available in demo.');
  }
  window.pbDemo={api,colomboDay};
})();
