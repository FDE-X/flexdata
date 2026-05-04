const SUPABASE_URL = 'https://kavuylmowzmdupyilhdk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImthdnV5bG1vd3ptZHVweWlsaGRrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc4MjI4OTQsImV4cCI6MjA5MzM5ODg5NH0.mSD9Mnpa1HavWMMeIi6RH427ru4xsUwsdKDcHw6QVII';

// â”€â”€â”€ GOOGLE SHEETS INTEGRATION â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Selepas deploy GOOGLE_SHEETS_SETUP.gs sebagai Web App, letak URL di sini:
const GS_ENDPOINT = 'https://script.google.com/macros/s/AKfycbz1EDj4xShsXRgywqv_Loan4TN0RHMhX6Q465zw4_qp2dCiHd3lTjTTjQYyNctJShq4SA/exec';
const GS_SECRET   = 'JPVS_FIRFLEET_2025_SECRET';
const GS_ENABLED  = GS_ENDPOINT.length > 10;

// Queue MESTI dideklarasi SEBELUM syncToGS (elak temporal dead zone)
const gsQueue = [];

// Hantar data ke Google Sheets (fire-and-forget, tidak block UI)
async function syncToGS(action, payload) {
  if (!GS_ENABLED || !currentUser) return;
  try {
    const enriched = {
      ...payload,
      user_id      : currentUser.id,
      nama_pengguna: currentUser.name
    };
    const res = await fetch(GS_ENDPOINT, {
      method : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body   : JSON.stringify({ token: GS_SECRET, action, payload: enriched })
    });
    if (!res.ok) console.warn('[GS] HTTP', res.status);
    else console.log('[GS] âœ“', action);
  } catch (e) {
    console.warn('[GS] sync error:', e.message);
    gsQueue.push({ action, payload, ts: Date.now() });
  }
}

// Retry queue setiap 10 saat
setInterval(async () => {
  if (!GS_ENABLED || gsQueue.length === 0 || !currentUser) return;
  const item = gsQueue.shift();
  await syncToGS(item.action, item.payload);
}, 10000);
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

// â”€â”€â”€ Minimal Supabase Auth client (no CDN required) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Implements only what we need: signInWithOAuth, getSession, signOut, onAuthStateChange
const supabase = (() => {
  const BASE = SUPABASE_URL + '/auth/v1';
  const HEADERS = { 'apikey': SUPABASE_ANON_KEY, 'Content-Type': 'application/json' };
  let _session = null;
  let _listeners = [];

  // Persist session in localStorage
  const STORAGE_KEY = 'jpvs_session';
  function saveSession(s){ try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); }catch(e){} }
  function loadSession(){ try{ return JSON.parse(localStorage.getItem(STORAGE_KEY)||'null'); }catch(e){ return null; } }
  function clearSession(){ try{ localStorage.removeItem(STORAGE_KEY); }catch(e){} }
  function notify(event, session){ _listeners.forEach(fn=>{ try{ fn(event,session); }catch(e){} }); }

  // Parse session from URL hash (after OAuth redirect)
  function parseHashSession(){
    const hash = window.location.hash.substring(1);
    if(!hash) return null;
    const params = {};
    hash.split('&').forEach(p=>{ const [k,v]=p.split('='); if(k) params[k]=decodeURIComponent(v||''); });
    if(params.access_token && params.token_type){
      // Build a session object from hash params
      let user = null;
      try {
        // Decode JWT payload (base64)
        const payload = params.access_token.split('.')[1];
        const decoded = JSON.parse(atob(payload.replace(/-/g,'+').replace(/_/g,'/')));
        user = {
          id: decoded.sub,
          email: decoded.email || '',
          app_metadata: decoded.app_metadata || {},
          user_metadata: decoded.user_metadata || {}
        };
      } catch(e){ console.warn('JWT decode error', e); }
      const session = {
        access_token: params.access_token,
        refresh_token: params.refresh_token || '',
        expires_in: parseInt(params.expires_in||'3600'),
        token_type: params.token_type,
        user: user
      };
      // Clean hash from URL without reload
      history.replaceState(null, '', window.location.pathname + window.location.search);
      return session;
    }
    return null;
  }

  const auth = {
    onAuthStateChange(callback){
      _listeners.push(callback);
      // Fire immediately with current session
      const s = _session || loadSession();
      if(s){ _session = s; callback('INITIAL_SESSION', s); }
      else { callback('INITIAL_SESSION', null); }
      return { data: { subscription: { unsubscribe(){ _listeners = _listeners.filter(f=>f!==callback); } } } };
    },

    async getSession(){
      if(_session) return { data: { session: _session }, error: null };
      // Check URL hash first (OAuth redirect)
      const hashSession = parseHashSession();
      if(hashSession){ _session = hashSession; saveSession(hashSession); notify('SIGNED_IN', hashSession); return { data: { session: hashSession }, error: null }; }
      // Check localStorage
      const stored = loadSession();
      if(stored){ _session = stored; return { data: { session: stored }, error: null }; }
      return { data: { session: null }, error: null };
    },

    async signInWithOAuth({ provider, options }){
      // Build the Supabase OAuth URL directly
      const redirectTo = (options && options.redirectTo) || window.location.href;
      const params = new URLSearchParams({
        provider: provider,
        redirect_to: redirectTo,
        scopes: 'email profile'
      });
      const oauthUrl = `${BASE}/authorize?${params.toString()}`;
      // Navigate to Google via Supabase
      window.location.href = oauthUrl;
      return { data: {}, error: null };
    },

    async signOut(){
      const token = _session && _session.access_token;
      _session = null;
      clearSession();
      notify('SIGNED_OUT', null);
      if(token){
        try {
          await fetch(`${BASE}/logout`, {
            method: 'POST',
            headers: { ...HEADERS, 'Authorization': `Bearer ${token}` }
          });
        } catch(e){}
      }
      return { error: null };
    }
  };

  // Auto-detect session on load (hash from OAuth redirect)
  (async ()=>{
    const hashSession = parseHashSession();
    if(hashSession){ _session = hashSession; saveSession(hashSession); setTimeout(()=>notify('SIGNED_IN', hashSession), 0); }
    else {
      const stored = loadSession();
      if(stored){ _session = stored; setTimeout(()=>notify('INITIAL_SESSION', stored), 0); }
      else { setTimeout(()=>notify('INITIAL_SESSION', null), 0); }
    }
  })();

  return { auth };
})();

console.log('âœ“ Supabase auth client ready (no CDN)');
/*
  Supabase SQL schema for JPVS enforcement portal
  ------------------------------------------------
  CREATE TABLE users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email text UNIQUE NOT NULL,
    full_name text,
    role text NOT NULL DEFAULT 'user',
    created_at timestamptz DEFAULT now()
  );

  CREATE TABLE travel_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES users(id),
    date date,
    depart_time time,
    return_time time,
    driver text,
    destination text,
    approver text,
    odometer_start numeric,
    odometer_end numeric,
    distance_km numeric,
    fuel_liters numeric,
    cost_rm numeric,
    receipt_no text,
    note text,
    created_at timestamptz DEFAULT now()
  );

  CREATE TABLE enforcement_cases (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES users(id),
    incident_year int,
    incident_month text,
    officer text,
    category text,
    police_report_no text,
    incident_date date,
    incident_time time,
    location text,
    offence text,
    statute text,
    case_no text,
    seizure_type text,
    cattle_count int DEFAULT 0,
    buffalo_count int DEFAULT 0,
    goat_count int DEFAULT 0,
    sheep_count int DEFAULT 0,
    pig_count int DEFAULT 0,
    chicken_count int DEFAULT 0,
    total_value_rm numeric DEFAULT 0,
    disposition text,
    notes text,
    created_at timestamptz DEFAULT now()
  );

  CREATE TABLE announcements (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    message text NOT NULL,
    created_at timestamptz DEFAULT now()
  );
*/

// ========================================
// BASEROW REALTIME INTEGRATION
// ========================================
const BASEROW_URL = 'https://api.baserow.io/api/';
const BASEROW_API_TOKEN = '<YOUR_BASEROW_API_TOKEN>';
const BASEROW_DATABASE_ID = '<YOUR_DATABASE_ID>';
const BASEROW_TABLE_ID = '<YOUR_TABLE_ID>';
const isBaserowConfigured = !BASEROW_API_TOKEN.includes('<YOUR_') && !BASEROW_DATABASE_ID.includes('<YOUR_');

