// CryptoRadar V2 — frontend base sin Firebase
const APP_VERSION = '2.2.1';
const APP_BUILD = '2026-05-27-2-2-1';
const APP_VERSION_URL = './version.json';
const GITHUB_MARKET_URL = './data/market.json';
const GITHUB_FG_URL = './data/feargreed.json';
const GITHUB_TRENDING_URL = './data/trending.json';
const GITHUB_GLOBAL_URL = './data/global.json';
const GITHUB_NOVEDADES_URL = './data/novedades.json';
const GITHUB_GAINERS_URL = './data/gainers.json';
const GITHUB_LOSERS_URL = './data/losers.json';
const COINGECKO_URL = 'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=40&page=1&sparkline=false&price_change_percentage=24h';
const ALTME_FG_URL = 'https://api.alternative.me/fng/?limit=1';
const PUBLIC_APP_URL = 'https://msebastiansn-oss.github.io/cryptoradarv2/';
const REFRESH_INTERVAL_MS = 15 * 60 * 1000;
const MARKET_CACHE_KEY = 'cr2-market-data';
const MARKET_UPDATE_CACHE_KEY = 'cr2-market-update';
const FEAR_GREED_CACHE_KEY = 'cr2-fear-greed';
const DB_KEY = 'cr2-users-db';
const SESSION_KEY = 'cr2-session';
const VERSION_STORAGE_KEY = 'cr2-app-version';

const STATE = { cryptos: [], fearGreed: null, lastUpdate: null, whatIf: loadWhatIfState(), favs: loadFavs(), shareCount: loadShareCount(), unlocked: loadFavUnlock(), currentVersion: APP_VERSION };
let currentMarketTab = 'top';
let currentWhatIfTab = 'personal';
let currentRankingTab = 'semanal';
let currentModalIdx = null;
let gainersData = [];
let losersData = [];
let nextUpdateAt = null;
let refreshCountdownTimer = null;
let marketRefreshInterval = null;
let deferredPrompt = null;

window.addEventListener('load', () => {
  localStorage.setItem(VERSION_STORAGE_KEY, APP_VERSION);
  localStorage.setItem('cr2-app-build', APP_BUILD);
  setTimeout(() => {
    document.getElementById('splash')?.classList.add('hide');
    if (!localStorage.getItem('cr2-lang-chosen')) { document.getElementById('lang-screen')?.classList.add('active'); return; }
    const session = getCurrentUser();
    if (session) proceedAfterLogin(!!session.isGuest);
    else document.getElementById('login-screen')?.classList.add('active');
  }, 900);
});

function chooseLang(lang) { localStorage.setItem('cr2-lang', lang); localStorage.setItem('cr2-lang-chosen', '1'); document.getElementById('lang-screen')?.classList.remove('active'); document.getElementById('login-screen')?.classList.add('active'); }
function startApp() { localStorage.setItem('cr2-seen', '1'); document.getElementById('onboarding')?.classList.remove('active'); launchApp(); }
function proceedAfterLogin(isGuest) { updateAvatar(); if (!localStorage.getItem('cr2-seen') && !isGuest) document.getElementById('onboarding')?.classList.add('active'); else { launchApp(); showPage('whatif', document.getElementById('nav-whatif')); } }
function launchApp() { document.getElementById('app')?.classList.add('active'); showTermsIfNeeded(); updateOnlineStatus(); fetchAll(); renderWhatIf(); scheduleMarketRefresh(); checkForAppUpdate(); initPwaInstallBanner(); localStorage.setItem('cr2-novedades-ts', '0'); }

function getDB() { try { return JSON.parse(localStorage.getItem(DB_KEY) || '{}'); } catch { return {}; } }
function saveDB(db) { localStorage.setItem(DB_KEY, JSON.stringify(db)); }
function getCurrentUser() { try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch { return null; } }
function switchLoginTab(tab, el) { document.querySelectorAll('.login-tab').forEach(t => t.classList.remove('active')); el?.classList.add('active'); document.getElementById('login-form-login').style.display = tab === 'login' ? 'flex' : 'none'; document.getElementById('login-form-register').style.display = tab === 'register' ? 'flex' : 'none'; document.getElementById('login-error').textContent = ''; document.getElementById('reg-error').textContent = ''; }
function doLogin() { const user = (document.getElementById('login-user').value || '').trim().toLowerCase(); const pin = (document.getElementById('login-pin').value || '').trim(); const err = document.getElementById('login-error'); if (!user) return err.textContent='Ingresá un usuario.'; if (!/^\d{4}$/.test(pin)) return err.textContent='El PIN debe ser 4 dígitos.'; const db = getDB(); if (!db[user]) return err.textContent='Usuario no encontrado.'; if (db[user].pin !== pin) return err.textContent='PIN incorrecto.'; setSession(user, db[user]); }
function doRegister() { const user = (document.getElementById('reg-user').value || '').trim().toLowerCase(); const pin = (document.getElementById('reg-pin').value || '').trim(); const pin2 = (document.getElementById('reg-pin2').value || '').trim(); const err = document.getElementById('reg-error'); if (!user || user.length < 3) return err.textContent='El usuario debe tener al menos 3 caracteres.'; if (!/^[a-z0-9_]+$/.test(user)) return err.textContent='Solo letras, números y guión bajo.'; if (!/^\d{4}$/.test(pin)) return err.textContent='El PIN debe ser 4 dígitos numéricos.'; if (pin !== pin2) return err.textContent='Los PINs no coinciden.'; const db = getDB(); if (db[user]) return err.textContent='Ese usuario ya existe. Probá con otro.'; db[user] = { pin, whatIf: null, favs: [], shareCount: 0, unlocked: false, createdAt: new Date().toISOString() }; saveDB(db); setSession(user, db[user]); }
function skipLogin() { localStorage.setItem(SESSION_KEY, JSON.stringify({ user:'invitado', isGuest:true })); document.getElementById('login-screen')?.classList.remove('active'); proceedAfterLogin(true); }
function setSession(user, data) { localStorage.setItem(SESSION_KEY, JSON.stringify({ user, isGuest:false })); if (data.whatIf) STATE.whatIf = normalizeWhatIf(data.whatIf); if (Array.isArray(data.favs)) STATE.favs = data.favs; if (typeof data.shareCount === 'number') STATE.shareCount = data.shareCount; if (typeof data.unlocked === 'boolean') STATE.unlocked = data.unlocked; persistFavsLocal(); document.getElementById('login-screen')?.classList.remove('active'); proceedAfterLogin(false); }
function updateAvatar() { const session = getCurrentUser(); const el = document.getElementById('user-avatar'); if (!el) return; el.textContent = !session || session.isGuest ? '?' : session.user.charAt(0).toUpperCase(); el.title = !session || session.isGuest ? 'Invitado' : '@' + session.user; }
function saveUserData() { const session = getCurrentUser(); if (!session || session.isGuest) return; const db = getDB(); if (!db[session.user]) return; db[session.user].whatIf = STATE.whatIf; db[session.user].favs = STATE.favs; db[session.user].shareCount = STATE.shareCount; db[session.user].unlocked = STATE.unlocked; saveDB(db); }
function showUserMenu() { const session = getCurrentUser(); if (!session || session.isGuest) { if (confirm('Estás en modo invitado. ¿Querés crear una cuenta local para guardar tu progreso?')) { document.getElementById('app')?.classList.remove('active'); document.getElementById('login-screen')?.classList.add('active'); switchLoginTab('register', document.querySelectorAll('.login-tab')[1]); } return; } if (confirm('@' + session.user + '\n\n¿Cerrar sesión?')) { saveUserData(); localStorage.removeItem(SESSION_KEY); document.getElementById('app')?.classList.remove('active'); document.getElementById('login-screen')?.classList.add('active'); STATE.whatIf = normalizeWhatIf(null); STATE.favs = loadFavs(); STATE.shareCount = loadShareCount(); STATE.unlocked = loadFavUnlock(); updateAvatar(); renderFavs(); } }

