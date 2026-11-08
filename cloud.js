import {createClient} from '@supabase/supabase-js';
import {strFromU8, strToU8, unzipSync, zipSync} from 'fflate';
import {cloudStore, emptySnapshot, validateSnapshot} from './cloud-data.js';

const client = createClient(TIPI_SUPABASE_URL,TIPI_SUPABASE_PUBLISHABLE_KEY,{auth:{flowType:'pkce'}});
const app = window.tipiApp;
const gate = document.querySelector('#cloudGate');
const pageUrl = new URL(location.pathname,location.origin).href;
const limit = 100*1024*1024;
let recovery = false;
let loaded = false;

function showGate() {
  delete document.documentElement.dataset.cloudReady;
  gate.hidden = false;
  window.tipiCloud = null;
  loaded = false;
}

function gateMessage(message) {
  gate.querySelector('[role=status]').textContent = message;
}

function authScreen(mode='login', message='') {
  showGate();
  const titles = {login:'Đăng nhập',signup:'Tạo tài khoản',forgot:'Gửi email đặt lại mật khẩu',reset:'Lưu mật khẩu mới'};
  const isLogin = mode === 'login';
  gate.innerHTML = `<div class="panel cloud-card">
    <p class="eyebrow rose">NAIL & MAKEUP</p><h1>Tipi</h1>
    <h2>${titles[mode]}</h2>
    <form class="form-grid">
      ${mode==='reset'?'':'<label class="wide">Email<input type="email" name="email" autocomplete="email" required></label>'}
      ${mode==='forgot'?'':`<label class="wide">Mật khẩu<input type="password" name="password" autocomplete="${isLogin?'current-password':'new-password'}" required ${isLogin?'':'minlength="8"'}></label>`}
      <button class="primary-button wide" type="submit">${titles[mode]}</button>
    </form>
    ${isLogin?'<button class="outline-button cloud-google" type="button">Đăng nhập bằng Google</button>':''}
    <p class="cloud-status" role="status"></p>
    <div class="cloud-actions">
      ${isLogin?'<button type="button" class="text-button" data-auth-mode="signup">Tạo tài khoản</button><button type="button" class="text-button" data-auth-mode="forgot">Quên mật khẩu</button>':'<button type="button" class="text-button" data-auth-mode="login">Quay về đăng nhập</button>'}
    </div>
  </div>`;
  gateMessage(message);
  const form = gate.querySelector('form');
  const google = gate.querySelector('.cloud-google');
  gate.querySelectorAll('[data-auth-mode]').forEach(button => {
    button.onclick = () => authScreen(button.dataset.authMode);
  });
  form.onsubmit = event => {
    event.preventDefault();
    const {email,password} = Object.fromEntries(new FormData(form));
    runAuthAction(async () => {
      if (mode==='login') {
        const {data,error} = await client.auth.signInWithPassword({email,password});
        if (error) throw error;
        await openWorkspace(data.session);
      } else if (mode==='signup') {
        const {data,error} = await client.auth.signUp({email,password,options:{emailRedirectTo:pageUrl}});
        if (error) throw error;
        if (data.session) await openWorkspace(data.session);
        else authScreen('login','Kiểm tra hộp thư để xác nhận tài khoản.');
      } else if (mode==='forgot') {
        const {error} = await client.auth.resetPasswordForEmail(email,{redirectTo:pageUrl+'?recovery=1'});
        if (error) throw error;
        authScreen('login','Kiểm tra hộp thư để đặt lại mật khẩu.');
      } else {
        const {error} = await client.auth.updateUser({password});
        if (error) throw error;
        location.replace(pageUrl);
      }
    });
  };
  if (google) google.onclick = () => runAuthAction(async () => {
    const {error} = await client.auth.signInWithOAuth({provider:'google',options:{redirectTo:pageUrl}});
    if (error) throw error;
  });
}

