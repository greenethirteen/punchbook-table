// Punchbook labour-savings calculator
// Estimates how many additional waiter shifts Punchbook could help a restaurant avoid.
function estimateWaiterSavings(seats, customers, waiterCost) {
  // Conservative planning assumption: one waiter can handle ~35 customers/day.
  // The calculator is an estimate, not a staffing recommendation.
  if (![seats, customers, waiterCost].every(Number.isFinite) || seats < 1 || customers < 1 || waiterCost < 0) return null;
  const volumeBased = Math.ceil(customers / 35);
  const seatBased = Math.ceil(seats / 30);
  const suggestedWaiters = Math.max(1, Math.min(volumeBased, seatBased));
  return {
    waiters: suggestedWaiters,
    monthly: suggestedWaiters * waiterCost,
    annual: suggestedWaiters * waiterCost * 12,
    punchbook: 5000,
    net: suggestedWaiters * waiterCost - 5000
  };
}

function installWaiterCalculator() {
  const section = document.getElementById('payment-savings');
  const how = document.getElementById('how-it-works');
  if (!section || !how) return;

  section.innerHTML = `
    <div class="shell waiter-savings-shell">
      <div class="waiter-heading">
        <p class="eyebrow">YOUR DIGITAL WAITER</p>
        <h2>What could you save<br><em>by not hiring another waiter?</em></h2>
        <p>Tell us roughly how big your restaurant is and how busy it gets. We'll estimate the monthly labour cost Punchbook could help you avoid.</p>
      </div>
      <div class="waiter-calculator">
        <div class="waiter-result" aria-live="polite">
          <span class="savings-result-label">ESTIMATED MONTHLY SAVING</span>
          <div class="waiter-big"><strong id="waiter-monthly">LKR 45,000</strong></div>
          <p id="waiter-summary">That's the cost of one additional waiter, less Punchbook.</p>
          <div class="waiter-breakdown"><span>Estimated waiter cost</span><b id="waiter-cost-result">LKR 50,000</b></div>
          <div class="waiter-breakdown"><span>Punchbook</span><b>LKR 5,000</b></div>
          <div class="waiter-breakdown"><span>Potential annual saving</span><b id="waiter-annual">LKR 540,000</b></div>
        </div>
        <div class="waiter-inputs">
          <h3>Try your numbers.</h3>
          <label>Restaurant seats
            <input id="waiter-seats" type="number" min="1" max="1000" step="1" value="60" inputmode="numeric">
          </label>
          <label>Customers per day
            <input id="waiter-customers" type="number" min="1" max="10000" step="1" value="120" inputmode="numeric">
          </label>
          <label>Monthly cost of one waiter (LKR)
            <input id="waiter-cost" type="number" min="0" max="1000000" step="1000" value="50000" inputmode="numeric">
          </label>
          <p class="waiter-assumption">Estimate uses a conservative planning assumption of around 35 customers per waiter per day and considers your seat count. Actual staffing needs vary by service style, opening hours and layout.</p>
        </div>
      </div>
      <p class="waiter-note">Punchbook doesn't replace your team. It takes care of taking orders and payments so your existing team can spend more time preparing and serving.</p>
    </div>`;

  const pricing = document.createElement('section');
  pricing.className = 'waiter-pricing';
  pricing.innerHTML = `
    <div class="shell pricing-inner">
      <div><p class="eyebrow">SIMPLE PRICING</p><h2>One digital waiter.<br><em>One simple price.</em></h2></div>
      <div class="pricing-card">
        <div class="pricing-price"><span>LKR</span> 5,000 <small>/ month</small></div>
        <p>Everything you need to let customers order directly from their tables.</p>
        <ul><li>QR table ordering</li><li>Orders sent to your team</li><li>Table-based order tracking</li><li>Customer payment experience</li><li>No app required for guests</li></ul>
        <a class="button" href="/signup">Get Punchbook ↗</a>
      </div>
    </div>`;
  section.after(pricing);

  const style = document.createElement('style');
  style.textContent = `
    .waiter-savings-shell{padding-top:88px;padding-bottom:88px}.waiter-heading{max-width:680px;margin-bottom:34px}.waiter-heading h2{margin-bottom:18px}.waiter-heading h2 em{font-family:Georgia,serif;font-weight:400;color:var(--orange)}.waiter-heading>p:last-child{max-width:620px;color:var(--muted);line-height:1.75}.waiter-calculator{display:grid;grid-template-columns:1.05fr 1fr;gap:18px}.waiter-result,.waiter-inputs{border-radius:22px;padding:32px}.waiter-result{background:#12633d;color:#fffefb}.waiter-big{font-size:clamp(36px,5vw,62px);font-weight:850;letter-spacing:-3px;margin:12px 0}.waiter-result>p{color:#d9eadf;margin:0 0 24px;line-height:1.6}.waiter-breakdown{display:flex;justify-content:space-between;gap:20px;border-top:1px solid #ffffff2b;padding:15px 0;font-size:14px}.waiter-breakdown b{white-space:nowrap}.waiter-inputs{background:#fffefb;border:1px solid #dedfd5}.waiter-inputs h3{font-size:23px;margin:0 0 24px}.waiter-inputs label{display:block;font-size:13px;font-weight:700;margin-bottom:18px}.waiter-inputs input{display:block;width:100%;margin-top:8px;padding:13px 14px;border:1px solid #ccd5cb;border-radius:9px;background:white;font:inherit;color:var(--ink)}.waiter-assumption,.waiter-note{font-size:12px;line-height:1.65;color:var(--muted)}.waiter-note{margin:20px 0 0}.waiter-pricing{background:#244633;color:#fffdf8;padding:88px 0}.pricing-inner{display:grid;grid-template-columns:1fr 420px;gap:70px;align-items:center}.pricing-inner h2 em{font-family:Georgia,serif;font-weight:400;color:#ffd78e}.pricing-inner .eyebrow{color:#c7f0cb}.pricing-card{background:#fffefb;color:var(--ink);border-radius:22px;padding:34px}.pricing-price{font-size:44px;font-weight:850;letter-spacing:-2px}.pricing-price span{font-size:15px;letter-spacing:0}.pricing-price small{font-size:16px;font-weight:600;letter-spacing:0}.pricing-card>p{color:var(--muted);line-height:1.6}.pricing-card ul{list-style:none;padding:0;margin:24px 0 28px}.pricing-card li{padding:11px 0;border-top:1px solid #e0e2da;font-size:14px}.pricing-card li:before{content:'✓';font-weight:800;margin-right:10px;color:#12633d}.pricing-card .button{width:100%}@media(max-width:650px){.waiter-savings-shell{padding-top:55px;padding-bottom:55px}.waiter-calculator,.pricing-inner{grid-template-columns:1fr;gap:18px}.waiter-result,.waiter-inputs{padding:25px}.waiter-pricing{padding:55px 0}.pricing-inner{gap:30px}.pricing-card{padding:26px}}
  `;
  document.head.appendChild(style);

  const inputs = ['waiter-seats','waiter-customers','waiter-cost'].map(id => document.getElementById(id));
  function update() {
    const values = inputs.map(i => Number(i.value));
    const estimate = estimateWaiterSavings(...values);
    if (!estimate) return;
    const money = v => 'LKR ' + Math.round(v).toLocaleString('en-LK');
    document.getElementById('waiter-monthly').textContent = money(Math.max(0, estimate.net));
    document.getElementById('waiter-cost-result').textContent = money(estimate.monthly);
    document.getElementById('waiter-annual').textContent = money(Math.max(0, estimate.net) * 12);
    document.getElementById('waiter-summary').textContent = estimate.waiters === 1
      ? `That's the cost of one additional waiter, less Punchbook.`
      : `That's the estimated cost of ${estimate.waiters} additional waiter${estimate.waiters === 1 ? '' : 's'}, less Punchbook.`;
  }
  inputs.forEach(input => input.addEventListener('input', update));
  update();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installWaiterCalculator);
else installWaiterCalculator();