function normalizeWhatIf(saved) { const fallback = { cash:1000, positions:[], history:[], totalInjected:1000 }; if (!saved || typeof saved !== 'object') return fallback; return { cash: typeof saved.cash === 'number' ? saved.cash : 1000, positions: Array.isArray(saved.positions) ? saved.positions : [], history: Array.isArray(saved.history) ? saved.history : [], totalInjected: typeof saved.totalInjected === 'number' ? saved.totalInjected : 1000 }; }
function loadWhatIfState() { try { return normalizeWhatIf(JSON.parse(localStorage.getItem('cr2-whatif') || 'null')); } catch { return normalizeWhatIf(null); } }
function saveWhatIf() { localStorage.setItem('cr2-whatif', JSON.stringify(STATE.whatIf)); saveUserData(); }

function loadFavs() { try { const a = JSON.parse(localStorage.getItem('cr2-favs') || '[]'); return Array.isArray(a) ? a : []; } catch { return []; } }
function loadShareCount() { return parseInt(localStorage.getItem('cr2-share-count') || '0', 10) || 0; }
function loadFavUnlock() { return localStorage.getItem('cr2-favs-unlocked') === 'true'; }
function persistFavsLocal() { localStorage.setItem('cr2-favs', JSON.stringify(STATE.favs)); localStorage.setItem('cr2-share-count', String(STATE.shareCount)); localStorage.setItem('cr2-favs-unlocked', STATE.unlocked ? 'true' : 'false'); }
function saveFavs() { persistFavsLocal(); saveUserData(); renderFavs(); }


