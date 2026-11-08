import {reconcile} from './sync.js';

const root = '/api/google/';
const callback = root+'callback';
const oauth = 'https://oauth2.googleapis.com';
const scopes = {
  calendar:'https://www.googleapis.com/auth/calendar.app.created',
  sheets:'https://www.googleapis.com/auth/drive.file'
};
const cookie = '__Host-tipi_google';
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const b64 = bytes => btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
const un64 = s => Uint8Array.from(atob(s.replaceAll('-','+').replaceAll('_','/')),c => c.charCodeAt(0));
const random = size => b64(crypto.getRandomValues(new Uint8Array(size)));
const json = (value,status=200) => Response.json(value,{status,headers:{'Cache-Control':'no-store'}});
const cookieValue = (value,age) => cookie+'='+value+'; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age='+age;
const empty = {bookings:[],transactions:[]};

function configured(e) {
  return Boolean(e.TIPI_ORIGIN && e.TIPI_SUPABASE_URL && e.TIPI_SUPABASE_PUBLISHABLE_KEY
    && e.TIPI_SUPABASE_SERVER_KEY && e.GOOGLE_CLIENT_ID && e.GOOGLE_CLIENT_SECRET
    && /^[a-f0-9]{64}$/i.test(e.TIPI_GOOGLE_ENCRYPTION_KEY || ''));
}

async function key(e) {
  return crypto.subtle.importKey('raw',Uint8Array.from(e.TIPI_GOOGLE_ENCRYPTION_KEY.match(/../g),h => parseInt(h,16)),
    'AES-GCM',false,['encrypt','decrypt']);
}
async function seal(e,value,purpose) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:encoder.encode(purpose)},await key(e),encoder.encode(JSON.stringify(value)));
  return b64(iv)+'.'+b64(new Uint8Array(data));
}
async function unseal(e,value,purpose) {
  const [iv,data] = value.split('.').map(un64);
  const clear = await crypto.subtle.decrypt({name:'AES-GCM',iv,additionalData:encoder.encode(purpose)},await key(e),data);
  return JSON.parse(decoder.decode(clear));
}