async function runAuthAction(action) {
  const buttons = [...gate.querySelectorAll('button')];
  buttons.forEach(button => button.disabled=true);
  gateMessage('Đang xử lý…');
  try {await action();}
  catch (error) {gateMessage(error.message || 'Không thể đăng nhập. Hãy thử lại.');}
  finally {buttons.forEach(button => button.disabled=false);}
}

async function openWorkspace(session) {
  if (!session) return authScreen();
  const {data:owner,error} = await client.rpc('tipi_is_owner');
  if (error) throw new Error('Tipi chưa kết nối được với cấu hình database. Hãy áp dụng migration Supabase trước.');
  if (!owner) {
    await client.auth.signOut({scope:'local'});
    return authScreen('login','Tài khoản này chưa được cấp quyền chủ tiệm Tipi.');
  }
  const store = cloudStore(client,session.user.id);
  app.load(await store.load());
  window.tipiCloud = store;
  setupSettings(session.user.email);
  loaded = true;
  document.documentElement.dataset.cloudReady = 'true';
  gate.hidden = true;
}

async function checksum(bytes) {
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256',bytes));
  return [...hash].map(byte => byte.toString(16).padStart(2,'0')).join('');
}

async function downloadBackup(data) {
  const date = new Date().toISOString();
  const payload = strToU8(JSON.stringify({format:'tipi-backup',version:1,createdAt:date,data}));
  if (payload.byteLength > limit) throw new Error('Bản sao lưu vượt quá 100 MB.');
  const zip = zipSync({'tipi.json':payload,'sha256.txt':strToU8(await checksum(payload))});
  const url = URL.createObjectURL(new Blob([zip],{type:'application/zip'}));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'tipi-'+date.replaceAll(':','-')+'.zip';
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url),30000);
}

async function readBackup(file) {
  if (file.size > limit) throw new Error('File sao lưu vượt quá 100 MB.');
  if (file.name.toLowerCase().endsWith('.json')) {
    const transfer = JSON.parse(await file.text());
    if (transfer.format!=='tipi-transfer' || transfer.version!==1) {
      throw new Error('File này không phải dữ liệu xuất từ bản Tipi cũ.');
    }
    return validateSnapshot(transfer.data);
  }
  const files = unzipSync(new Uint8Array(await file.arrayBuffer()),{
    filter(entry) {
      return entry.name==='tipi.json' && entry.originalSize<=limit
        || entry.name==='sha256.txt' && entry.originalSize===64;
    }
  });
  const payload = files['tipi.json'];
  const hash = files['sha256.txt'];
  if (!payload || !hash || await checksum(payload) !== strFromU8(hash)) {
    throw new Error('File sao lưu thiếu dữ liệu hoặc đã bị hỏng.');
  }
  const backup = JSON.parse(strFromU8(payload));
  if (backup.format!=='tipi-backup' || backup.version!==1) throw new Error('Phiên bản sao lưu chưa được hỗ trợ.');
  return validateSnapshot(backup.data);
}

function legacyData() {
  const current = JSON.parse(localStorage.getItem('tipi-data'));
  if (current) return validateSnapshot(current);
  const bookings = JSON.parse(localStorage.getItem('luna-atelier-bookings'));
  const transactions = JSON.parse(localStorage.getItem('luna-atelier-transactions'));
  if (!bookings && !transactions) throw new Error('Trình duyệt tại địa chỉ này chưa có dữ liệu Tipi cũ.');
  return validateSnapshot({...emptySnapshot(),bookings:bookings||[],transactions:transactions||[]});
}