function fetchJsonFresh(url) { return fetch(`${url}?v=${Date.now()}`, { cache:'reload', headers:{ 'Cache-Control':'no-cache, no-store, must-revalidate', 'Pragma':'no-cache' } }).then(r => { if (!r.ok) throw new Error('No se pudo leer ' + url); return r.json(); }); }
async function fetchAll() { await fetchCryptos(); await Promise.allSettled([fetchFearGreed(), loadNovedades()]); renderWhatIf(); renderRanking(); renderFavs(); }
function saveMarketCache(data) { try { if (Array.isArray(data) && data.length) { localStorage.setItem(MARKET_CACHE_KEY, JSON.stringify(data)); localStorage.setItem(MARKET_UPDATE_CACHE_KEY, new Date().toISOString()); } } catch {} }
function loadMarketCache() { try { const data = JSON.parse(localStorage.getItem(MARKET_CACHE_KEY) || 'null'); if (!Array.isArray(data) || !data.length) return null; return { data, updatedAt: localStorage.getItem(MARKET_UPDATE_CACHE_KEY) }; } catch { return null; } }
async function fetchCryptos() { try { let data = null; try { const json = await fetchJsonFresh(GITHUB_MARKET_URL); if (Array.isArray(json) && json.length) data = json; } catch {} if (!data) { const r = await fetch(COINGECKO_URL, { cache:'no-store' }); if (!r.ok) throw new Error('CoinGecko error'); data = await r.json(); } STATE.cryptos = data; STATE.lastUpdate = new Date(); saveMarketCache(data); clearOfflineMessage(); renderCryptos(); renderFavs(); populateWhatIfMarket(); } catch { const cached = loadMarketCache(); if (cached) { STATE.cryptos = cached.data; STATE.lastUpdate = cached.updatedAt ? new Date(cached.updatedAt) : null; setOfflineMessage('📡 Sin conexión — mostrando últimos datos guardados'); renderCryptos(); renderFavs(); populateWhatIfMarket(); } else { setOfflineMessage('📡 Sin conexión — conectate una vez para cargar datos'); const el = document.getElementById('crypto-list'); if (el) el.innerHTML = '<div class="whatif-empty">Sin datos disponibles.</div>'; } } updateRefreshCountdown(); }
function renderCryptos() { gainersData=[]; losersData=[]; if (currentMarketTab === 'top') renderCryptosList(STATE.cryptos); else switchMarketTab(currentMarketTab, document.getElementById('subtab-' + currentMarketTab)); }
async function switchMarketTab(tab, el) { currentMarketTab = tab; document.querySelectorAll('.market-subtab').forEach(b => b.classList.remove('active')); el?.classList.add('active'); if (tab === 'top') return renderCryptosList(STATE.cryptos); const list = document.getElementById('crypto-list'); if (list) list.innerHTML = '<div class="skeleton skel-card"></div><div class="skeleton skel-card"></div><div class="skeleton skel-card"></div>'; if (tab === 'gainers') { if (!gainersData.length) gainersData = await fetchMarketTab(GITHUB_GAINERS_URL); if (!gainersData.length) gainersData = [...STATE.cryptos].sort((a,b)=>(b.price_change_percentage_24h||0)-(a.price_change_percentage_24h||0)); renderCryptosList(gainersData.filter(c => (c.price_change_percentage_24h||0) > 0)); } else { if (!losersData.length) losersData = await fetchMarketTab(GITHUB_LOSERS_URL); if (!losersData.length) losersData = [...STATE.cryptos].sort((a,b)=>(a.price_change_percentage_24h||0)-(b.price_change_percentage_24h||0)); renderCryptosList(losersData.filter(c => (c.price_change_percentage_24h||0) < 0)); } }
async function fetchMarketTab(url) { try { const data = await fetchJsonFresh(url); return Array.isArray(data) ? data : []; } catch { return []; } }
function renderCryptosList(cryptos) { const list = document.getElementById('crypto-list'); if (!list) return; if (!cryptos || !cryptos.length) { list.innerHTML = '<div class="whatif-empty">Sin datos disponibles.</div>'; return; } list.innerHTML = cryptos.map((coin,i) => { const chg = coin.price_change_percentage_24h || 0; const cls = chg > 0 ? 'up' : chg < 0 ? 'down' : ''; const arrow = chg > 0 ? '▲' : chg < 0 ? '▼' : '—'; const idx = STATE.cryptos.findIndex(x => x.id === coin.id); const modalIdx = idx >= 0 ? idx : i; return `<div class="crypto-card" onclick="openModal(${modalIdx})"><div class="crypto-rank">${i+1}</div><div class="crypto-icon">${coin.image ? `<img src="${coin.image}" alt="${coin.symbol}" loading="lazy" onerror="this.style.display='none'">` : `<span>${String(coin.symbol||'?').toUpperCase().slice(0,3)}</span>`}</div><div class="crypto-info"><div class="crypto-name">${escapeHtml(coin.name)}</div><div class="crypto-sym">${String(coin.symbol||'').toUpperCase()} ${renderVolumeBadge(coin)}</div></div><div class="crypto-right"><div class="crypto-price">${formatPrice(coin.current_price)}</div><div class="crypto-change ${cls}">${arrow} ${Math.abs(chg).toFixed(2)}%</div>${Math.abs(chg)>=10?`<div class="crypto-alert ${chg>0?'big-up':'big-down'}">${chg>0?'🚀 +':'💥 -'}${Math.abs(chg).toFixed(0)}%</div>`:''}</div></div>`; }).join(''); }
function renderVolumeBadge(c) { const ratio = Number(c.total_volume||0)/Number(c.market_cap||1); if (ratio>=0.25) return '<span class="volume-badge extreme">🚀 VOL</span>'; if (ratio>=0.10) return '<span class="volume-badge hot">🔥 VOL</span>'; return ''; }

async function fetchFearGreed() { try { let data = null; try { data = await fetchJsonFresh(GITHUB_FG_URL); } catch {} if (!data) { const r = await fetch(ALTME_FG_URL); data = await r.json(); } localStorage.setItem(FEAR_GREED_CACHE_KEY, JSON.stringify(data)); const val = parseInt(data.data[0].value); const txt = data.data[0].value_classification; STATE.fearGreed = { val, txt }; renderFearGreed(val, txt); } catch { try { const cached = JSON.parse(localStorage.getItem(FEAR_GREED_CACHE_KEY)||'null'); if (cached?.data?.[0]) return renderFearGreed(parseInt(cached.data[0].value), cached.data[0].value_classification); } catch {} const num = document.getElementById('fg-num'); const label = document.getElementById('fg-label'); const desc = document.getElementById('fg-desc'); if (num) num.textContent='?'; if (label) label.textContent='Sin conexión'; if (desc) desc.textContent='No se pudo obtener el índice.'; } }
function renderFearGreed(val, txt) { const badge=document.getElementById('fear-badge'), num=document.getElementById('fg-num'), label=document.getElementById('fg-label'), desc=document.getElementById('fg-desc'), bar=document.getElementById('fg-bar'); let cls='neutral', color='yellow', barColor='var(--yellow)', explanation='Mercado en equilibrio. Sin señales claras de dirección.'; if (val>=60) { cls='greed'; color='green'; barColor='var(--green)'; explanation = val>=80 ? 'Codicia extrema. Cuidado: podría estar sobrecomprado.' : 'Mercado optimista. Buen momento para analizar con calma.'; } else if (val<=40) { cls='fear'; color='red'; barColor='var(--red)'; explanation = val<=20 ? 'Miedo extremo. Históricamente puede generar oportunidades.' : 'Mercado nervioso. Volatilidad alta esperada.'; } const fgMap={'Extreme Fear':'Miedo Extremo','Fear':'Miedo','Neutral':'Neutral','Greed':'Codicia','Extreme Greed':'Codicia Extrema'}; if (badge) { badge.className=`fear-badge ${cls}`; badge.textContent=`${cls==='greed'?'📈':cls==='fear'?'📉':'⚖️'} ${val}`; } if (num) { num.className=`fg-number ${color}`; num.textContent=val; } if (label) label.textContent=fgMap[txt]||txt; if (desc) desc.textContent=explanation; if (bar) { bar.style.width=val+'%'; bar.style.background=barColor; } }

