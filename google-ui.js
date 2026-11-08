const messages = {
  connected:'Đã kết nối Google. Đồng bộ sẽ bắt đầu trong ít phút.',
  denied:'Google chưa được cấp quyền kết nối.',
  expired:'Phiên kết nối đã hết hạn. Hãy thử lại.',
  'wrong-account':'Hãy chọn đúng tài khoản Google của chủ tiệm.',
  'missing-permission':'Thiếu quyền đồng bộ. Hãy kết nối lại và cấp đủ quyền đã chọn.',
  busy:'Đang đồng bộ. Hãy thử kết nối lại sau.',
  failed:'Chưa kết nối được Google. Hãy kiểm tra cấu hình rồi thử lại.'
};

function errorMessage(code) {
  const service = {calendar:'Google Calendar',drive:'Google Drive',sheets:'Google Sheets'};
  const match = /^(calendar|drive|sheets)-(disabled|\d{3}|failed)$/.exec(code);
  if (!match) return 'Đồng bộ gặp lỗi'+(/^google-\d{3}$/.test(code)?' ('+code.slice(7)+')':'')+'. Tipi sẽ thử lại.';
  const [,kind,reason] = match;
  const name = service[kind];
  if (reason === 'disabled') return name+' API chưa được bật trong Google Cloud. Bật API rồi thử lại.';
  if (reason === '403') return name+' từ chối quyền (403). Kiểm tra API đã bật và quyền Google đã cấp.';
  return name+' chưa đồng bộ được ('+reason+'). Tipi sẽ thử lại.';
}

export function setupGoogle(client,role) {
  document.querySelector('.tipi-google')?.remove();
  if (role === 'legacy') return;
  const owner = role === 'owner';
  const section = document.createElement('section');
  section.className = 'cloud-settings tipi-google';
  section.innerHTML = `<h3>Kết nối Google</h3>
    <p>Đồng bộ một chiều từ Tipi. Dữ liệu vẫn được lưu trong Tipi nếu Google chưa cập nhật.</p>
    <p role="status"></p><p data-google-info></p>
    ${owner?'<div class="cloud-actions"><label><input type="checkbox" value="calendar" checked> Google Calendar</label><label><input type="checkbox" value="sheets" checked> Google Sheets</label></div>':''}
    <div class="cloud-actions">
      ${owner?'<button type="button" class="outline-button" data-google="connect">Kết nối Google</button>':''}
      <button type="button" class="outline-button" data-google="status">Cập nhật trạng thái</button>
      ${owner?'<button type="button" class="outline-button" data-google="retry" hidden>Đồng bộ ngay</button><button type="button" class="outline-button" data-google="disconnect" hidden>Ngắt kết nối</button>':''}
    </div><div class="cloud-actions" data-google-files></div>`;
  document.querySelector('.settings-panel').append(section);
  const status = section.querySelector('[role=status]');
  const info = section.querySelector('[data-google-info]');
  const files = section.querySelector('[data-google-files]');
  const url = new URL(location.href);
  const result = url.searchParams.get('google');
  if (result) {
    url.searchParams.delete('google');
    history.replaceState(history.state,'',url);
    if (messages[result]) {
      document.querySelector('[data-view=settings]')?.click();
      status.textContent = messages[result];
    }
  }
  let running = false;
  let checked = false;
  async function call(action,body) {
    const {data:{session},error} = await client.auth.getSession();
    if (error || !session) throw new Error('Hãy đăng nhập lại Tipi.');
    const response = await fetch('/api/google/'+action,{method:'POST',headers:{
      Authorization:'Bearer '+session.access_token,'Content-Type':'application/json'
    },body:body?JSON.stringify(body):undefined});
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Kết nối Google chưa sẵn sàng.');
    return data;
  }
  async function refresh() {
    const data = await call('status');
    checked = true;
    const state = data.error==='reconnect'?'Cần kết nối lại Google.'
      : data.error==='calendar-create-uncertain'?'Chưa xác định được lịch Google đã tạo. Liên hệ quản trị để kiểm tra.'
      : data.error==='duplicate-month'?'Có nhiều file thu chi cùng tháng. Liên hệ quản trị để xử lý.'
      : data.error==='duplicate-folder'?'Có nhiều thư mục đồng bộ của Tipi trùng mã. Liên hệ quản trị để xử lý.'
      : data.error==='drive-create-uncertain'?'Chưa xác định được file hoặc thư mục đã tạo trên Drive. Tipi sẽ kiểm tra lại, không tạo bản trùng.'
      : data.error==='month-file-unavailable'?'File thu chi cũ đã vào thùng rác hoặc không còn thuộc Tipi. Không tạo file trùng.'
      : data.error?errorMessage(data.error)
      : data.busy?'Đang đồng bộ.' : data.pending?'Đang chờ đồng bộ.' : 'Đã đồng bộ.';
    info.textContent = data.email
      ? data.email+' · '+[data.calendar?'Calendar':'',data.sheets?'Sheets':''].filter(Boolean).join(' + ')+' · '+state
        +(data.lastSync?' Lần cuối: '+new Date(data.lastSync).toLocaleString('vi-VN')+'.':'')
      : 'Chưa kết nối Google.';
    files.replaceChildren();
    for (const file of data.files || []) {
      const link = document.createElement('a');
      link.href = 'https://docs.google.com/spreadsheets/d/'+encodeURIComponent(file.id)+'/edit';
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = 'Tipi - Thu chi '+file.month.slice(5)+'/'+file.month.slice(0,4);
      files.append(link);
    }
    if (owner) {
      section.querySelector('[data-google=connect]').textContent = data.email?'Kết nối lại Google':'Kết nối Google';
      section.querySelector('[data-google=retry]').hidden = !data.email;
      section.querySelector('[data-google=disconnect]').hidden = !data.email;
      if (data.email) for (const input of section.querySelectorAll('input')) input.checked = Boolean(data[input.value]);
    }
  }
  async function run(action,{quiet=false}={}) {
    if (running) return;
    running = true;
    const buttons = section.querySelectorAll('button');
    buttons.forEach(b => b.disabled=true);
    if (!quiet) status.textContent = 'Đang xử lý…';
    try {
      if (action === 'connect') {
        const features = [...section.querySelectorAll('input:checked')].map(input => input.value);
        const {url} = await call(action,{features});
        location.assign(url);
        return;
      }
      const result = action === 'disconnect' || action === 'retry' ? await call(action) : null;
      await refresh();
      if (!quiet) status.textContent = action==='retry'?(result.outcome==='complete'?'Đã đồng bộ xong.'
        :result.outcome==='failed'?'Đồng bộ chưa thành công. Xem lỗi bên dưới.':'Còn dữ liệu chờ lượt đồng bộ tiếp theo.')
        : action==='disconnect'?'Đã ngắt kết nối. Lịch và file Google đã tạo vẫn được giữ.':'';
    } catch (error) {
      status.textContent = error.message;
    } finally {
      buttons.forEach(b => b.disabled=false);
      running = false;
    }
  }
  section.addEventListener('click',event => {
    const action = event.target.closest('[data-google]')?.dataset.google;
    if (!action) return;
    if (action==='disconnect' && !confirm('Ngắt kết nối Google? Các thay đổi mới sẽ không được đồng bộ.')) return;
    void run(action);
  });
  const observer = new IntersectionObserver(entries => {
    if (!section.isConnected) return observer.disconnect();
    if (entries.some(entry => entry.isIntersecting) && !checked) void run('status',{quiet:true});
  });
  observer.observe(section);
}