class BaserowClient {
  constructor(baseURL, apiToken) {
    this.baseURL = baseURL;
    this.apiToken = apiToken;
    this.headers = {
      'Authorization': `Token ${apiToken}`,
      'Content-Type': 'application/json'
    };
  }

  async getTableData(tableId, pageSize = 200) {
    try {
      const response = await fetch(`${this.baseURL}database/rows/table/${tableId}/?size=${pageSize}`, {
        method: 'GET',
        headers: this.headers
      });
      if (!response.ok) throw new Error(`Baserow API error: ${response.status}`);
      return await response.json();
    } catch (error) {
      console.error('Baserow getTableData error:', error);
      return null;
    }
  }

  async createRow(tableId, data) {
    try {
      const response = await fetch(`${this.baseURL}database/rows/table/${tableId}/`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(data)
      });
      if (!response.ok) throw new Error(`Baserow API error: ${response.status}`);
      return await response.json();
    } catch (error) {
      console.error('Baserow createRow error:', error);
      return null;
    }
  }

  async updateRow(tableId, rowId, data) {
    try {
      const response = await fetch(`${this.baseURL}database/rows/table/${tableId}/${rowId}/`, {
        method: 'PATCH',
        headers: this.headers,
        body: JSON.stringify(data)
      });
      if (!response.ok) throw new Error(`Baserow API error: ${response.status}`);
      return await response.json();
    } catch (error) {
      console.error('Baserow updateRow error:', error);
      return null;
    }
  }

  async deleteRow(tableId, rowId) {
    try {
      const response = await fetch(`${this.baseURL}database/rows/table/${tableId}/${rowId}/`, {
        method: 'DELETE',
        headers: this.headers
      });
      return response.ok;
    } catch (error) {
      console.error('Baserow deleteRow error:', error);
      return false;
    }
  }

  async getDatabases() {
    try {
      const response = await fetch(`${this.baseURL}databases/`, {
        method: 'GET',
        headers: this.headers
      });
      if (!response.ok) throw new Error(`Baserow API error: ${response.status}`);
      return await response.json();
    } catch (error) {
      console.error('Baserow getDatabases error:', error);
      return null;
    }
  }

  async getTables(databaseId) {
    try {
      const response = await fetch(`${this.baseURL}database/tables/?database_id=${databaseId}`, {
        method: 'GET',
        headers: this.headers
      });
      if (!response.ok) throw new Error(`Baserow API error: ${response.status}`);
      return await response.json();
    } catch (error) {
      console.error('Baserow getTables error:', error);
      return null;
    }
  }

  setupRealtimeListener(tableId, callback) {
    // Baserow WebSocket realtime API setup
    const ws = new WebSocket(`wss://api.baserow.io/ws/database/rows/table/${tableId}/`);
    
    ws.onopen = () => {
      console.log(`Baserow realtime listener connected to table ${tableId}`);
      ws.send(JSON.stringify({
        type: 'auth',
        token: this.apiToken
      }));
    };

    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.type === 'row_update' || message.type === 'row_create' || message.type === 'row_delete') {
        if (callback) callback(message);
      }
    };

    ws.onerror = (error) => {
      console.error('Baserow WebSocket error:', error);
    };

    ws.onclose = () => {
      console.log('Baserow realtime listener disconnected. Retrying in 5s...');
      setTimeout(() => this.setupRealtimeListener(tableId, callback), 5000);
    };

    return ws;
  }
}

const baserow = isBaserowConfigured ? new BaserowClient(BASEROW_URL, BASEROW_API_TOKEN) : null;
let baserowData = [];
let baserowWebSocket = null;

const FUEL_RATE = 2.05;
const months = ['Januari','Februari','Mac','April','Mei','Jun','Julai','Ogos','September','Oktober','November','Disember'];


let currentLang = 'ms';
let isLoggedIn = false;
let currentUser = null;
let travelData = [];
let enfData = [];
let uploadedFiles = {minyak:[],odo:[],kes:[]};
let announcement = 'Selamat datang ke Portal Sistem Pengurusan Data. Sila kemaskini rekod anda. ';

const i18n = {
  ms:{
    'nav.main':'UTAMA','nav.dashboard':'Dashboard','nav.records':'REKOD',
    'nav.wfb':'Kad Waktu (WFB)','nav.travel':'Log Perjalanan',
    'nav.enforcement':'Data Penguatkuasa','nav.data':'DATA & EKSPORT',
    'nav.admin':'Super Admin',
    'greeting.pagi':'Selamat Pagi','greeting.tengah':'Selamat Tengah Hari',
    'greeting.petang':'Selamat Petang','greeting.malam':'Selamat Malam'
  },
  en:{
    'nav.main':'MAIN','nav.dashboard':'Dashboard','nav.records':'RECORDS',
    'nav.wfb':'Time Card (WFB)','nav.travel':'Travel Log',
    'nav.enforcement':'Enforcement Data','nav.data':'DATA & EXPORT',
    'nav.admin':'Super Admin',
    'greeting.pagi':'Good Morning','greeting.tengah':'Good Afternoon',
    'greeting.petang':'Good Evening','greeting.malam':'Good Night'
  }
};

function t(key){return (i18n[currentLang]||{})[key]||key;}