async function loadNovedades() {
  const el = document.getElementById('novedades-list');
  if (!el) return;
  const items = [];
  let global = null;
  let trending = null;
  let manual = null;
  try { manual = await fetchJsonFresh(GITHUB_NOVEDADES_URL); } catch {}
  try { trending = await fetchJsonFresh(GITHUB_TRENDING_URL); } catch {}
  try { global = await fetchJsonFresh(GITHUB_GLOBAL_URL); } catch {}

  await renderGlobalSummary(global);

  if (global?.data) {
    const btcDom = global.data.market_cap_percentage?.btc ? global.data.market_cap_percentage.btc.toFixed(1) + '%' : '—';
    const ethDom = global.data.market_cap_percentage?.eth ? global.data.market_cap_percentage.eth.toFixed(1) + '%' : '—';
    const totalMcap = global.data.total_market_cap?.usd ? '$' + (global.data.total_market_cap.usd / 1e12).toFixed(2) + 'T' : '—';
    const vol = global.data.total_volume?.usd ? '$' + (global.data.total_volume.usd / 1e9).toFixed(1) + 'B' : '—';
    items.push({ tag:'Mercado Global', title:`Cap. total ${totalMcap} · Volumen 24h ${vol}`, meta:`Dominancia BTC ${btcDom} · ETH ${ethDom}`, url:'https://coinmarketcap.com/charts/' });
  }

  if (trending?.coins?.length) {
    trending.coins.slice(0, 7).forEach((t, idx) => {
      const it = t.item || {};
      items.push({ tag: idx === 0 ? 'Trending ahora' : 'Tendencia', title: `${it.name || 'Cripto'} (${String(it.symbol || '').toUpperCase()}) aparece entre las más buscadas`, meta: 'CoinGecko Trending', url: it.data?.coin_url || `https://www.coingecko.com/en/coins/${it.id || ''}` });
    });
  }

  const sortedUp = [...STATE.cryptos].sort((a,b)=>(b.price_change_percentage_24h||0)-(a.price_change_percentage_24h||0));
  const sortedDown = [...STATE.cryptos].sort((a,b)=>(a.price_change_percentage_24h||0)-(b.price_change_percentage_24h||0));
  sortedUp.slice(0, 4).forEach(c => items.push({ tag:'Mayor suba 24h', title:`${c.name} sube ${Math.abs(c.price_change_percentage_24h||0).toFixed(2)}% en 24h`, meta:`Precio ${formatPrice(c.current_price)}`, url:`https://www.coingecko.com/en/coins/${c.id}` }));
  sortedDown.slice(0, 4).forEach(c => items.push({ tag:'Mayor baja 24h', title:`${c.name} cae ${Math.abs(c.price_change_percentage_24h||0).toFixed(2)}% en 24h`, meta:`Precio ${formatPrice(c.current_price)}`, url:`https://www.coingecko.com/en/coins/${c.id}` }));

  if (Array.isArray(manual)) {
    manual.forEach(x => items.push({ tag: x.tag || 'Novedad', title: x.title || 'Novedad cripto', meta: x.meta || 'CryptoRadar', url: x.url || '' }));
  }

  const fallback = [
    { tag:'Narrativa', title:'IA + cripto: revisar tokens del sector, volumen y rotación semanal', meta:'Sector dinámico', url:'https://coinmarketcap.com/view/artificial-intelligence/' },
    { tag:'DeFi', title:'DeFi: revisar TVL, volumen y actividad por cadena', meta:'Links útiles', url:'https://defillama.com/' },
    { tag:'Próximos', title:'Calendario del mercado: eventos, unlocks y novedades por proyecto', meta:'Seguimiento externo', url:'https://coinmarketcal.com/' },
    { tag:'Macro', title:'Tasas, dólar e inflación siguen marcando activos de riesgo', meta:'Contexto global', url:'https://www.federalreserve.gov/monetarypolicy.htm' }
  ];
  fallback.forEach(x => items.push(x));

  const unique = [];
  const seen = new Set();
  for (const item of items) {
    const key = (item.tag + '|' + item.title).toLowerCase();
    if (!seen.has(key)) { seen.add(key); unique.push(item); }
  }
  renderNovedadesItems(el, unique.slice(0, 20));
}

async function renderGlobalSummary(globalInput=null) { const el = document.getElementById('global-summary'); if (!el) return; let global = globalInput; if (!global) { try { global = await fetchJsonFresh(GITHUB_GLOBAL_URL); } catch { return; } } if (!global?.data) return; const btcDom = global.data.market_cap_percentage?.btc ? global.data.market_cap_percentage.btc.toFixed(1)+'%' : '—'; const totalMcap = global.data.total_market_cap?.usd ? '$'+(global.data.total_market_cap.usd/1e12).toFixed(2)+'T' : '—'; el.innerHTML = `<div class="news-card"><div class="news-tag">Resumen global</div><div class="news-title">Mercado total: ${totalMcap} · Dominancia BTC: ${btcDom}</div><div class="news-footer"><div class="news-meta">Actualizado por GitHub Actions</div></div></div>`; }
function renderNovedadesItems(el, items) { el.innerHTML = items.map(item => `<div class="news-card"><div class="news-tag">${escapeHtml(item.tag||'Novedad')}</div><div class="news-title">${escapeHtml(item.title||'')}</div><div class="news-footer"><div class="news-meta">${escapeHtml(item.meta||'')}</div>${item.url?`<a class="news-link" href="${item.url}" target="_blank" rel="noopener">ver más →</a>`:''}</div></div>`).join(''); }

