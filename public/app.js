const $ = (q) => document.querySelector(q);
const providersEl = $('#providers');
const logsEl = $('#logs');
const chartEl = $('#chart');
const keyListEl = $('#customKeys');
let sessionToken = localStorage.getItem('bigliner_session') || '';
function fmt(n){ return Number(n).toLocaleString('en-US'); }
function providerCard(p){
  const deg = Math.max(0, Math.min(100, p.health)) * 3.6;
  return `<div class="provider"><div><h3>${p.name}</h3><p>${p.format} · ${p.keys} keys · ${p.latency}ms · $${p.cost}/1k est.<br><span>${p.baseUrl || ''}</span></p></div><div class="health" style="--deg:${deg}deg"><span>${p.health}%</span></div></div>`;
}
function logRow(l){
  return `<div class="log"><span>${l.t}</span><div><b>${l.app} → ${l.model}</b><span>${l.route} · ${fmt(l.tokens)} tokens · ${l.latency}ms · $${l.cost}</span></div><i class="badge ${l.result==='fallback'?'fallback':''}">${l.result}</i></div>`;
}
function keyRow(k){
  return `<div class="key-row"><div><b>${k.label}</b><span>${k.provider} · ${k.format} · ${k.model}<br>${k.baseUrl}</span></div><code>${k.maskedKey}</code></div>`;
}
function drawChart(){
  if (!chartEl) return;
  chartEl.innerHTML = '';
  Array.from({length:18}).forEach((_,i)=>{
    const h = 28 + Math.round(Math.random()*170);
    const b = document.createElement('div');
    b.className='bar'; b.style.height=h+'px'; b.style.animationDelay=(i*0.025)+'s';
    chartEl.appendChild(b);
  });
}
function showApp(){ $('#login').classList.add('hidden'); $('#app').classList.remove('hidden'); }
function showLogin(){ $('#app').classList.add('hidden'); $('#login').classList.remove('hidden'); }
async function api(path, opts={}){
  const headers = { ...(opts.headers || {}) };
  if (sessionToken) headers['x-bigliner-session'] = sessionToken;
  const res = await fetch(path, { ...opts, headers });
  if (res.status === 401) { localStorage.removeItem('bigliner_session'); sessionToken=''; showLogin(); throw new Error('auth_required'); }
  return res.json();
}
async function load(){
  const data = await api('/api/status');
  showApp();
  $('#endpoint').textContent = data.gateway;
  $('#endpointMini').textContent = new URL(data.gateway).host;
  $('#mProviders').textContent = data.summary.providers;
  $('#mKeys').textContent = data.summary.keys;
  $('#mReq').textContent = fmt(data.summary.requests);
  $('#mSaved').textContent = data.summary.saved;
  providersEl.innerHTML = data.providers.map(providerCard).join('');
  logsEl.innerHTML = data.logs.map(logRow).join('');
  keyListEl.innerHTML = data.customKeys.length ? data.customKeys.map(keyRow).join('') : '<p class="muted">No custom keys yet. Add OpenAI-compatible or Anthropic-compatible credentials here.</p>';
}
async function copyEndpoint(){
  await navigator.clipboard.writeText($('#endpoint').textContent);
  const btn = document.querySelector('.endpoint button');
  const old = btn.textContent; btn.textContent = 'Copied'; setTimeout(()=>btn.textContent=old,900);
}
$('#loginForm').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const password = $('#password').value;
  $('#loginMsg').textContent = 'Checking password...';
  const res = await fetch('/api/login', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ password }) });
  const data = await res.json();
  if (!data.ok) { $('#loginMsg').textContent = 'Wrong password.'; return; }
  sessionToken = data.token; localStorage.setItem('bigliner_session', sessionToken);
  $('#loginMsg').textContent = 'Unlocked.'; await load();
});
$('#keyForm').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const fd = new FormData(e.currentTarget);
  const payload = Object.fromEntries(fd.entries());
  const btn = e.currentTarget.querySelector('button');
  const old = btn.textContent; btn.textContent = 'Saving...';
  try {
    await api('/api/custom-keys', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify(payload) });
    e.currentTarget.reset(); await load(); btn.textContent = 'Saved'; setTimeout(()=>btn.textContent=old,900);
  } catch { btn.textContent = 'Failed'; setTimeout(()=>btn.textContent=old,900); }
});
window.copyEndpoint = copyEndpoint;
drawChart();
if (sessionToken) load().catch(()=>showLogin()); else showLogin();
setInterval(()=>{ if(sessionToken) load().catch(()=>{}); }, 2500);
setInterval(drawChart, 4200);