function playSound(type){
  try {
    if(!window.AudioContext && !window.webkitAudioContext) return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    const ctx = new AudioCtx();
    const gain = ctx.createGain();
    gain.gain.value = 0.12;
    gain.connect(ctx.destination);
    const now = ctx.currentTime;
    if(type==='login'){
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      osc1.type='triangle'; osc1.frequency.value=880;
      osc2.type='sine'; osc2.frequency.value=660;
      osc1.connect(gain); osc2.connect(gain);
      osc1.start(now); osc2.start(now);
      osc1.stop(now+0.18); osc2.stop(now+0.18);
    } else if(type==='click'){
      const osc = ctx.createOscillator();
      osc.type='square'; osc.frequency.value=520;
      osc.connect(gain);
      osc.start(now); osc.stop(now+0.08);
    } else if(type==='whoosh'){
      const buffer = ctx.createBuffer(1, ctx.sampleRate*0.2, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for(let i=0;i<data.length;i++){data[i]=Math.random()*2-1;data[i]*=(1 - i/data.length);}
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      const noiseGain = ctx.createGain();
      noiseGain.gain.value = 0.08;
      noise.connect(noiseGain).connect(ctx.destination);
      noise.start(now);
      noise.stop(now+0.18);
    }
  } catch(e) { /* audio not available, ignore */ }
}

function getInitials(name){
  return (name||'')[0] ? (name.split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase()) : 'JP';
}

// ---- Must be defined early â€” used by handleSupabaseAuth and doLogin ----
function showLoginError(msg){
  const loginFooter = document.querySelector('.login-footer');
  if(loginFooter){
    loginFooter.innerHTML = `<span style="color:var(--danger);font-weight:700;">âš  ${msg}</span>`;
  }
  console.error('[Login Error]', msg);
}

function resetLoginButton(){
  const btn = document.querySelector('.btn-google');
  if(!btn) return;
  btn.disabled = false;
  btn.style.opacity = '';
  btn.style.cursor = '';
  btn.innerHTML = `<svg class="google-icon" viewBox="0 0 24 24">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
  </svg> Log Masuk dengan Google`;
}
// -----------------------------------------------------------------------

async function handleSupabaseAuth(){
  // supabase is always available (no CDN dependency)
  try {
    const { data, error } = await supabase.auth.getSession();
    if(error) console.warn('getSession:', error.message);
    const session = data?.session;
    if(session && session.user && !isLoggedIn){
      buildCurrentUser(session.user);
      doLoginSuccess();
    }
  } catch(e){ console.error('handleSupabaseAuth error:', e); }
}

function buildCurrentUser(user, dbRole){
  // dbRole comes from the users table in Supabase (fetched after login)
  // Falls back to 'user' if not found
  currentUser = {
    name: user.user_metadata?.full_name || user.user_metadata?.name || user.email || 'JPVS User',
    email: user.email || '',
    role: dbRole || 'user',
    initials: getInitials(user.user_metadata?.full_name || user.user_metadata?.name || user.email),
    avatar: user.user_metadata?.avatar_url || user.user_metadata?.picture || null,
    id: user.id || ''
  };
}

// Fetch role from profiles table â€” retries once if first attempt returns empty
async function fetchUserRole(userId, accessToken){
  for(let attempt = 0; attempt < 3; attempt++){
    try {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=role`,
        {
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json'
          }
        }
      );
      if(!res.ok){
        console.warn('fetchUserRole HTTP', res.status, await res.text());
        await new Promise(r=>setTimeout(r, 500));
        continue;
      }
      const rows = await res.json();
      if(rows && rows[0] && rows[0].role){
        console.log('âœ“ Role from DB:', rows[0].role);
        return rows[0].role;
      }
      // Row not yet created â€” wait and retry
      await new Promise(r=>setTimeout(r, 600));
    } catch(e){
      console.warn('fetchUserRole error:', e);
      await new Promise(r=>setTimeout(r, 500));
    }
  }
  console.warn('fetchUserRole: could not get role after 3 attempts');
  return null;
}

// Upsert profile â€” only sets non-role fields so existing role is preserved
async function upsertUser(user, accessToken){
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates,return=minimal'
      },
      body: JSON.stringify({
        id: user.id,
        email: user.email,
        full_name: user.user_metadata?.full_name || user.user_metadata?.name || ''
        // role intentionally omitted â€” DB default or existing value is kept
      })
    });
    if(!res.ok) console.warn('upsertUser HTTP', res.status, await res.text());
    // Sync profile ke Google Sheets
    syncToGS('upsert_profile', {
      id       : user.id,
      email    : user.email,
      full_name: user.user_metadata?.full_name || user.user_metadata?.name || ''
    });
  } catch(e){ console.warn('upsertUser error:', e); }
}

async function doLogin(){
  try { playSound('click'); } catch(e){}

  // Block if opened as file:// â€” OAuth requires http/https
  if(window.location.protocol === 'file:'){
    showLoginError('Sila buka melalui pelayan web (http://localhost) bukan terus dari folder fail.');
    return;
  }

  const btn = document.querySelector('.btn-google');
  if(btn){
    btn.disabled = true;
    btn.style.opacity = '0.7';
    btn.innerHTML = 'â³ Menghubungi Google...';
  }

  // Exact GitHub Pages URL â€” must match Supabase dashboard "Redirect URLs"
  const redirectTo = 'https://fde-x.github.io/Firfleet/';

  try {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectTo,
        queryParams: { access_type: 'offline', prompt: 'select_account' }
      }
    });
    if(error){
      console.error('signInWithOAuth error:', error);
      showLoginError('Log masuk Google gagal: ' + error.message);
      resetLoginButton();
    }
    // On success browser navigates away to Google â€” nothing more runs here
  } catch(e){
    console.error('doLogin exception:', e);
    showLoginError('Ralat tidak dijangka: ' + e.message);
    resetLoginButton();
  }
}


function doLoginSuccess(){
  if(!currentUser || !currentUser.email){
    console.warn('doLoginSuccess: no valid currentUser, skipping');
    return;
  }
  try { playSound('login'); } catch(e){}

  const loginScreen = document.getElementById('loginScreen');
  loginScreen.style.transition = 'opacity 0.4s';
  loginScreen.style.opacity = '0';
  setTimeout(()=>{
    loginScreen.style.display = 'none';
    document.getElementById('appShell').style.display = 'block';
    isLoggedIn = true;

    const avatarEl = document.getElementById('userAvatar');
    if(avatarEl){
      if(currentUser.avatar){
        avatarEl.innerHTML = `<img src="${currentUser.avatar}" alt="${currentUser.initials}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;
      } else {
        avatarEl.textContent = currentUser.initials;
      }
    }
    const nameEl = document.getElementById('userName');
    if(nameEl) nameEl.textContent = currentUser.name.split(' ')[0];
    const roleEl = document.getElementById('userRoleDisplay');
    if(roleEl) roleEl.textContent = currentUser.role === 'superadmin' ? 'Super Admin' : 'Pegawai Penguatkuasa';
    const adminNav = document.getElementById('adminNavItem');
    if(adminNav){
      adminNav.style.display = currentUser.role === 'superadmin' ? 'flex' : 'none';
    }

    try { renderWFB(); } catch(e){ console.warn('renderWFB',e); }
    try { renderAdminPanel(); } catch(e){ console.warn('renderAdminPanel',e); }
    try { renderCharts(); } catch(e){ console.warn('renderCharts',e); }
    try { updateAnnDisplay(); } catch(e){ console.warn('updateAnnDisplay',e); }
    try { updateStats(); } catch(e){ console.warn('updateStats',e); }
    try { triggerReveal(); } catch(e){ console.warn('triggerReveal',e); }
    try { loadUserData(); } catch(e){ console.warn('loadUserData',e); }
  }, 400);
}


async function signOut(){
  try { if(supabase) await supabase.auth.signOut(); } catch(e){ console.warn('signOut:',e); }
  isLoggedIn = false;
  currentUser = null;
  document.getElementById('appShell').style.display = 'none';
  const loginScreen = document.getElementById('loginScreen');
  loginScreen.style.display = 'flex';
  loginScreen.style.opacity = '1';
  const loginFooter = document.querySelector('.login-footer');
  if(loginFooter) loginFooter.innerHTML = 'Sistem ini dilindungi. Akses terhad kepada kakitangan yang diberi kuasa sahaja.<br>Jabatan Perkhidmatan Veterinar &amp; Penyembelihan &copy; 2025';
  resetLoginButton();
  showToast('Log keluar berjaya');
}

function initParticles(){
  const c=document.getElementById('particles');
  const colors=['#6C63FF','#FF6584','#43E8D8','#FFD700','#A78BFA'];
  for(let i=0;i<40;i++){
    const p=document.createElement('div');p.className='particle';
    const size=Math.random()*4+1;
    p.style.cssText=`width:${size}px;height:${size}px;left:${Math.random()*100}%;background:${colors[Math.floor(Math.random()*colors.length)]};animation-duration:${Math.random()*15+8}s;animation-delay:${Math.random()*10}s;`;
    c.appendChild(p);
  }
}