function switchWhatIfTab(tab, el) { currentWhatIfTab=tab; document.querySelectorAll('.whatif-tab').forEach(b=>b.classList.remove('active')); el?.classList.add('active'); document.querySelectorAll('.whatif-sub').forEach(s=>s.classList.remove('active')); document.getElementById('whatif-sub-'+tab)?.classList.add('active'); if (tab==='ranking') renderRanking(); }
function getCurrentCoin(id) { return STATE.cryptos.find(c=>c.id===id); }
function whatIfBuy(coinId) { const coin=getCurrentCoin(coinId); if (!coin?.current_price) return alert('Todavía no hay precio disponible.'); const raw=prompt(`¿Cuántos USD ficticios querés poner en ${coin.name}?`,'100'); if (raw===null) return; const amount=parseFloat(String(raw).replace(',','.')); if (!amount || amount<=0) return alert('Ingresá un importe válido.'); if (amount>STATE.whatIf.cash) return alert('No tenés saldo ficticio suficiente. Podés recargar con +$1000 virtuales.'); STATE.whatIf.cash-=amount; STATE.whatIf.positions.push({ id:coin.id, name:coin.name, symbol:coin.symbol, image:coin.image, invested:amount, entryPrice:coin.current_price, qty:amount/coin.current_price, openedAt:new Date().toISOString() }); saveWhatIf(); renderWhatIf(); renderRanking(); }
function buyCurrentModalCoin() { const c = STATE.cryptos[currentModalIdx]; if (c) { closeModal(); showPage('whatif', document.getElementById('nav-whatif')); whatIfBuy(c.id); } }
function whatIfSell(index) { const pos=STATE.whatIf.positions[index]; if (!pos) return; const coin=getCurrentCoin(pos.id); const currentPrice=coin?.current_price||pos.entryPrice; const currentValue=pos.qty*currentPrice; STATE.whatIf.history.push({ name:pos.name, symbol:pos.symbol, invested:pos.invested, closeValue:currentValue, entryPrice:pos.entryPrice, closePrice:currentPrice, date:new Date().toLocaleDateString('es-AR',{day:'2-digit',month:'2-digit',year:'2-digit'}) }); STATE.whatIf.cash+=currentValue; STATE.whatIf.positions.splice(index,1); saveWhatIf(); renderWhatIf(); renderRanking(); }
function whatIfRecharge() { STATE.whatIf.cash+=1000; STATE.whatIf.totalInjected=(STATE.whatIf.totalInjected||1000)+1000; saveWhatIf(); renderWhatIf(); const wantsCoffee=confirm('Se agregaron $1000 virtuales 🎮\n\nSi CryptoRadar te sirve, se agradece un café ☕. ¿Ver cómo apoyar?'); if(wantsCoffee) openDonate(); }
function whatIfReset() { if (!confirm('¿Reiniciar el juego What If?')) return; STATE.whatIf=normalizeWhatIf(null); saveWhatIf(); renderWhatIf(); renderRanking(); }
function renderWhatIf() { renderWhatIfPersonal(); renderWhatIfHistory(); populateWhatIfMarket(); }
function renderWhatIfPersonal() { const cashEl=document.getElementById('whatif-cash'), totalEl=document.getElementById('whatif-total'), investedEl=document.getElementById('whatif-invested'), pnlEl=document.getElementById('whatif-pnl'), positionsEl=document.getElementById('whatif-positions'), chartEl=document.getElementById('whatif-chart'); if (!cashEl) return; const positions=STATE.whatIf.positions||[]; let invested=0, currentPositionsValue=0; const positionsHtml = !positions.length ? '<div class="whatif-empty">Todavía no abriste ninguna posición. Comprá una cripto con saldo ficticio.</div>' : positions.map((pos,idx)=>{ const coin=getCurrentCoin(pos.id); const currentPrice=coin?.current_price||pos.entryPrice; const currentValue=pos.qty*currentPrice; const pnl=currentValue-pos.invested; const pnlPct=pos.invested?(pnl/pos.invested)*100:0; invested+=pos.invested; currentPositionsValue+=currentValue; return `<div class="whatif-position"><div class="whatif-position-top"><div class="whatif-coin"><img src="${pos.image||coin?.image||''}" alt="${pos.symbol||''}" onerror="this.style.display='none'"><div><div class="whatif-coin-name">${escapeHtml(pos.name)}</div><div class="whatif-coin-sub">${String(pos.symbol||'').toUpperCase()}</div></div></div><div class="whatif-pnl ${pnl>=0?'up':'down'}">${pnl>=0?'+':'-'}${formatPrice(Math.abs(pnl))}<br>${pnl>=0?'+':'-'}${Math.abs(pnlPct).toFixed(2)}%</div></div><div class="whatif-position-data"><div><div class="whatif-mini-label">Entrada</div><div class="whatif-mini-value">${formatPrice(pos.entryPrice)}</div></div><div><div class="whatif-mini-label">Actual</div><div class="whatif-mini-value">${formatPrice(currentPrice)}</div></div><div><div class="whatif-mini-label">Valor</div><div class="whatif-mini-value">${formatPrice(currentValue)}</div></div></div><button class="whatif-sell" onclick="whatIfSell(${idx})">VENDER SIMULADO</button></div>`; }).join(''); const total=STATE.whatIf.cash+currentPositionsValue; const totalInjected=STATE.whatIf.totalInjected||1000; const pnlTotal=total-totalInjected; const pnlPctTotal=totalInjected?(pnlTotal/totalInjected)*100:0; cashEl.textContent=formatPrice(STATE.whatIf.cash); totalEl.textContent=formatPrice(total); investedEl.textContent=formatPrice(invested); pnlEl.textContent=`${pnlTotal>=0?'+':'-'}${formatPrice(Math.abs(pnlTotal))}`; pnlEl.className=`whatif-stat-value ${pnlTotal>=0?'up':'down'}`; if (positionsEl) positionsEl.innerHTML=positionsHtml; if (chartEl) { const width=Math.min(50, Math.abs(pnlPctTotal)*2); const cls=pnlTotal>=0?'up':'down'; chartEl.innerHTML=`<div class="whatif-chart-title"><span>Resultado</span><span class="whatif-stat-value ${cls}">${pnlTotal>=0?'+':'-'}${Math.abs(pnlPctTotal).toFixed(2)}%</span></div><div class="whatif-chart-track"><div class="whatif-chart-mid"></div><div class="whatif-chart-bar ${cls}" style="width:${width}%"></div></div><div class="whatif-chart-scale"><span>Pérdida</span><span>0</span><span>Ganancia</span></div>`; } }
function renderWhatIfHistory() { const el=document.getElementById('whatif-history-list'); if (!el) return; const history=STATE.whatIf.history||[]; if (!history.length) return el.innerHTML='<div class="whatif-empty">Aún no cerraste ninguna posición.</div>'; el.innerHTML=history.slice(-5).reverse().map(h=>{ const pnl=h.closeValue-h.invested; const pnlPct=h.invested?(pnl/h.invested)*100:0; return `<div class="whatif-history-item"><div><div class="whatif-history-label">${escapeHtml(h.name)} · ${h.date}</div><div class="whatif-history-label">Invertido: ${formatPrice(h.invested)}</div></div><div class="whatif-history-val ${pnl>=0?'up':'down'}">${pnl>=0?'+':''}${formatPrice(pnl)}<br><span style="font-size:.6rem">${pnl>=0?'+':''}${pnlPct.toFixed(1)}%</span></div></div>`; }).join(''); }
function populateWhatIfMarket() { const el=document.getElementById('whatif-market'); if (!el) return; if (!STATE.cryptos.length) return el.innerHTML='<div class="whatif-empty">Cargando precios del mercado...</div>'; el.innerHTML=STATE.cryptos.map(c=>`<div class="whatif-market-card"><img src="${c.image||''}" alt="${c.symbol}" onerror="this.style.display='none'"><div class="whatif-market-info"><div class="whatif-market-name">${escapeHtml(c.name)}</div><div class="whatif-market-price">${String(c.symbol||'').toUpperCase()} · ${formatPrice(c.current_price)}</div></div><button class="whatif-buy" onclick="whatIfBuy('${c.id}')">COMPRAR</button></div>`).join(''); }
function renderRanking() { const targets=[document.getElementById('ranking-list')].filter(Boolean); if (!targets.length) return; const session=getCurrentUser(); const username=session && !session.isGuest ? '@'+session.user : 'Invitado'; let currentValue=STATE.whatIf.cash; (STATE.whatIf.positions||[]).forEach(pos=>{ const coin=getCurrentCoin(pos.id); currentValue += pos.qty*(coin?.current_price||pos.entryPrice); }); const totalInjected=STATE.whatIf.totalInjected||1000; const userPnl=currentValue-totalInjected; const userPnlPct=totalInjected?(userPnl/totalInjected)*100:0; const demo=[{user:'cryptowizard',pnl:342.5,pct:34.25},{user:'satoshi_fan',pnl:218,pct:21.8},{user:'moonhunter',pnl:187.3,pct:18.73},{user:'defi_queen',pnl:95.1,pct:9.51},{user:'hodler2024',pnl:-32,pct:-3.2}]; const entries=[...demo]; const hasActivity=(STATE.whatIf.positions||[]).length || (STATE.whatIf.history||[]).length; if (hasActivity) entries.push({user:username,pnl:userPnl,pct:userPnlPct,isYou:true}); entries.sort((a,b)=>b.pnl-a.pnl); const html=entries.map((e,i)=>{ const label=i===0?'🥇':i===1?'🥈':i===2?'🥉':'#'+(i+1); const posCls=i===0?'gold':i===1?'silver':i===2?'bronze':''; return `<div class="ranking-item" style="${e.isYou?'border-color:rgba(255,214,0,.45)':''}"><div class="ranking-pos ${posCls}">${label}</div><div class="ranking-info"><div class="ranking-user">${escapeHtml(e.user)} ${e.isYou?'<span style="font-family:var(--font-mono);font-size:.55rem;color:var(--yellow);margin-left:6px">VOS</span>':''}</div><div class="ranking-user-sub">${currentRankingTab==='semanal'?'Semana actual':currentRankingTab==='mensual'?'Mes actual':'Histórico'}</div></div><div class="ranking-pnl ${e.pnl>=0?'up':'down'}">${e.pnl>=0?'+':''}${formatPrice(e.pnl)}<br><span style="font-size:.6rem">${e.pct>=0?'+':''}${e.pct.toFixed(2)}%</span></div></div>`; }).join(''); targets.forEach(t=>t.innerHTML=html); }
function switchRankingTab(tab, el) { currentRankingTab=tab; document.querySelectorAll('.ranking-tab').forEach(b=>b.classList.remove('active')); el?.classList.add('active'); renderRanking(); }


