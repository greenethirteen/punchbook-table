// CBSL Payment and Settlement Systems Circular 01/2026, merchant fee column.
function justPayMerchantFee(amount){
  if(!Number.isFinite(amount)||amount<=0||amount>150000) return null;
  return amount<=50?1.25:amount<=100?2.25:amount<=250?4:amount<=1000?5:amount<=2000?9:amount<=4000?18:amount<=6000?26:amount<=8000?34:40;
}
function estimateSavings(count,bill,rate,extra){
  const fee=justPayMerchantFee(bill);
  if(fee===null||![count,rate,extra].every(Number.isFinite)||count<0||!Number.isInteger(count)||rate<0||rate>10||extra<0) return null;
  const card=count*bill*rate/100, justpay=count*fee;
  return {fee,card,justpay,extra,monthly:card-justpay-extra,annual:(card-justpay-extra)*12};
}
const savingsInputs=['savings-count','savings-bill','savings-rate','savings-extra'].map(id=>document.getElementById(id));
function updateSavings(){
  const valid=savingsInputs.every(input=>input.value!==''&&input.checkValidity());
  const estimate=valid?estimateSavings(...savingsInputs.map(input=>Number(input.value))):null;
  const set=(id,value)=>document.getElementById(id).textContent=value;
  const money=value=>'LKR '+Math.round(value).toLocaleString('en-LK');
  if(!estimate){for(const id of ['savings-annual','savings-card','savings-justpay','savings-other'])set(id,'—');set('savings-monthly','Enter valid figures to see your estimate.');set('savings-fee-note','Bill amount must be between LKR 1 and LKR 150,000.');return;}
  set('savings-annual',(estimate.annual/100000).toLocaleString('en-LK',{maximumFractionDigits:2}));
  set('savings-monthly',estimate.monthly>=0?money(estimate.monthly)+' less in fees per month':money(-estimate.monthly)+' more in fees per month');
  set('savings-card',money(estimate.card));set('savings-justpay',money(estimate.justpay));set('savings-other',money(estimate.extra));
  set('savings-fee-note','Uses LKR '+estimate.fee+' per JustPay payment at this bill amount.');
}
savingsInputs.forEach(input=>input.addEventListener('input',updateSavings));
updateSavings();