function updateClock(){
  const now=new Date();
  const h=now.getHours(),m=now.getMinutes(),s=now.getSeconds();
  const h12=h%12||12,ampm=h<12?'PG':h<18?'PTG':'MLM';
  const timeStr=`${String(h12).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  ['navClock','dashClock'].forEach(id=>{const el=document.getElementById(id);if(el)el.textContent=timeStr;});
  ['navPeriod','dashPeriod'].forEach(id=>{const el=document.getElementById(id);if(el)el.textContent=ampm;});
  const dateEl=document.getElementById('dashDate');
  if(dateEl){const days=['Ahad','Isnin','Selasa','Rabu','Khamis','Jumaat','Sabtu'];dateEl.textContent=`${days[now.getDay()]}, ${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()}`;}
  const greet=document.getElementById('greetingText');
  if(greet && currentUser){let g=t(h<12?'greeting.pagi':h<13?'greeting.tengah':h<18?'greeting.petang':'greeting.malam');greet.textContent=`${g}, ${currentUser.name.split(' ')[0]}`;}
  const wfbMonth=document.getElementById('wfbMonth');
  if(wfbMonth)wfbMonth.textContent=`${months[now.getMonth()]} ${now.getFullYear()}`;
}


function showSection(id,el){
  if (!isLoggedIn) {
    showToast('Sila log masuk untuk akses sistem.');
    document.getElementById('appShell').style.display = 'none';
    document.getElementById('loginScreen').style.display = 'flex';
    document.getElementById('loginScreen').style.opacity = '1';
    return;
  }
  playSound('whoosh');
  const overlay=document.getElementById('transOverlay');
  overlay.classList.add('animating');
  setTimeout(()=>overlay.classList.remove('animating'),700);
  document.querySelectorAll('.section').forEach(s=>s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  document.getElementById('sec-'+id).classList.add('active');
  if(el)el.classList.add('active');
  else{document.querySelectorAll('.nav-item').forEach(n=>{if(n.onclick&&n.onclick.toString().includes("'"+id+"'"))n.classList.add('active');});}
  triggerReveal();
  if(window.innerWidth<768){
    document.getElementById('sidebar').classList.remove('open');
    const bd = document.getElementById('sidebarBackdrop');
    if(bd) bd.classList.remove('visible');
  }
}


function toggleSidebar(){
  if (!isLoggedIn) return;
  const sidebar = document.getElementById('sidebar');
  const backdrop = document.getElementById('sidebarBackdrop');
  const isOpen = sidebar.classList.toggle('open');
  if(backdrop){ backdrop.classList.toggle('visible', isOpen); }
}

function toggleLang(){
  currentLang=currentLang==='ms'?'en':'ms';
  document.getElementById('langBtn').textContent=currentLang==='ms'?'ðŸŒ EN':'ðŸŒ MS';
  document.querySelectorAll('[data-i18n]').forEach(el=>{
    const key=el.getAttribute('data-i18n');const val=t(key);
    if(val!==key)el.textContent=val;
  });
}

function triggerReveal(){
  setTimeout(()=>{
    document.querySelectorAll('.reveal').forEach(el=>{
      const obs=new IntersectionObserver(entries=>{entries.forEach(e=>{if(e.isIntersecting)e.target.classList.add('visible');});},{threshold:0.1});
      obs.observe(el);
    });
  },50);
}

function renderWFB(){
  const now=new Date();
  const bulanInput=document.getElementById('wfbBulan');
  let year=now.getFullYear(),month=now.getMonth();
  if(bulanInput&&bulanInput.value){const parts=bulanInput.value.split('-');year=parseInt(parts[0]);month=parseInt(parts[1])-1;}
  const daysInMonth=new Date(year,month+1,0).getDate();
  const makeHalf=(from,to,label)=>{
    let rows='';
    for(let d=from;d<=Math.min(to,daysInMonth);d++){
      const date=new Date(year,month,d);
      const dayNames=['Ahad','Isn','Sel','Rab','Kha','Jum','Sab'];
      const isWeekend=date.getDay()===0||date.getDay()===6;
      rows+=`<tr style="${isWeekend?'opacity:0.55;':''}">
        <td style="font-weight:600;white-space:nowrap;">${d} ${dayNames[date.getDay()]}</td>
        <td><input type="time" class="wfb-masuk" data-day="${d}" onchange="checkWFBTime(this,'masuk');autoSaveWFBRow(${d},${year},${month+1})"></td>
        <td><input type="time" class="wfb-keluar" data-day="${d}" onchange="checkWFBTime(this,'keluar');autoSaveWFBRow(${d},${year},${month+1})"></td>
        <td><input type="time" data-day="${d}" data-field="masuk2" onchange="autoSaveWFBRow(${d},${year},${month+1})"></td>
        <td><input type="time" data-day="${d}" data-field="keluar2" onchange="autoSaveWFBRow(${d},${year},${month+1})"></td>
        <td><input type="text" data-day="${d}" data-field="kenyataan" placeholder="" onchange="autoSaveWFBRow(${d},${year},${month+1})"></td>
        <td><input type="text" data-day="${d}" data-field="tandatangan" placeholder="T/T" onchange="autoSaveWFBRow(${d},${year},${month+1})"></td>
        <td style="width:20px;"><span class="wfb-save-indicator" id="wfb-saved-${d}">âœ“</span></td>
      </tr>`;
    }
    return `<div class="timecard-half"><div class="timecard-header">${label}</div><div style="overflow-x:auto;-webkit-overflow-scrolling:touch;"><table class="tc-table"><thead><tr><th>TARIKH</th><th>MASUK</th><th>KELUAR</th><th>MASUK 2</th><th>KELUAR 2</th><th>KENYATAAN</th><th>T/T</th><th></th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
  };
  document.getElementById('wfbGrid').innerHTML=makeHalf(1,15,'BAHAGIAN A: 1 â€“ 15 '+months[month]+' '+year)+makeHalf(16,31,'BAHAGIAN B: 16 â€“ '+daysInMonth+' '+months[month]+' '+year);
  // Load existing WFB data from Supabase
  loadWFBData(year, month+1);
}

// Debounce map for WFB autosave
const _wfbSaveTimers = {};

function autoSaveWFBRow(day, year, bulan){
  // Debounce: wait 800ms after last change before saving
  clearTimeout(_wfbSaveTimers[day]);
  _wfbSaveTimers[day] = setTimeout(()=>{ saveWFBRow(day, year, bulan); }, 800);
}

// Called when header fields (Nama, Kem, Bahagian) change â€” re-save all filled rows
function triggerWFBHeaderSave(){
  const bulanInput = document.getElementById('wfbBulan');
  if(!bulanInput || !bulanInput.value) return;
  const parts = bulanInput.value.split('-');
  const year  = parseInt(parts[0]);
  const bulan = parseInt(parts[1]);
  // Find all days that have at least one time entry and re-save them
  document.querySelectorAll('.wfb-masuk').forEach(el => {
    if(el.value){
      const day = parseInt(el.getAttribute('data-day'));
      autoSaveWFBRow(day, year, bulan);
    }
  });
}

async function saveWFBRow(day, year, bulan){
  if(!currentUser || !currentUser.id) return;
  // Collect all inputs for this day
  const getVal = (selector) => {
    const el = document.querySelector(`${selector}[data-day="${day}"]`);
    return el ? (el.value || null) : null;
  };
  const masuk1  = getVal('.wfb-masuk');
  const keluar1 = getVal('.wfb-keluar');
  const masuk2  = getVal('[data-field="masuk2"]');
  const keluar2 = getVal('[data-field="keluar2"]');
  const kenyataan   = getVal('[data-field="kenyataan"]');
  const tandatangan = getVal('[data-field="tandatangan"]');
  const nama    = document.getElementById('wfbNama')?.value || '';
  const kemJab  = document.getElementById('wfbKem')?.value || '';
  const bahagian= document.getElementById('wfbBahagian')?.value || '';

  const payload = {
    user_id: currentUser.id,
    nama, kem_jab: kemJab, bahagian,
    tahun: year, bulan, hari: day,
    masuk1, keluar1, masuk2, keluar2,
    kenyataan, tandatangan
  };

  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/wfb_timecards`, {
      method: 'POST',
      headers: { ...sbHeaders(), 'Prefer': 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(payload)
    });
    if(res.ok || res.status === 204){
      // Flash saved indicator
      const ind = document.getElementById(`wfb-saved-${day}`);
      if(ind){ ind.style.opacity='1'; setTimeout(()=>{ ind.style.opacity='0'; }, 1500); }
      // Sync ke Google Sheets (background)
      syncToGS('upsert_wfb', payload);
    } else {
      console.warn('saveWFBRow HTTP', res.status, await res.text());
    }
  } catch(e){ console.warn('saveWFBRow error:', e); }
}

async function loadWFBData(year, bulan){
  if(!currentUser || !currentUser.id) return;
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/wfb_timecards?user_id=eq.${currentUser.id}&tahun=eq.${year}&bulan=eq.${bulan}&select=*`,
      { headers: sbHeaders() }
    );
    if(!res.ok) return;
    const rows = await res.json();
    rows.forEach(r => {
      const d = r.hari;
      const setVal = (selector, val) => {
        const el = document.querySelector(`${selector}[data-day="${d}"]`);
        if(el && val) el.value = val;
      };
      setVal('.wfb-masuk',  r.masuk1);
      setVal('.wfb-keluar', r.keluar1);
      setVal('[data-field="masuk2"]',  r.masuk2);
      setVal('[data-field="keluar2"]', r.keluar2);
      setVal('[data-field="kenyataan"]',   r.kenyataan);
      setVal('[data-field="tandatangan"]', r.tandatangan);
      // Re-apply time highlighting
      const masukEl = document.querySelector(`.wfb-masuk[data-day="${d}"]`);
      if(masukEl && masukEl.value) checkWFBTime(masukEl, 'masuk');
      const keluarEl = document.querySelector(`.wfb-keluar[data-day="${d}"]`);
      if(keluarEl && keluarEl.value) checkWFBTime(keluarEl, 'keluar');
    });
    // Fill header fields from first row
    if(rows.length > 0){
      const r = rows[0];
      if(r.nama)     { const el=document.getElementById('wfbNama');    if(el&&!el.value) el.value=r.nama; }
      if(r.kem_jab)  { const el=document.getElementById('wfbKem');     if(el&&!el.value) el.value=r.kem_jab; }
      if(r.bahagian) { const el=document.getElementById('wfbBahagian');if(el&&!el.value) el.value=r.bahagian; }
    }
  } catch(e){ console.warn('loadWFBData error:', e); }
}