function renderFavs() {
  const shareNum = document.getElementById('share-num');
  if (shareNum) shareNum.textContent = String(STATE.shareCount);
  const locked = document.getElementById('fav-locked');
  const unlocked = document.getElementById('fav-unlocked');
  const grid = document.getElementById('fav-grid');
  if (!locked || !unlocked || !grid) return;
  locked.style.display = STATE.unlocked ? 'none' : 'block';
  unlocked.style.display = STATE.unlocked ? 'block' : 'none';
  if (!STATE.unlocked) return;
  const favCryptos = STATE.cryptos.filter(c => STATE.favs.includes(c.id));
  if (!favCryptos.length) {
    grid.innerHTML = '<div class="whatif-empty">Todavía no agregaste ninguna. Tocá una cripto en Mercado y agregala desde el detalle.</div>';
    return;
  }
  grid.innerHTML = favCryptos.map(c => {
    const chg = c.price_change_percentage_24h || 0;
    const cls = chg >= 0 ? 'up' : 'down';
    const arrow = chg >= 0 ? '▲' : '▼';
    return `<div class="fav-item" onclick="openModal(${STATE.cryptos.findIndex(x=>x.id===c.id)})"><div class="fav-item-icon"><img src="${c.image||''}" alt="${c.symbol}" onerror="this.style.display='none'"></div><div class="fav-item-info"><div class="fav-item-name">${escapeHtml(c.name)}</div><div class="fav-item-price">${formatPrice(c.current_price)}</div></div><div class="fav-item-change ${cls}">${arrow} ${Math.abs(chg).toFixed(2)}%</div><button class="remove-fav" onclick="event.stopPropagation(); removeFav('${c.id}')">×</button></div>`;
  }).join('');
}
function updateModalFavButton(coinId) {
  const btn = document.getElementById('modal-fav-btn');
  if (!btn) return;
  if (!STATE.unlocked) btn.textContent = '🔒 Desbloquear Mis Cryptos';
  else btn.textContent = STATE.favs.includes(coinId) ? '★ En Mis Cryptos' : '☆ Agregar a Mis Cryptos';
}
function toggleFav() {
  const coin = STATE.cryptos[currentModalIdx];
  if (!coin) return;
  if (!STATE.unlocked) { closeModal(); showPage('favoritos', document.getElementById('nav-favoritos')); return; }
  if (STATE.favs.includes(coin.id)) STATE.favs = STATE.favs.filter(id => id !== coin.id);
  else STATE.favs.push(coin.id);
  saveFavs(); updateModalFavButton(coin.id);
}
function removeFav(id) { STATE.favs = STATE.favs.filter(x => x !== id); saveFavs(); }
function tryShare() {
  if (STATE.shareCount < 3) STATE.shareCount += 1;
  if (STATE.shareCount >= 3) STATE.unlocked = true;
  persistFavsLocal(); saveUserData(); renderFavs();
  const shareData = { title:'CryptoRadar', text:'Probá CryptoRadar: fantasy crypto social, gratis y simple.', url: PUBLIC_APP_URL };
  if (navigator.share) navigator.share(shareData).catch(copyPublicLink);
  else copyPublicLink();
}
function copyPublicLink() {
  if (navigator.clipboard && location.protocol === 'https:') navigator.clipboard.writeText(PUBLIC_APP_URL).then(()=>alert('Link copiado para compartir:\n' + PUBLIC_APP_URL)).catch(()=>prompt('Copiá este link:', PUBLIC_APP_URL));
  else prompt('Copiá este link:', PUBLIC_APP_URL);
}