async function replaceData(data) {
  const current = app.snapshot();
  const currentVersion = JSON.stringify(current);
  const count = `${data.bookings.length} lịch hẹn và ${data.transactions.length} khoản thu chi`;
  if (!confirm('Khôi phục '+count+'? Dữ liệu và hồ sơ hiện tại sẽ được thay thế.')) return 'Đã bỏ qua khôi phục.';
  if (currentVersion!==JSON.stringify(emptySnapshot())) await downloadBackup(current);
  if (JSON.stringify(app.snapshot())!==currentVersion) {
    throw new Error('Dữ liệu đã thay đổi trong lúc chuẩn bị khôi phục. Hãy thử lại.');
  }
  if (!await app.restore(data)) throw new Error('Chưa khôi phục được dữ liệu. Hãy kiểm tra thông báo và thử lại.');
  return 'Đã khôi phục '+count+'.';
}

function setupSettings(email) {
  const panel = document.querySelector('.settings-panel');
  panel.querySelector('.cloud-settings')?.remove();
  panel.querySelector('#profileForm > p').textContent = 'Dữ liệu được lưu vào tài khoản Tipi trên Supabase.';
  panel.insertAdjacentHTML('beforeend',`<section class="cloud-settings">
    <h3>Tài khoản</h3><p class="cloud-email"></p>
    <div class="cloud-actions">
      <button type="button" class="outline-button" data-cloud="reload">Tải dữ liệu mới nhất</button>
      <button type="button" class="outline-button" data-cloud="logout">Đăng xuất</button>
    </div>
    <h3>Sao lưu và khôi phục</h3>
    <p>Tải file ZIP gồm lịch hẹn, thu chi, hồ sơ và ảnh mẫu. Xem trước số bản ghi trước khi khôi phục.</p>
    <div class="cloud-actions">
      <button type="button" class="outline-button" data-cloud="backup">Tải bản sao lưu</button>
      <button type="button" class="outline-button" data-cloud="restore">Khôi phục từ file</button>
      <button type="button" class="outline-button" data-cloud="legacy">Nhập dữ liệu cũ trên thiết bị</button>
    </div>
    <input type="file" accept=".zip,.json,application/zip,application/json" class="cloud-backup-file" hidden>
    <p role="status" class="cloud-status"></p>
  </section>`);
  const settings = panel.querySelector('.cloud-settings');
  settings.querySelector('.cloud-email').textContent = email || '';
  const status = settings.querySelector('[role=status]');
  const file = settings.querySelector('input[type=file]');
  const buttons = [...settings.querySelectorAll('button')];
  async function run(action) {
    buttons.forEach(button => button.disabled=true);
    status.textContent = 'Đang xử lý…';
    try {status.textContent = await action();}
    catch(error) {status.textContent = error.message || 'Không thực hiện được thao tác.';}
    finally {buttons.forEach(button => button.disabled=false);}
  }
  settings.querySelector('[data-cloud=reload]').onclick = () => location.reload();
  settings.querySelector('[data-cloud=logout]').onclick = () => run(async () => {
    const {error} = await client.auth.signOut({scope:'local'});
    if (error) throw error;
    location.replace(pageUrl);
    return 'Đã đăng xuất.';
  });
  settings.querySelector('[data-cloud=backup]').onclick = () => run(async () => {
    await downloadBackup(app.snapshot());
    return 'Đã tạo file sao lưu để tải xuống.';
  });
  settings.querySelector('[data-cloud=legacy]').onclick = () => run(() => replaceData(legacyData()));
  settings.querySelector('[data-cloud=restore]').onclick = () => file.click();
  file.onchange = () => {
    const selected = file.files[0];
    file.value = '';
    if (selected) run(async () => replaceData(await readBackup(selected)));
  };
}

client.auth.onAuthStateChange(event => {
  if (event==='PASSWORD_RECOVERY') recovery = true;
  if (event==='SIGNED_OUT' && loaded) {
    showGate();
    location.replace(pageUrl);
  }
});
try {
  const {data,error} = await client.auth.getSession();
  if (error) throw error;
  const reset = recovery || new URL(location.href).searchParams.has('recovery');
  if (reset && data.session) authScreen('reset');
  else await openWorkspace(data.session);
} catch (error) {
  authScreen('login',error.message);
}