function checkWFBTime(input,type){
  if(!input.value)return;
  const[h,m]=input.value.split(':').map(Number);
  input.classList.remove('highlight-late','highlight-ot');
  const row=input.closest('tr');row.classList.remove('late','ot');
  if(type==='masuk'){
    if(h*60+m>9*60){input.classList.add('highlight-late');row.classList.add('late');}
    if(h*60+m<7*60){input.classList.add('highlight-ot');row.classList.add('ot');}
  }else if(type==='keluar'){
    if(h*60+m>18*60){input.classList.add('highlight-ot');row.classList.add('ot');}
  }
}

function calcOdo(){
  const a=parseFloat(document.getElementById('tl-odomula').value)||0;
  const b=parseFloat(document.getElementById('tl-odoakhir').value)||0;
  const dist=Math.max(0,b-a);
  document.getElementById('tl-jarak').value=dist;
  document.getElementById('tl-kos').value=(dist*FUEL_RATE/10).toFixed(2);
}
function calcFuelCost(){
  const lit=parseFloat(document.getElementById('tl-liter').value)||0;
  document.getElementById('tl-kos').value=(lit*FUEL_RATE).toFixed(2);
}

function openTravelModal(){document.getElementById('travelModal').classList.add('open');}
function closeModal(id){
  playSound('click');
  document.getElementById(id).classList.remove('open');
}

async function saveTravelLog(){
  const rec={
    tarikh:document.getElementById('tl-tarikh').value,
    masapergi:document.getElementById('tl-masapergi').value,
    masabalik:document.getElementById('tl-masabalik').value,
    pemandu:document.getElementById('tl-pemandu').value,
    tujuan:document.getElementById('tl-tujuan').value,
    pelulus:document.getElementById('tl-pelulus').value,
    pengguna:document.getElementById('tl-pengguna').value||(currentUser?currentUser.name:''),
    odomula:parseFloat(document.getElementById('tl-odomula').value)||0,
    odoakhir:parseFloat(document.getElementById('tl-odoakhir').value)||0,
    jarak:parseFloat(document.getElementById('tl-jarak').value)||0,
    liter:parseFloat(document.getElementById('tl-liter').value)||0,
    kos:parseFloat(document.getElementById('tl-kos').value)||0,
    resit:document.getElementById('tl-resit').value,
    nota:document.getElementById('tl-nota').value
  };
  if(!rec.tarikh){ showToast('Sila isi tarikh'); return; }
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/travel_logs`, {
      method: 'POST',
      headers: sbHeaders(),
      body: JSON.stringify(travelToDb(rec))
    });
    if(!res.ok){ const err=await res.text(); console.error('saveTravelLog:', err); showToast('Gagal simpan: '+err); return; }
    const [saved] = await res.json();
    rec._id = saved.id;
    rec.jarak = parseFloat(saved.jarak_km) || rec.jarak;
    travelData.unshift(rec);
    renderTravelTable(); updateStats(); closeModal('travelModal');
    showToast('Log perjalanan disimpan âœ“');
    // Sync ke Google Sheets (background)
    syncToGS('insert_travel', { ...travelToDb(rec), id: rec._id });
  } catch(e){ console.error('saveTravelLog error:', e); showToast('Ralat simpan data'); }
}

function renderTravelTable(){
  const tbody=document.getElementById('travelBody');
  let totalKM=0,totalKos=0,totalL=0,totalTrips=travelData.length;
  tbody.innerHTML=travelData.map((r,i)=>{
    totalKM+=r.jarak;totalKos+=r.kos;totalL+=r.liter;
    return `<tr><td>${i+1}</td><td>${r.tarikh||'-'}</td><td>${r.masapergi||'-'}</td><td>${r.masabalik||'-'}</td><td>${r.pemandu||'-'}</td><td style="max-width:150px;white-space:normal;">${r.tujuan||'-'}</td><td>${r.pelulus||'-'}</td><td>${r.odomula}</td><td>${r.odoakhir}</td><td><span class="badge badge-blue">${r.jarak} km</span></td><td>${r.liter} L</td><td><span class="badge badge-green">RM ${r.kos.toFixed(2)}</span></td><td>${r.resit||'-'}</td><td>${r.nota||'-'}</td><td><button class="btn btn-danger btn-sm" onclick="deleteTravelRow(${i})">Padam</button></td></tr>`;
  }).join('');
  document.getElementById('tlogFtKM').textContent=totalKM;
  document.getElementById('tlogFtL').textContent=totalL.toFixed(2);
  document.getElementById('tlogFtKos').textContent='RM '+totalKos.toFixed(2);
  document.getElementById('tlogTotalKM').textContent=totalKM;
  document.getElementById('tlogTotalKos').textContent='RM '+totalKos.toFixed(2);
  document.getElementById('tlogTotalTrips').textContent=totalTrips;
  document.getElementById('tlogTotalLiter').textContent=totalL.toFixed(2)+' L';
}
async function deleteTravelRow(i){
  const rec = travelData[i];
  if(rec && rec._id){
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/travel_logs?id=eq.${rec._id}`, {
        method: 'DELETE', headers: sbHeaders()
      });
      syncToGS('delete_travel', { id: rec._id });
    } catch(e){ console.warn('deleteTravelRow:', e); }
  }
  travelData.splice(i,1); renderTravelTable(); updateStats();
}

function calcEnfTotal(){
  const ids=['enf-rmek','enf-rmkdr','enf-rmpengangkut','enf-rmlain'];
  const total=ids.reduce((s,id)=>s+(parseFloat(document.getElementById(id).value)||0),0);
  document.getElementById('enf-rmnilai').value=total.toFixed(2);
}

function openEnfModal(){
  document.getElementById('enfModal').classList.add('open');
  ['enf-lembu','enf-kerbau','enf-kambing','enf-bebiri','enf-babi','enf-ayam','enf-klembu','enf-kkerbau','enf-kkambing','enf-kbabi','enf-kbabisb','enf-kayam','enf-pitik','enf-payam','enf-pbabi','enf-tin','enf-anjing','enf-kucing','enf-arnab','enf-burung','enf-hamster','enf-jkdr','enf-jpengangkut','enf-rmek','enf-rmkdr','enf-rmpengangkut','enf-rmlain'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='0';});
  document.getElementById('enf-rmnilai').value='0';
}