function openModal(idx) { const c=STATE.cryptos[idx]; if (!c) return; currentModalIdx=idx; const chg=c.price_change_percentage_24h||0; const img=document.getElementById('modal-img'); if (img) { img.src=c.image||''; img.style.display=c.image?'block':'none'; } document.getElementById('modal-name').textContent=`${c.name} (${String(c.symbol||'').toUpperCase()})`; document.getElementById('modal-price').textContent=formatPrice(c.current_price); document.getElementById('modal-price').style.color=chg>0?'var(--green)':chg<0?'var(--red)':'var(--yellow)'; document.getElementById('modal-change').textContent=(chg>0?'▲ +':chg<0?'▼ ':'— ')+Math.abs(chg).toFixed(2)+'%'; document.getElementById('modal-change').style.color=chg>0?'var(--green)':chg<0?'var(--red)':'var(--yellow)'; document.getElementById('modal-mcap').textContent=formatLarge(c.market_cap); document.getElementById('modal-vol').textContent=formatLarge(c.total_volume); document.getElementById('modal-rank').textContent='#'+(c.market_cap_rank||'—'); document.getElementById('modal-calc-usd').value=''; document.getElementById('modal-calc-result').innerHTML='Ingresá un monto en USD'; updateModalFavButton(c.id); document.getElementById('modal-overlay')?.classList.add('open'); }
function closeModal(e) { if (!e || e.target === document.getElementById('modal-overlay')) document.getElementById('modal-overlay')?.classList.remove('open'); }
function calcConvert() { const usd=parseFloat(document.getElementById('modal-calc-usd')?.value); const result=document.getElementById('modal-calc-result'); if (!result) return; if (!usd || usd<=0) return result.innerHTML='Ingresá un monto en USD'; const c=STATE.cryptos[currentModalIdx]; if (!c?.current_price) return; const amount=usd/c.current_price; result.innerHTML=`$${usd.toLocaleString('en-US')} USD = <span>${amount>=1?amount.toFixed(4):amount.toFixed(8)} ${String(c.symbol||'').toUpperCase()}</span>`; }

function scheduleMarketRefresh() { nextUpdateAt=Date.now()+REFRESH_INTERVAL_MS; updateRefreshCountdown(); if (refreshCountdownTimer) clearInterval(refreshCountdownTimer); refreshCountdownTimer=setInterval(updateRefreshCountdown,1000); if (marketRefreshInterval) clearInterval(marketRefreshInterval); marketRefreshInterval=setInterval(()=>{ fetchAll(); nextUpdateAt=Date.now()+REFRESH_INTERVAL_MS; }, REFRESH_INTERVAL_MS); }
function updateRefreshCountdown() { const els=document.querySelectorAll('.refresh-countdown'); if (!els.length) return; let last='Última actualización: pendiente'; if (STATE.lastUpdate && !isNaN(STATE.lastUpdate.getTime())) last='Última actualización: '+STATE.lastUpdate.toLocaleString('es-AR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}); let timer='15:00'; if (nextUpdateAt) { const s=Math.ceil(Math.max(0,nextUpdateAt-Date.now())/1000); timer=`${Math.floor(s/60).toString().padStart(2,'0')}:${(s%60).toString().padStart(2,'0')}`; } els.forEach(el=>el.innerHTML=`${last} · próxima en <span>${timer}</span>`); }
async function manualDataRefresh() {
  const btn = document.getElementById('app-refresh-btn');
  btn?.classList.add('loading');

  gainersData = [];
  losersData = [];
  localStorage.setItem('cr2-novedades-ts', '0'); // forzar recarga novedades

  try {
    // 1) Actualiza datos JSON
    await fetchAll();

    if (currentMarketTab === 'top') {
      renderCryptosList(STATE.cryptos);
    } else {
      await switchMarketTab(currentMarketTab, document.getElementById('subtab-' + currentMarketTab));
    }

    nextUpdateAt = Date.now() + REFRESH_INTERVAL_MS;
    updateRefreshCountdown();
    renderFavs();
    clearOfflineMessage();

    // 2) Luego revisa si hay versión nueva de app
    await checkForAppUpdate();
  } catch (e) {
    console.error(e);
    setOfflineMessage('📡 No se pudo actualizar datos — se mantienen los últimos datos guardados');
  } finally {
    btn?.classList.remove('loading');
  }
}

// Compatibilidad con botones viejos que todavía llamen manualRefresh()
function manualRefresh() {
  return manualDataRefresh();
}
function setOfflineMessage(msg) { const b=document.getElementById('offline-banner'); if (b) { b.textContent=msg; b.classList.add('show'); } }
function clearOfflineMessage() { const b=document.getElementById('offline-banner'); if (b && navigator.onLine) b.classList.remove('show'); }
function updateOnlineStatus() { if (!navigator.onLine) setOfflineMessage(loadMarketCache()?'📡 Sin conexión — mostrando últimos datos guardados':'📡 Sin conexión — conectate una vez para cargar datos'); else clearOfflineMessage(); }
window.addEventListener('online', updateOnlineStatus); window.addEventListener('offline', updateOnlineStatus);

async function checkForAppUpdate(showIfCurrent = false) {
  try {
    const data = await fetchJsonFresh(APP_VERSION_URL);
    if (!data || !data.version) return false;

    const remoteVersion = String(data.version || '');
    const remoteBuild = String(data.build || '');
    const localVersion = String(APP_VERSION);
    const localBuild = String(APP_BUILD);

    const hasNewVersion =
      remoteVersion && (
        remoteVersion !== localVersion ||
        (remoteBuild && remoteBuild !== localBuild)
      );

    if (hasNewVersion) {
      const banner = document.getElementById('update-banner');
      const text = document.getElementById('update-banner-text');

      if (text) {
        text.textContent = data.message || `Nueva versión disponible: ${remoteVersion}`;
      }

      if (banner) {
        banner.classList.add('show');
      }

      localStorage.setItem('cr2-remote-version', remoteVersion);
      if (remoteBuild) localStorage.setItem('cr2-remote-build', remoteBuild);

      return true;
    }

    localStorage.removeItem('cr2-remote-version');
    localStorage.removeItem('cr2-remote-build');

    const banner = document.getElementById('update-banner');
    if (banner) banner.classList.remove('show');

    if (showIfCurrent) {
      alert('La app ya está actualizada.');
    }

    return false;
  } catch (e) {
    console.warn('No se pudo revisar version.json', e);
    return false;
  }
}
async function applyAppUpdate() {
  const keepMap = {
    'cr2-whatif': localStorage.getItem('cr2-whatif'),
    [DB_KEY]: localStorage.getItem(DB_KEY),
    [SESSION_KEY]: localStorage.getItem(SESSION_KEY),
    'cr2-lang': localStorage.getItem('cr2-lang'),
    'cr2-lang-chosen': localStorage.getItem('cr2-lang-chosen'),
    'cr2-seen': localStorage.getItem('cr2-seen'),
    'cr2-terms-accepted': localStorage.getItem('cr2-terms-accepted'),
    'cr2-favs': localStorage.getItem('cr2-favs'),
    'cr2-share-count': localStorage.getItem('cr2-share-count'),
    'cr2-favs-unlocked': localStorage.getItem('cr2-favs-unlocked')
  };

  try {
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    }

    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(
        regs.map(reg => reg.update().catch(() => null))
      );
    }
  } catch (e) {
    console.warn('No se pudo limpiar cache completamente', e);
  }

  Object.entries(keepMap).forEach(([key, value]) => {
    if (value !== null && value !== undefined) {
      localStorage.setItem(key, value);
    }
  });

  const remoteBuild = localStorage.getItem('cr2-remote-build') || String(Date.now());
  location.replace(location.pathname + '?v=' + encodeURIComponent(remoteBuild));
}