async function request(url,options={}) {
  const response = await fetch(url,{...options,signal:options.signal || AbortSignal.timeout(12000)});
  if (!response.ok) {
    const error = new Error('upstream-failed');
    error.status = response.status;
    const payload = await response.json().catch(() => null);
    if (payload?.error === 'invalid_grant') error.reconnect = true;
    if (payload?.error?.details?.some?.(item => item.reason === 'SERVICE_DISABLED')) error.disabled = true;
    throw error;
  }
  return response.status === 204 ? null : response.json();
}
function db(e,path,{method='GET',body,user}={}) {
  const apiKey = user ? e.TIPI_SUPABASE_PUBLISHABLE_KEY : e.TIPI_SUPABASE_SERVER_KEY;
  const headers = {apikey:apiKey,'Content-Type':'application/json'};
  if (user || !apiKey.startsWith('sb_secret_')) headers.Authorization = user || 'Bearer '+apiKey;
  if (method === 'PATCH') headers.Prefer = 'return=representation';
  return request(e.TIPI_SUPABASE_URL+'/rest/v1/'+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
}
const rpc = (e,name,body,user) => db(e,'rpc/'+name,{method:'POST',body,user});
const idFilter = id => encodeURIComponent(id);
const cfgPath = id => 'tipi_google?workspace_id=eq.'+idFilter(id);

async function withLock(e,workspace,action) {
  const lease = crypto.randomUUID();
  if (!await rpc(e,'tipi_google_lock',{p_workspace:workspace,p_lease:lease})) return false;
  const path = cfgPath(workspace)+'&lease=eq.'+lease;
  let cfg;
  try {
    const [row] = await db(e,path+'&select=config');
    if (!row) throw new Error('missing-lease');
    cfg = row.config;
    const checkpoint = async () => {
      const rows = await db(e,path,{method:'PATCH',body:{config:cfg}});
      if (rows.length !== 1) throw new Error('lost-lease');
    };
    await action(cfg,checkpoint);
  } finally {
    await db(e,path,{method:'PATCH',body:{...(cfg?{config:cfg}:{}),lease:null,lease_until:null}});
  }
  return true;
}
function token(e,params) {
  return request(oauth+'/token',{method:'POST',body:new URLSearchParams({
    ...params,client_id:e.GOOGLE_CLIENT_ID,client_secret:e.GOOGLE_CLIENT_SECRET
  })});
}
function google(access,signal) {
  return async (url,method='GET',body) => {
    try {
      return await request(url,{method,signal,headers:{
        Authorization:'Bearer '+access,'Content-Type':'application/json'
      },body:body===undefined?undefined:JSON.stringify(body)});
    } catch (error) {
      error.service = url.includes('/calendar/v3/') ? 'calendar'
        : url.includes('/drive/v3/') ? 'drive' : 'sheets';
      throw error;
    }
  };
}
function note(error) {
  if (error.reconnect) return 'reconnect';
  if (error.message === 'calendar-create-uncertain' || error.message === 'duplicate-month') return error.message;
  if (error.service) return error.service+'-'+(error.disabled?'disabled':error.status || 'failed');
  return error.status ? 'google-'+error.status : 'sync-failed';
}
async function snapshot(e,id) {
  const [row] = await db(e,'tipi_state?owner_id=eq.'+idFilter(id)+'&select=data,revision');
  return row || {data:empty,revision:0};
}

async function sync(e,workspace,force=false) {
  let outcome = 'idle';
  const locked = await withLock(e,workspace,async (cfg,checkpoint) => {
    if (!cfg.token) { outcome = 'disconnected'; return; }
    if (cfg.error==='reconnect' && !force) return;
    const input = await snapshot(e,workspace);
    const upToDate = (!cfg.calendar || cfg.calendarRevision===input.revision)
      && (!cfg.sheets || cfg.sheetsRevision===input.revision);
    if (upToDate && force) {
      delete cfg.calendarRevision;
      delete cfg.sheetsRevision;
      for (const file of Object.values(cfg.files || {})) delete file.hash;
    }
    if ((!cfg.calendar || cfg.calendarRevision===input.revision) && (!cfg.sheets || cfg.sheetsRevision===input.revision)) return;
    try {
      const refresh = await unseal(e,cfg.token,workspace);
      const result = await token(e,{grant_type:'refresh_token',refresh_token:refresh});
      if (result.refresh_token) {
        cfg.token = await seal(e,result.refresh_token,workspace);
        await checkpoint();
      }
      const done = await reconcile(google(result.access_token,AbortSignal.timeout(90000)),cfg,workspace,input,checkpoint);
      cfg.error = null;
      if (done) cfg.lastSync = new Date().toISOString();
      outcome = done ? 'complete' : 'pending';
    } catch (error) {
      cfg.error = note(error);
      outcome = 'failed';
    }
  });
  return locked ? outcome : 'busy';
}

function redirect(e,result) {
  return new Response(null,{status:303,headers:{
    Location:e.TIPI_ORIGIN+'/?google='+result,'Set-Cookie':cookieValue('',0),'Cache-Control':'no-store','Referrer-Policy':'no-referrer'
  }});
}
async function finish(req,e,url) {
  try {
    if (url.searchParams.has('error')) return redirect(e,'denied');
    const cookieData = req.headers.get('Cookie')?.split('; ').find(s => s.startsWith(cookie+'='))?.slice(cookie.length+1);
    const state = await unseal(e,cookieData,'oauth');
    if (state.expires < Date.now() || state.state !== url.searchParams.get('state') || !url.searchParams.get('code')) return redirect(e,'expired');
    const owner = await rpc(e,'tipi_google_owner',{p_user:state.user});
    if (!owner || owner.workspace_id !== state.workspace) return redirect(e,'denied');
    const granted = await token(e,{grant_type:'authorization_code',code:url.searchParams.get('code'),
      code_verifier:state.verifier,redirect_uri:e.TIPI_ORIGIN+callback});
    const profile = await google(granted.access_token)('https://openidconnect.googleapis.com/v1/userinfo');
    if (!profile.email_verified || profile.email.toLowerCase() !== owner.email.toLowerCase()) return redirect(e,'wrong-account');
    const allow = new Set(granted.scope?.split(' ') || []);
    if (state.features.some(feature => !allow.has(scopes[feature])) || !granted.refresh_token) return redirect(e,'missing-permission');
    const ok = await withLock(e,state.workspace,async cfg => {
      if (cfg.subject && cfg.subject !== profile.sub) throw new Error('different-account');
      cfg.subject = profile.sub;
      cfg.email = profile.email;
      cfg.token = await seal(e,granted.refresh_token,state.workspace);
      cfg.calendar = state.features.includes('calendar');
      cfg.sheets = state.features.includes('sheets');
      cfg.error = null;
      delete cfg.calendarRevision;
      delete cfg.sheetsRevision;
    });
    return redirect(e,ok?'connected':'busy');
  } catch {
    return redirect(e,'failed');
  }
}

async function route(req,e,ctx,url) {
  if (url.origin !== e.TIPI_ORIGIN && e.TIPI_ORIGIN) return json({error:'URL không hợp lệ.'},403);
  if (url.pathname === callback && req.method === 'GET') {
    return configured(e) ? finish(req,e,url) : json({error:'Kết nối Google chưa được cấu hình.'},503);
  }
  if (!configured(e)) return json({error:'Kết nối Google chưa được cấu hình trên máy chủ.'},503);
  if (req.method !== 'POST') return json({error:'Phương thức không hợp lệ.'},405);
  const user = req.headers.get('Authorization');
  if (!user?.startsWith('Bearer ')) return json({error:'Hãy đăng nhập lại Tipi.'},401);
  const member = await rpc(e,'tipi_workspace',{},user);
  if (!member) return json({error:'Bạn không có quyền vào Tipi.'},403);
  const id = member.workspace_id;
  const action = url.pathname.slice(root.length);
  if (action === 'status') {
    const [row] = await db(e,cfgPath(id)+'&select=config,lease_until');
    const cfg = row?.config || {};
    const {revision} = await snapshot(e,id);
    const pending = Boolean(cfg.token && ((cfg.calendar && cfg.calendarRevision!==revision) || (cfg.sheets && cfg.sheetsRevision!==revision)));
    return json({
      email:cfg.token?cfg.email:null,calendar:Boolean(cfg.token && cfg.calendar),sheets:Boolean(cfg.token && cfg.sheets),
      error:cfg.token?cfg.error:null,lastSync:cfg.lastSync,pending,
      busy:Date.parse(row?.lease_until)>Date.now(),
      files:cfg.token && cfg.sheets ? Object.entries(cfg.files || {}).sort(([a],[b]) => b.localeCompare(a)).slice(0,12)
        .map(([month,file]) => ({month,id:file.id})) : []
    });
  }
  if (member.role !== 'owner') return json({error:'Chỉ chủ tiệm mới được quản lý kết nối Google.'},403);
  if (action === 'connect') {
    const {features} = await req.json();
    if (!Array.isArray(features) || !features.length || features.length>2 || features.some(f => !Object.hasOwn(scopes,f))) {
      return json({error:'Chọn Calendar hoặc Sheets để kết nối.'},400);
    }
    const profile = await request(e.TIPI_SUPABASE_URL+'/auth/v1/user',{
      headers:{apikey:e.TIPI_SUPABASE_PUBLISHABLE_KEY,Authorization:user}
    });
    const owner = await rpc(e,'tipi_google_owner',{p_user:profile.id});
    if (!owner || owner.workspace_id !== id) return json({error:'Tài khoản chủ tiệm chưa được xác minh.'},403);
    const verifier = random(32);
    const state = random(32);
    const challenge = b64(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(verifier))));
    const authorization = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authorization.search = new URLSearchParams({
      client_id:e.GOOGLE_CLIENT_ID,redirect_uri:e.TIPI_ORIGIN+callback,response_type:'code',
      scope:['openid','email',...features.map(f => scopes[f])].join(' '),state,code_challenge:challenge,
      code_challenge_method:'S256',access_type:'offline',prompt:'consent select_account',login_hint:owner.email
    });
    const data = await seal(e,{state,verifier,features,workspace:id,user:profile.id,expires:Date.now()+600000},'oauth');
    const response = json({url:authorization.href});
    response.headers.set('Set-Cookie',cookieValue(data,600));
    return response;
  }
  if (action === 'disconnect') {
    const ok = await withLock(e,id,async cfg => {
      if (!cfg.token) return;
      const refresh = await unseal(e,cfg.token,id);
      const result = await fetch(oauth+'/revoke',{method:'POST',body:new URLSearchParams({token:refresh}),signal:AbortSignal.timeout(12000)});
      if (!result.ok && result.status!==400) throw new Error('revoke-failed');
      delete cfg.token;
      delete cfg.error;
    });
    return ok ? json({ok}) : json({error:'Đang đồng bộ. Hãy thử lại sau.'},409);
  }
  if (action === 'retry') {
    const outcome = await sync(e,id,true);
    if (outcome === 'busy') return json({error:'Đang có lượt đồng bộ khác. Hãy thử lại sau.'},409);
    if (outcome === 'disconnected') return json({error:'Hãy kết nối Google trước.'},409);
    return json({outcome});
  }
  return json({error:'Không tìm thấy chức năng.'},404);
}

export default {
  async fetch(req,e,ctx) {
    const url = new URL(req.url);
    if (!url.pathname.startsWith(root)) return e.ASSETS.fetch(req);
    try {
      return await route(req,e,ctx,url);
    } catch (error) {
      if (error.status === 401) return json({error:'Phiên đăng nhập không hợp lệ.'},401);
      if (error.status === 403) return json({error:'Không đủ quyền thực hiện.'},403);
      return json({error:'Không thực hiện được thao tác Google. Hãy kiểm tra cấu hình hoặc thử lại.'},502);
    }
  },
  async scheduled(_event,e) {
    if (!configured(e)) return;
    try {
      const [row] = await db(e,'tipi_google?select=workspace_id&limit=1');
      if (row) await sync(e,row.workspace_id);
    } catch {
      throw new Error('Tipi cron could not access Supabase or save sync status');
    }
  }
};