async function saveEnfData(){
  playSound('click');
  const g=id=>document.getElementById(id).value||'';
  const gn=id=>parseFloat(document.getElementById(id).value)||0;
  const rec={tahun:g('enf-tahun'),bulan:g('enf-bulan'),penguatkuasa:g('enf-penguatkuasa'),kategori:g('enf-kategori'),nopolis:g('enf-nopolis'),tarikh:g('enf-tarikh'),masa:g('enf-masa'),lokasi:g('enf-lokasi'),kesalahan:g('enf-kesalahan'),undang:g('enf-undang'),noip:g('enf-noip'),jenis:g('enf-jenis'),lembu:gn('enf-lembu'),kerbau:gn('enf-kerbau'),kambing:gn('enf-kambing'),bebiri:gn('enf-bebiri'),babi:gn('enf-babi'),ayam:gn('enf-ayam'),klembu:gn('enf-klembu'),kkerbau:gn('enf-kkerbau'),kkambing:gn('enf-kkambing'),kbabi:gn('enf-kbabi'),kbabisb:gn('enf-kbabisb'),kayam:gn('enf-kayam'),pitik:gn('enf-pitik'),payam:gn('enf-payam'),pbabi:gn('enf-pbabi'),tin:gn('enf-tin'),anjing:gn('enf-anjing'),kucing:gn('enf-kucing'),arnab:gn('enf-arnab'),burung:gn('enf-burung'),hamster:gn('enf-hamster'),lain:g('enf-lain'),jkdr:gn('enf-jkdr'),jpengangkut:gn('enf-jpengangkut'),rmek:gn('enf-rmek'),rmkdr:gn('enf-rmkdr'),rmpengangkut:gn('enf-rmpengangkut'),rmlain:gn('enf-rmlain'),rmnilai:gn('enf-rmnilai'),serahan:g('enf-serahan'),catatan:g('enf-catatan')};
  if(!rec.tarikh){ showToast('Sila isi tarikh kes'); return; }
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/enforcement_cases`, {
      method: 'POST',
      headers: sbHeaders(),
      body: JSON.stringify(enfToDb(rec))
    });
    if(!res.ok){ const err=await res.text(); console.error('saveEnfData:', err); showToast('Gagal simpan: '+err); return; }
    const [saved] = await res.json();
    rec._id = saved.id;
    rec.rmnilai = parseFloat(saved.rm_nilai_total) || rec.rmnilai;
    enfData.unshift(rec);
    const sel=document.getElementById('enfFilterBulan');
    if(rec.bulan&&![...sel.options].find(o=>o.value===rec.bulan)){const o=document.createElement('option');o.value=rec.bulan;o.textContent=rec.bulan;sel.appendChild(o);}
    renderEnfTable(enfData); updateStats(); closeModal('enfModal');
    showToast('Data kes disimpan âœ“');
    // Sync ke Google Sheets (background)
    syncToGS('insert_enforcement', { ...enfToDb(rec), id: rec._id });
  } catch(e){ console.error('saveEnfData error:', e); showToast('Ralat simpan data'); }
}

function renderEnfTable(data){
  const tbody=document.getElementById('enfBody');
  const totals={lembu:0,kerbau:0,kambing:0,bebiri:0,babi:0,ayam:0,klembu:0,kkerbau:0,kkambing:0,kbabi:0,kbabisb:0,kayam:0,pitik:0,payam:0,pbabi:0,tin:0,anjing:0,kucing:0,arnab:0,burung:0,hamster:0,lain:0,jkdr:0,jpengangkut:0,rmek:0,rmkdr:0,rmpengangkut:0,rmlain:0,rmnilai:0};
  tbody.innerHTML=data.map((r,i)=>{
    Object.keys(totals).forEach(k=>{if(typeof r[k]==='number')totals[k]+=r[k];});
    return `<tr><td>${i+1}</td><td>${r.tahun}</td><td>${r.bulan}</td><td>${r.penguatkuasa}</td><td><span class="badge badge-blue">${r.kategori}</span></td><td>${r.nopolis}</td><td>${r.tarikh}</td><td>${r.masa}</td><td style="max-width:120px;white-space:normal;">${r.lokasi}</td><td style="max-width:120px;white-space:normal;">${r.kesalahan}</td><td>${r.undang}</td><td>${r.noip}</td><td>${r.jenis}</td><td>${r.lembu}</td><td>${r.kerbau}</td><td>${r.kambing}</td><td>${r.bebiri}</td><td>${r.babi}</td><td>${r.ayam}</td><td>${r.klembu}</td><td>${r.kkerbau}</td><td>${r.kkambing}</td><td>${r.kbabi}</td><td>${r.kbabisb}</td><td>${r.kayam}</td><td>${r.pitik}</td><td>${r.payam}</td><td>${r.pbabi}</td><td>${r.tin}</td><td>${r.anjing}</td><td>${r.kucing}</td><td>${r.arnab}</td><td>${r.burung}</td><td>${r.hamster}</td><td>${r.lain}</td><td>${r.jkdr}</td><td>${r.jpengangkut}</td><td>RM${r.rmek.toFixed(2)}</td><td>RM${r.rmkdr.toFixed(2)}</td><td>RM${r.rmpengangkut.toFixed(2)}</td><td>RM${r.rmlain.toFixed(2)}</td><td><span class="badge badge-gold">RM${r.rmnilai.toFixed(2)}</span></td><td><span class="badge ${r.serahan==='Mahkamah'?'badge-red':r.serahan==='Dilepaskan'?'badge-green':'badge-blue'}">${r.serahan}</span></td><td>${r.catatan}</td><td><button class="btn btn-danger btn-sm" onclick="deleteEnfRow(${i})">Padam</button></td></tr>`;
  }).join('');
  const keys=['lembu','kerbau','kambing','bebiri','babi','ayam','klembu','kkerbau','kkambing','kbabi','kbabisb','kayam','pitik','payam','pbabi','tin','anjing','kucing','arnab','burung','hamster','lain','jkdr','jpengangkut'];
  keys.forEach(k=>{const el=document.getElementById('e-'+k);if(el)el.textContent=totals[k];});
  ['rmek','rmkdr','rmpengangkut','rmlain','rmnilai'].forEach(k=>{const el=document.getElementById('e-'+k);if(el)el.textContent='RM'+totals[k].toFixed(2);});
}

function filterEnf(){
  const q=document.getElementById('enfSearch').value.toLowerCase();
  const bulan=document.getElementById('enfFilterBulan').value;
  const filtered=enfData.filter(r=>{
    const match=!q||(r.penguatkuasa+r.lokasi+r.kesalahan+r.nopolis+r.kategori).toLowerCase().includes(q);
    const bulanMatch=!bulan||r.bulan===bulan;
    return match&&bulanMatch;
  });
  renderEnfTable(filtered);
}
async function deleteEnfRow(i){
  const rec = enfData[i];
  if(rec && rec._id){
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/enforcement_cases?id=eq.${rec._id}`, {
        method: 'DELETE', headers: sbHeaders()
      });
      syncToGS('delete_enforcement', { id: rec._id });
    } catch(e){ console.warn('deleteEnfRow:', e); }
  }
  enfData.splice(i,1); renderEnfTable(enfData); updateStats();
}

function updateStats(){
  const totalKes=enfData.length;
  const totalRampasan=enfData.reduce((s,r)=>s+r.rmnilai,0);
  const totalTrips=travelData.length;
  const totalKM=travelData.reduce((s,r)=>s+r.jarak,0);
  document.getElementById('statCases').textContent=totalKes;
  document.getElementById('statRampasan').textContent='RM '+totalRampasan.toFixed(0);
  document.getElementById('statTrips').textContent=totalTrips;
  document.getElementById('statKM').textContent=totalKM+' km';
  document.getElementById('sumTotalKes').textContent=totalKes;
  document.getElementById('sumNilaiRM').textContent='RM '+totalRampasan.toFixed(0);
  document.getElementById('sumPerjalanan').textContent=totalTrips;
  const allFiles=uploadedFiles.minyak.length+uploadedFiles.odo.length+uploadedFiles.kes.length;
  document.getElementById('sumFail').textContent=allFiles;
}

function renderCharts(){
  const chartTypes=[{label:'Lembu',v:Math.floor(Math.random()*20)+5,color:'#6C63FF'},{label:'Kerbau',v:Math.floor(Math.random()*10)+2,color:'#FF6584'},{label:'Kambing',v:Math.floor(Math.random()*15)+3,color:'#43E8D8'},{label:'Ayam',v:Math.floor(Math.random()*30)+10,color:'#FFD700'},{label:'Lain',v:Math.floor(Math.random()*8)+1,color:'#A78BFA'}];
  const maxV=Math.max(...chartTypes.map(c=>c.v));
  const makeChart=id=>{
    const el=document.getElementById(id);if(!el)return;
    el.innerHTML=chartTypes.map(c=>`<div class="chart-bar-wrap"><div class="chart-bar-val">${c.v}</div><div class="chart-bar" style="height:${(c.v/maxV)*140}px;background:${c.color};box-shadow:0 0 10px ${c.color}60;"></div><div class="chart-bar-label">${c.label}</div></div>`).join('');
  };
  makeChart('dashChart');makeChart('summaryChart');
}

function updateAnnDisplay(){
  const el=document.getElementById('annDisplay');if(el)el.textContent=announcement;
  const annText=document.getElementById('annText');if(annText)annText.textContent='ðŸ“¢ '+announcement;
  const currAnn=document.getElementById('currentAnn');if(currAnn)currAnn.textContent=announcement;
}

function saveAnnouncement(){
  playSound('click');
  const val=document.getElementById('newAnnText').value.trim();
  if(val){announcement=val;updateAnnDisplay();document.getElementById('newAnnText').value='';showToast('Pengumuman disimpan');}
}