if ('serviceWorker' in navigator && location.protocol === 'https:') { window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(()=>{})); }
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredPrompt=e; showInstallBanner(); });
function initPwaInstallBanner() { setTimeout(()=>{ if (!isStandalone() && !localStorage.getItem('cr2-install-dismissed')) showInstallBanner(); }, 2600); }
function isStandalone() { return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true; }
function showInstallBanner() { const b=document.getElementById('install-banner'); if (b && !isStandalone()) b.style.display='flex'; }
function installApp() { if (deferredPrompt) { deferredPrompt.prompt(); deferredPrompt.userChoice.finally(()=>deferredPrompt=null); } else alert('En Android usá Chrome → menú ⋮ → Agregar a pantalla principal. En iPhone usá Safari → Compartir → Agregar a pantalla de inicio.'); dismissInstallBanner(); }
function dismissInstallBanner() { document.getElementById('install-banner').style.display='none'; localStorage.setItem('cr2-install-dismissed','1'); }

function showTermsIfNeeded() { if (!localStorage.getItem('cr2-terms-accepted')) document.getElementById('terms-modal')?.classList.add('open'); }
function acceptTerms() { localStorage.setItem('cr2-terms-accepted','1'); document.getElementById('terms-modal')?.classList.remove('open'); }
function openDonate() { document.getElementById('donate-modal')?.classList.add('open'); }
function closeDonate() { document.getElementById('donate-modal')?.classList.remove('open'); }
function copyUID() { const uid='143089741'; if (navigator.clipboard) navigator.clipboard.writeText(uid).finally(showCopied); else { prompt('Copiá este UID:', uid); showCopied(); } }
function showCopied() { const btn=document.getElementById('copy-uid-btn'); if (!btn) return; const old=btn.textContent; btn.textContent='✓ Copiado'; btn.style.color='var(--green)'; setTimeout(()=>{btn.textContent=old; btn.style.color='';},1600); }
function showPage(name, navEl) { document.querySelectorAll('.page').forEach(p=>p.classList.remove('active')); document.getElementById('page-'+name)?.classList.add('active'); document.querySelectorAll('.nav-btn').forEach(b=>b.classList.remove('active')); navEl?.classList.add('active'); if (name==='favoritos') renderFavs(); if (name==='novedades') { const lastLoad = parseInt(localStorage.getItem('cr2-novedades-ts')||'0'); if (Date.now()-lastLoad > 15*60*1000) { localStorage.setItem('cr2-novedades-ts', String(Date.now())); loadNovedades(); } } }
function showCryptoGlossary() { alert('Glosario cripto básico\n\n• Cripto: activo digital en blockchain.\n• Blockchain: registro público distribuido.\n• Exchange: plataforma para operar criptos.\n• Market cap: valor total aproximado.\n• Volumen 24h: dinero movido en 24 horas.\n• PnL: ganancia o pérdida.\n\nNo es recomendación de inversión.'); }
function formatPrice(p) { if (p==null || isNaN(p)) return '—'; const n=Number(p); if (Math.abs(n)>=1) return '$'+n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}); return '$'+n.toFixed(6); }
function formatLarge(n) { if (!n || isNaN(n)) return '—'; n=Number(n); if (n>=1e12) return '$'+(n/1e12).toFixed(2)+'T'; if (n>=1e9) return '$'+(n/1e9).toFixed(2)+'B'; if (n>=1e6) return '$'+(n/1e6).toFixed(2)+'M'; return '$'+n.toLocaleString(); }
function escapeHtml(str) { return String(str ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch])); }