function renderAdminPanel(){
  const users=[{name:'Ahmad Firdaus',email:'ahmad@jpvs.gov.my',role:'superadmin',initials:'AF'},{name:'Siti Norizan',email:'siti@jpvs.gov.my',role:'user',initials:'SN'},{name:'Mohd Hafiz',email:'hafiz@jpvs.gov.my',role:'user',initials:'MH'}];
  const colors=['#6C63FF','#FF6584','#43E8D8','#FFD700'];
  const makeUserRow=(u,i,canDelete)=>`<div class="user-row"><div class="user-avatar-sm" style="background:linear-gradient(135deg,${colors[i%colors.length]},${colors[(i+1)%colors.length]});">${u.initials}</div><div class="user-info"><div class="user-info-name">${u.name}</div><div class="user-info-email">${u.email}</div></div>${canDelete&&currentUser&&currentUser.role==='superadmin'?`<button class="btn btn-danger btn-sm" onclick="removeUser(${i})">Buang</button>`:''}</div>`;
  const adminUsers=users.filter(u=>u.role==='superadmin');
  const normalUsers=users.filter(u=>u.role==='user');
  document.getElementById('userListAdmin').innerHTML=normalUsers.map((u,i)=>makeUserRow(u,i,true)).join('');
  document.getElementById('superAdminList').innerHTML=adminUsers.map((u,i)=>makeUserRow(u,i,true)).join('');
}

// ========================================
// BASEROW REALTIME DATA MANAGEMENT
// ========================================
async function initBaserowSync(){
  if(!baserow){showToast('Baserow tidak dikonfig');return;}
  try{
    const data=await baserow.getTableData(BASEROW_TABLE_ID);
    if(data&&data.results){
      baserowData=data.results;
      renderBaserowTable();
      showToast('Data Baserow disinkron');
      startBaserowRealtimeListener();
    }
  }catch(e){console.error('Baserow init error:',e);}
}

function startBaserowRealtimeListener(){
  if(!baserow)return;
  baserowWebSocket=baserow.setupRealtimeListener(BASEROW_TABLE_ID,(msg)=>{
    if(msg.type==='row_create'){baserowData.push(msg.row);renderBaserowTable();playSound('click');}
    else if(msg.type==='row_update'){const idx=baserowData.findIndex(r=>r.id===msg.row.id);if(idx>=0){baserowData[idx]=msg.row;renderBaserowTable();}}
    else if(msg.type==='row_delete'){baserowData=baserowData.filter(r=>r.id!==msg.row_id);renderBaserowTable();}
  });
}

async function addBaserowRow(rowData){
  if(!baserow){showToast('Baserow tidak dikonfig');return;}
  const result=await baserow.createRow(BASEROW_TABLE_ID,rowData);
  if(result){showToast('Baris Baserow ditambah');initBaserowSync();}
  else{showToast('Gagal tambah baris Baserow');}
}

async function updateBaserowRow(rowId,rowData){
  if(!baserow){showToast('Baserow tidak dikonfig');return;}
  const result=await baserow.updateRow(BASEROW_TABLE_ID,rowId,rowData);
  if(result){showToast('Baris Baserow dikemas kini');initBaserowSync();}
  else{showToast('Gagal kemaskini baris Baserow');}
}

async function deleteBaserowRow(rowId){
  if(!baserow){showToast('Baserow tidak dikonfig');return;}
  const success=await baserow.deleteRow(BASEROW_TABLE_ID,rowId);
  if(success){showToast('Baris Baserow dipadam');initBaserowSync();}
  else{showToast('Gagal padam baris Baserow');}
}

function renderBaserowTable(){
  const container=document.getElementById('baserowTableContainer');
  if(!container)return;
  if(!baserowData.length){container.innerHTML='<div style="text-align:center;color:var(--muted);padding:2rem;">Tiada data Baserow</div>';return;}
  const cols=baserowData.length>0?Object.keys(baserowData[0]):[];
  let html='<table style="width:100%;border-collapse:collapse;font-family:var(--font-ui);"><thead><tr>';
  cols.forEach(col=>{html+=`<th style="border-bottom:1px solid rgba(108,99,255,0.3);padding:0.5rem;text-align:left;color:var(--accent);font-size:0.75rem;">${col}</th>`;});
  html+='<th style="border-bottom:1px solid rgba(108,99,255,0.3);padding:0.5rem;text-align:center;">Tindakan</th></tr></thead><tbody>';
  baserowData.forEach((row,i)=>{
    html+='<tr style="border-bottom:1px solid rgba(108,99,255,0.1);hover:background:rgba(108,99,255,0.05);">';
    cols.forEach(col=>{html+=`<td style="padding:0.6rem;font-size:0.85rem;color:var(--text);">${row[col]||'-'}</td>`;});
    html+=`<td style="text-align:center;"><button class="btn btn-danger btn-sm" onclick="deleteBaserowRow(${row.id})">Padam</button></td></tr>`;
  });
  html+='</tbody></table>';
  container.innerHTML=html;
}

function displayBaserowStats(){
  if(!baserowData.length)return;
  const statsEl=document.getElementById('baserowStats');
  if(!statsEl)return;
  statsEl.innerHTML=`<div class="stat-card"><div class="stat-number">${baserowData.length}</div><div class="stat-label">Jumlah Rekod Baserow</div></div>`;
}

function openAddUserModal(){showToast('Fungsi tambah pengguna â€” hubungkan ke Supabase Auth');}
function openAddAdminModal(){showToast('Fungsi tambah super admin â€” hubungkan ke Supabase Auth');}
function removeUser(i){showToast('Pengguna dibuang (demo)');}

function switchDataTab(tab,el){
  document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
  if(el)el.classList.add('active');
  ['uploads','summary','export'].forEach(t=>{const el=document.getElementById('dataTab-'+t);if(el)el.style.display=t===tab?'block':'none';});
}

function handleUpload(input,type){
  const files=Array.from(input.files);
  files.forEach(f=>{uploadedFiles[type].push({name:f.name,size:f.size,url:URL.createObjectURL(f),file:f});});
  const listEl=document.getElementById('upload'+type.charAt(0).toUpperCase()+type.slice(1)+'List');
  if(listEl){listEl.innerHTML=uploadedFiles[type].map((f,i)=>`<div style="display:flex;align-items:center;gap:0.5rem;padding:0.35rem 0;border-bottom:1px solid rgba(108,99,255,0.1);"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg><span style="font-family:var(--font-ui);font-size:0.78rem;flex:1;">${f.name}</span><span style="font-family:var(--font-ui);font-size:0.7rem;color:var(--muted);">${(f.size/1024).toFixed(0)}KB</span><a href="${f.url}" target="_blank" style="color:var(--accent);font-size:0.7rem;text-decoration:none;font-family:var(--font-ui);">Lihat</a></div>`).join('');}
  updateStats();
}

function exportWFB(fmt){
  const data=[['Nama',document.getElementById('wfbNama').value||''],['Kem/Jab',document.getElementById('wfbKem').value||''],['Bahagian',document.getElementById('wfbBahagian').value||''],['Bulan',document.getElementById('wfbBulan').value||'']];
  downloadData(data,fmt,'WFB_Timecard');
}

function exportTravel(fmt){downloadData(travelData.map((r,i)=>({BIL:i+1,...r})),fmt,'Log_Perjalanan');}
function exportEnf(fmt){downloadData(enfData.map((r,i)=>({BIL:i+1,...r})),fmt,'Data_Penguatkuasa');}
function exportAll(fmt){
  const all={travel:travelData,enforcement:enfData,files:uploadedFiles};
  downloadData([all],fmt,'JPVS_AllData');
}

function downloadData(data,fmt,filename){
  let content='',mime='text/plain',ext='.txt';
  if(fmt==='csv'||fmt==='excel'){
    if(!data.length){showToast('Tiada data untuk dieksport');return;}
    const keys=Object.keys(Array.isArray(data[0])?{a:1}:data[0]);
    content=Array.isArray(data[0])?data.map(r=>r.map(v=>`"${v}"`).join(',')).join('\n'):[keys.join(','),...data.map(r=>keys.map(k=>`"${r[k]}"`).join(','))].join('\n');
    mime='text/csv';ext='.csv';
  }else if(fmt==='json'){
    content=JSON.stringify(data,null,2);mime='application/json';ext='.json';
  }else{
    content=typeof data==='string'?data:JSON.stringify(data,null,2);
  }
  const blob=new Blob([content],{type:mime});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=filename+ext;a.click();
  showToast(`Eksport ${ext.toUpperCase()} berjaya`);
}

function showToast(msg){
  const t=document.createElement('div');
  t.style.cssText='position:fixed;bottom:2rem;right:2rem;background:var(--card);border:1px solid rgba(108,99,255,0.4);border-radius:12px;padding:0.75rem 1.5rem;font-family:var(--font-ui);font-size:0.85rem;color:var(--text);z-index:9999;box-shadow:0 8px 32px rgba(0,0,0,0.4);animation:sectionReveal 0.4s cubic-bezier(0.16,1,0.3,1);display:flex;align-items:center;gap:0.5rem;';
  t.innerHTML=`<span style="color:var(--accent);">âœ“</span> ${msg}`;
  document.body.appendChild(t);setTimeout(()=>t.remove(),3000);
}

function toggleProfileMenu(){
  if(!currentUser) return;
  showToast('Profil: '+currentUser.name+' ('+currentUser.role+')');
}

// â”€â”€â”€ SUPABASE DATA HELPERS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function sbHeaders(){
  // Read token from localStorage (set by inline supabase client)
  let token = '';
  try {
    const s = JSON.parse(localStorage.getItem('jpvs_session') || 'null');
    token = (s && s.access_token) ? s.access_token : '';
  } catch(e){}
  return {
    'apikey': SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
  };
}

// Map DB row â†’ local travelData object
function dbRowToTravel(r){
  return {
    _id: r.id,
    tarikh: r.tarikh || '',
    masapergi: r.masa_pergi || '',
    masabalik: r.masa_balik || '',
    pemandu: r.pemandu || '',
    tujuan: r.tujuan || '',
    pelulus: r.pelulus || '',
    pengguna: r.pengguna || '',
    odomula: parseFloat(r.odometer_mula) || 0,
    odoakhir: parseFloat(r.odometer_akhir) || 0,
    jarak: parseFloat(r.jarak_km) || 0,
    liter: parseFloat(r.liter) || 0,
    kos: parseFloat(r.kos_rm) || 0,
    resit: r.no_resit || '',
    nota: r.nota || ''
  };
}

// Map local travelData object â†’ DB columns
function travelToDb(rec){
  return {
    user_id: currentUser.id,
    tarikh: rec.tarikh || null,
    masa_pergi: rec.masapergi || null,
    masa_balik: rec.masabalik || null,
    pemandu: rec.pemandu,
    tujuan: rec.tujuan,
    pelulus: rec.pelulus,
    pengguna: rec.pengguna,
    odometer_mula: rec.odomula,
    odometer_akhir: rec.odoakhir,
    liter: rec.liter,
    kos_rm: rec.kos,
    no_resit: rec.resit,
    nota: rec.nota
  };
}

// Map DB row â†’ local enfData object
function dbRowToEnf(r){
  return {
    _id: r.id,
    tahun: r.tahun, bulan: r.bulan,
    penguatkuasa: r.penguatkuasa, kategori: r.kategori,
    nopolis: r.no_polis, tarikh: r.tarikh, masa: r.masa,
    lokasi: r.lokasi, kesalahan: r.kesalahan,
    undang: r.undang_undang, noip: r.no_ip, jenis: r.jenis_rampasan,
    lembu: r.lembu||0, kerbau: r.kerbau||0, kambing: r.kambing||0,
    bebiri: r.bebiri||0, babi: r.babi||0, ayam: r.ayam||0,
    klembu: r.k_lembu||0, kkerbau: r.k_kerbau||0, kkambing: r.k_kambing||0,
    kbabi: r.k_babi||0, kbabisb: r.k_babi_sb||0, kayam: r.k_ayam||0,
    pitik: r.pitik||0, payam: r.p_ayam||0, pbabi: r.p_babi||0,
    tin: r.tin||0, anjing: r.anjing||0, kucing: r.kucing||0,
    arnab: r.arnab||0, burung: r.burung||0, hamster: r.hamster||0,
    lain: r.lain_lain||'0',
    jkdr: r.jml_kenderaan||0, jpengangkut: r.jml_pengangkut||0,
    rmek: parseFloat(r.rm_ek)||0, rmkdr: parseFloat(r.rm_kdr)||0,
    rmpengangkut: parseFloat(r.rm_pengangkut)||0, rmlain: parseFloat(r.rm_lain)||0,
    rmnilai: parseFloat(r.rm_nilai_total)||0,
    serahan: r.serahan, catatan: r.catatan
  };
}

// Map local enfData object â†’ DB columns
function enfToDb(rec){
  return {
    user_id: currentUser.id,
    tahun: parseInt(rec.tahun)||new Date().getFullYear(),
    bulan: rec.bulan, penguatkuasa: rec.penguatkuasa,
    kategori: rec.kategori, no_polis: rec.nopolis,
    tarikh: rec.tarikh||null, masa: rec.masa||null,
    lokasi: rec.lokasi, kesalahan: rec.kesalahan,
    undang_undang: rec.undang, no_ip: rec.noip,
    jenis_rampasan: rec.jenis,
    lembu: rec.lembu, kerbau: rec.kerbau, kambing: rec.kambing,
    bebiri: rec.bebiri, babi: rec.babi, ayam: rec.ayam,
    k_lembu: rec.klembu, k_kerbau: rec.kkerbau, k_kambing: rec.kkambing,
    k_babi: rec.kbabi, k_babi_sb: rec.kbabisb, k_ayam: rec.kayam,
    pitik: rec.pitik, p_ayam: rec.payam, p_babi: rec.pbabi,
    tin: rec.tin, anjing: rec.anjing, kucing: rec.kucing,
    arnab: rec.arnab, burung: rec.burung, hamster: rec.hamster,
    lain_lain: String(rec.lain||'0'),
    jml_kenderaan: rec.jkdr, jml_pengangkut: rec.jpengangkut,
    rm_ek: rec.rmek, rm_kdr: rec.rmkdr,
    rm_pengangkut: rec.rmpengangkut, rm_lain: rec.rmlain,
    serahan: rec.serahan, catatan: rec.catatan
  };
}

// Load all data from Supabase for the logged-in user
async function loadUserData(){
  if(!currentUser || !currentUser.id){ renderTravelTable(); renderEnfTable([]); updateStats(); return; }
  showToast('Memuatkan data...');
  try {
    // Travel logs
    const tRes = await fetch(
      `${SUPABASE_URL}/rest/v1/travel_logs?user_id=eq.${currentUser.id}&order=tarikh.desc`,
      { headers: sbHeaders() }
    );
    if(tRes.ok){ travelData = (await tRes.json()).map(dbRowToTravel); }
    else { console.warn('travel_logs fetch:', await tRes.text()); travelData = []; }

    // Enforcement cases
    const eRes = await fetch(
      `${SUPABASE_URL}/rest/v1/enforcement_cases?user_id=eq.${currentUser.id}&order=tarikh.desc`,
      { headers: sbHeaders() }
    );
    if(eRes.ok){ enfData = (await eRes.json()).map(dbRowToEnf); }
    else { console.warn('enforcement_cases fetch:', await eRes.text()); enfData = []; }

    renderTravelTable();
    renderEnfTable(enfData);
    updateStats();

    // Populate bulan filter
    const bulanSel = document.getElementById('enfFilterBulan');
    if(bulanSel){
      enfData.forEach(r => {
        if(r.bulan && ![...bulanSel.options].find(o=>o.value===r.bulan)){
          const o = document.createElement('option'); o.value=r.bulan; o.textContent=r.bulan; bulanSel.appendChild(o);
        }
      });
    }
    showToast('Data berjaya dimuatkan');
  } catch(e){
    console.error('loadUserData error:', e);
    showToast('Gagal memuatkan data');
    travelData = []; enfData = [];
    renderTravelTable(); renderEnfTable([]); updateStats();
  }
}
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€


// INIT
initParticles();
setInterval(updateClock,1000);
updateClock();
if(isBaserowConfigured){initBaserowSync();}

// Always start on login screen â€” no auto-login
document.getElementById('appShell').style.display = 'none';
document.getElementById('loginScreen').style.display = 'flex';
document.getElementById('loginScreen').style.opacity = '1';

// supabase is always available â€” register auth state listener
supabase.auth.onAuthStateChange(async (event, session) => {
  if((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session && session.user){
    if(isLoggedIn) return;

    // Step 1: upsert profile (non-blocking)
    upsertUser(session.user, session.access_token);

    // Step 2: fetch role from DB
    const dbRole = await fetchUserRole(session.user.id, session.access_token);

    // Step 3: build user and show app
    buildCurrentUser(session.user, dbRole);
    doLoginSuccess();

  } else if(event === 'SIGNED_OUT'){
    isLoggedIn = false;
    currentUser = null;
    document.getElementById('appShell').style.display = 'none';
    document.getElementById('loginScreen').style.display = 'flex';
    document.getElementById('loginScreen').style.opacity = '1';
  }
});
