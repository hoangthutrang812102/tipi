const el = (s, p = document) => p.querySelector(s);
const els = (s, p = document) => [...p.querySelectorAll(s)];
const pad = n => String(n).padStart(2, '0');
const iso = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const parseDate = s => new Date(s + 'T12:00:00');
const addDays = (d, n) => { const r = new Date(d); r.setDate(r.getDate()+n); return r; };
const monday = d => addDays(d, -((d.getDay()+6)%7));
// Use the client's time zone consistently, including when opened on another device.
const TIME_ZONE = 'Asia/Ho_Chi_Minh';
const today = () => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {timeZone: TIME_ZONE, year:'numeric', month:'2-digit', day:'2-digit'}).formatToParts(new Date()).map(p => [p.type,p.value]));
  return parseDate(`${parts.year}-${parts.month}-${parts.day}`);
};
const fullDate = d => new Intl.DateTimeFormat('vi-VN', {weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(d);
const shortDate = d => new Intl.DateTimeFormat('vi-VN',{day:'2-digit',month:'2-digit',year:'numeric'}).format(d);
const money = n => new Intl.NumberFormat('vi-VN').format(n) + ' ₫';
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dayNames = ['CN','T2','T3','T4','T5','T6','T7'];
const services = {all:'Nail & Makeup',nail:'Nail',makeup:'Makeup',shared:'Chi phí chung'};
const contacts = {instagram:'Instagram',threads:'Threads',tiktok:'TikTok',zalo:'Zalo'};
const seedBookings = [
  {id:1,name:'Hà My',date:'2026-11-07',time:'09:00',duration:90,service:'nail',style:'Glazed donut',contact:'instagram',price:450000},
  {id:2,name:'Minh Anh',date:'2026-11-07',time:'11:00',duration:120,service:'nail',style:'French tip',contact:'zalo',price:650000},
  {id:3,name:'Ngọc Linh',date:'2026-11-07',time:'14:30',duration:90,service:'makeup',style:'Makeup dự tiệc',contact:'instagram',price:850000},
  {id:4,name:'Thuỳ Dương',date:'2026-11-08',time:'10:00',duration:90,service:'nail',style:'Đỏ cherry',contact:'threads',price:550000},
  {id:5,name:'Bảo Ngân',date:'2026-11-08',time:'13:30',duration:120,service:'makeup',style:'Soft glam',contact:'tiktok',price:900000},
  {id:6,name:'Khánh Vy',date:'2026-11-03',time:'10:30',duration:90,service:'nail',style:'Cat eye nude',contact:'instagram',price:500000},
  {id:7,name:'Tú Anh',date:'2026-11-05',time:'15:00',duration:90,service:'nail',style:'Pink aura',contact:'zalo',price:480000}
];
const seedTransactions = [
  {id:1,kind:'income',title:'Thanh toán - Hà My',amount:450000,date:'2026-11-06',note:'Glazed donut',service:'nail'},
  {id:2,kind:'expense',title:'Nhập sơn gel tháng 11',amount:1250000,date:'2026-11-05',note:'Nail supply',service:'nail'},
  {id:3,kind:'income',title:'Thanh toán - Minh Anh',amount:650000,date:'2026-11-04',note:'French tip',service:'nail'},
  {id:4,kind:'expense',title:'Tiền thuê mặt bằng',amount:3200000,date:'2026-11-01',note:'Chi phí cố định',service:'shared'}
];
let saved = null;
try {
  saved = JSON.parse(localStorage.getItem('tipi-data'));
  if (!saved) saved = {
    bookings: JSON.parse(localStorage.getItem('luna-atelier-bookings')) || seedBookings,
    transactions: JSON.parse(localStorage.getItem('luna-atelier-transactions')) || seedTransactions
  };
} catch { /* Storage may be unavailable; saves report errors explicitly. */ }
const state = {
  bookings: saved?.bookings || seedBookings,
  transactions: saved?.transactions || seedTransactions,
  profile: saved?.profile || {studio:'Tipi',owner:'Thu Phương',phone:'',address:'',avatar:''},
  view:'overview',workspace:'all',filter:'all',kind:'all',mode:'week',range:'week',
  date:today(),weekStart:monday(today()),service:'nail',financeKind:'income',
  editing:null,images:[],imageLoading:false,bookingSession:0,
  financeEditing:null,financeMonth:null,financePage:1,financeFilterKey:null
};
const matchesWorkspace = b => state.workspace === 'all' || b.service === state.workspace;
const visibleBookings = () => state.bookings.filter(b => !b.cancelledAt && matchesWorkspace(b));
const visibleTransactions = () => state.transactions.filter(t => state.workspace === 'all' || t.service === state.workspace);
const weekDates = () => Array.from({length:7},(_,i)=>addDays(state.weekStart,i));
const period = (d, range) => {
  if (range === 'week') { const start=monday(d); return [iso(start),iso(addDays(start,7))]; }
  if (range === 'month') return [iso(new Date(d.getFullYear(),d.getMonth(),1)),iso(new Date(d.getFullYear(),d.getMonth()+1,1))];
  return [iso(new Date(d.getFullYear(),0,1)),iso(new Date(d.getFullYear()+1,0,1))];
};
const within = (d, bounds) => d >= bounds[0] && d < bounds[1];
function snapshot() {
  return {bookings:state.bookings,transactions:state.transactions,profile:state.profile};
}
function persist(next, afterSave = () => {}) {
  const data = {...snapshot(),...next};
  const apply = () => {
    Object.assign(state,next);
    afterSave();
    return true;
  };
  const cloud = window.tipiCloud;
  if (cloud) {
    return cloud.save(data).then(() => window.tipiCloud === cloud && apply(), error => {
      toast(error.message);
      return false;
    });
  }
  if (document.documentElement.hasAttribute('data-cloud')) {
    toast('Hãy đăng nhập lại trước khi lưu.');
    return false;
  }
  try {
    localStorage.setItem('tipi-data',JSON.stringify(data));
  } catch { toast('Không lưu được: bộ nhớ trình duyệt đã đầy hoặc bị chặn. Hãy bớt ảnh rồi thử lại.'); return false; }
  return apply();
}
function toast(s) { el('#toast').textContent=s; el('#toast').classList.add('show'); setTimeout(()=>el('#toast').classList.remove('show'),4000); }
const modalStack = [];
function sizeDialogViewport() {
  const viewport=window.visualViewport;
  if (!viewport || !modalStack.length) return;
  document.documentElement.style.setProperty('--dialog-height',viewport.height+'px');
  document.documentElement.style.setProperty('--dialog-top',viewport.offsetTop+'px');
}
window.visualViewport?.addEventListener('resize',sizeDialogViewport);
window.visualViewport?.addEventListener('scroll',sizeDialogViewport);
function openModal(id) {
  const previous = modalStack.at(-1)?.node;
  if (previous) {
    previous.inert = true;
    previous.setAttribute('aria-hidden','true');
  }
  const node = el('#'+id);
  modalStack.push({node, returnFocus:document.activeElement});
  sizeDialogViewport();
  node.style.zIndex = 50 + modalStack.length;
  node.classList.add('open');
  node.setAttribute('aria-hidden','false');
  document.body.style.overflow='hidden';
  el('.app-shell').inert=true;
  document.dispatchEvent(new Event('tipi:dialog'));
  el('#'+id).querySelector('button,input,select')?.focus();
}
function closeModal(id) {
  const current = modalStack.at(-1);
  if (current?.node.id !== id) return;
  modalStack.pop();
  current.node.classList.remove('open');
  current.node.setAttribute('aria-hidden','true');
  if (id === 'imageModal') {
    imageViewer.sources = [];
    el('#imageStage').replaceChildren();
  }
  const previous = modalStack.at(-1)?.node;
  if (previous) {
    previous.inert = false;
    previous.setAttribute('aria-hidden','false');
  } else {
    document.body.style.overflow='';
    el('.app-shell').inert=false;
  }
  current.returnFocus?.focus();
  document.dispatchEvent(new Event('tipi:dialog'));
}
function modal(id,title,body) {
  document.body.insertAdjacentHTML('beforeend',`<div class="modal-backdrop" id="${id}" aria-hidden="true"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="${id}Title"><div class="modal-header"><h2 id="${id}Title">${title}</h2><button class="close-button" aria-label="Đóng" data-close-modal="${id}">×</button></div>${body}</section></div>`);
}
function initializeUI() {
  el('.studio-switcher').innerHTML='<label>Không gian làm việc<select id="workspace" aria-label="Không gian làm việc"><option value="all">Nail & Makeup</option><option value="nail">Nail</option><option value="makeup">Makeup</option></select></label>';
  el('.filter-button').outerHTML='<select id="serviceFilter" class="filter-button" aria-label="Lọc dịch vụ"><option value="all">Tất cả dịch vụ</option><option value="nail">Nail</option><option value="makeup">Makeup</option></select>';
  el('.calendar-nav').insertAdjacentHTML('beforeend','<input id="calendarDate" type="date" aria-label="Chọn ngày xem lịch">');
  els('.view-switch').forEach((b,i)=>b.dataset.mode=i?'day':'week');
  els('.transactions-panel .segmented button').forEach((b,i)=>b.dataset.kindFilter=['all','income','expense'][i]);
  el('#bookingForm [name=price]').min='0';
  el('#financeForm [name=amount]').min='1';
  el('#financeModal h2').id='financeModalTitle';
  el('#financeModal [role=dialog]').setAttribute('aria-labelledby','financeModalTitle');
  el('#financeModal .close-button').setAttribute('aria-label','Đóng');
  el('#bookingForm .form-grid').insertAdjacentHTML('beforeend',`<section class="wide booking-attachments" aria-labelledby="sampleTitle">
    <h3 id="sampleTitle">Ảnh mẫu khách chọn</h3>
    <div class="attachment-actions"><label class="outline-button" for="sampleUpload">Chọn ảnh</label><input id="sampleUpload" class="attachment-input" type="file" aria-label="Chọn ảnh mẫu" accept="image/jpeg,image/png,image/webp" multiple>
    <button class="outline-button" type="button" id="pasteSample">Dán ảnh</button></div>
    <small id="sampleHint">Bạn cũng có thể nhấn Cmd+V hoặc Ctrl+V. Tối đa 3 ảnh JPG, PNG hoặc WebP, 10 MB mỗi ảnh.</small>
    <p id="sampleStatus" class="attachment-status" role="status"></p><div id="imagePreview" class="image-gallery"></div>
  </section>`);
  el('#financeForm .form-grid').insertAdjacentHTML('beforeend','<label class="wide">Mảng dịch vụ<select name="service"><option value="nail">Nail</option><option value="makeup">Makeup</option><option value="shared">Chi phí chung / chưa phân loại</option></select></label>');
  el('.settings-panel').innerHTML='<form id="profileForm"><div class="settings-row"><div class="settings-avatar">T</div><h3>Hồ sơ tiệm</h3></div><div class="settings-form"><label>Tên tiệm<input name="studio" required></label><label>Chủ tiệm<input name="owner" required></label><label>Số điện thoại<input name="phone" type="tel"></label><label>Địa chỉ<input name="address"></label><label>Ảnh đại diện<input id="avatarUpload" type="file" accept="image/jpeg,image/png,image/webp"></label></div><div class="modal-footer"><button class="primary-button">Lưu thông tin</button></div><p>Dữ liệu lưu trên trình duyệt này, chưa đồng bộ giữa các thiết bị.</p></form>';
  el('.profile-card > div:nth-child(2)').outerHTML='<button class="profile-name" data-account><strong></strong><span>Chủ tiệm</span></button>';
  el('.profile-card button.icon-button').dataset.account='';
  el('.top-avatar').dataset.account=''; el('.top-avatar').setAttribute('aria-label','Hồ sơ Thu Phương');
  modal('detailModal','Chi tiết lịch hẹn','<div id="bookingDetail"></div>');
  modal('imageModal','Ảnh mẫu','<div id="imageStage" class="image-stage"></div><div class="image-controls"><button type="button" class="outline-button" data-image-step="-1" aria-label="Ảnh trước">‹</button><span id="imageCount" aria-live="polite"></span><button type="button" class="outline-button" data-image-step="1" aria-label="Ảnh tiếp theo">›</button></div>');
  el('.transactions-panel .segmented').insertAdjacentHTML('beforebegin','<select id="financeMonth" aria-label="Tháng thu chi"></select>');
  el('#transactionTable').insertAdjacentHTML('afterend','<nav id="transactionPagination" class="transaction-pagination" aria-label="Phân trang giao dịch" hidden><span id="transactionRange" role="status"></span><div class="transaction-page-controls"><button type="button" class="outline-button" data-finance-page="-1">Trước</button><span id="transactionPage" aria-live="polite"></span><button type="button" class="outline-button" data-finance-page="1">Sau</button></div></nav>');
  modal('accountModal','Hồ sơ chủ tiệm','<div id="accountInfo"></div><button class="primary-button" id="editProfile">Chỉnh sửa hồ sơ</button>');
  modal('notificationModal','Lịch ngày mai','<div id="notificationList"></div>');
  modal('cancelledBookingsModal','Lịch đã hủy','<div id="cancelledBookingsList"></div>');
  el('.calendar-tools').insertAdjacentHTML('beforeend','<button type="button" class="outline-button small" data-cancelled-bookings>Lịch đã hủy</button>');
  el('.week-panel').insertAdjacentHTML('beforeend','<button type="button" class="text-button" data-cancelled-bookings>Lịch đã hủy</button>');
}
function renderProfile() {
  const p=state.profile;
  document.title=p.studio+' | Nail & Makeup';
  el('.brand-block h1').textContent=p.studio;
  el('.brand-mark span').textContent=p.studio.slice(0,1);
  el('.profile-name strong').textContent=p.owner;
  el('#overviewView .page-heading h2').textContent='Xin chào, '+p.owner;
  for (const node of els('.avatar,.top-avatar,.settings-avatar')) {
    node.textContent=p.owner.split(' ').map(s=>s[0]).slice(-2).join('');
    if (safeImage(p.avatar)) node.innerHTML=`<img src="${p.avatar}" alt="Ảnh đại diện">`;
  }
  for (const key of ['studio','owner','phone','address','shopMessage']) el('#profileForm [name='+key+']').value=p[key]||'';
}
function renderDates() {
  el('#overviewView .page-heading .eyebrow').textContent=fullDate(today());
  el('.tomorrow-panel .eyebrow').textContent=fullDate(addDays(today(),1));
  el('.time-label').textContent='GMT+7';
  const labels={overview:'Tổng quan',calendar:'Lịch hẹn',finance:'Thu & chi',settings:'Cài đặt'};
  el('#breadcrumbMain').textContent=labels[state.view];
  el('#breadcrumbSub').textContent=fullDate(today());
}
function bookingButton(b, cls='event-chip', style='') {
  const dateLabel = b.cancelledAt ? shortDate(parseDate(b.date))+' · ' : '';
  return `<button class="${cls} ${b.service==='makeup'?'makeup':''}" data-booking="${esc(b.id)}" style="${style}"><strong>${esc(dateLabel+b.time)} · ${esc(b.name)}</strong><span>${esc(services[b.service])} · ${esc(b.style||'Chưa chọn mẫu')}</span></button>`;
}
function renderWeek() {
  const dates=weekDates();
  el('#weekLabel').textContent=shortDate(dates[0])+' – '+shortDate(dates[6]);
  el('#weekStrip').innerHTML=dates.map(d=>`<button class="week-day ${iso(d)===iso(today())?'current':''}" data-day="${iso(d)}">${dayNames[d.getDay()]}<strong>${d.getDate()}</strong></button>`).join('');
  el('#weekEvents').innerHTML=dates.map(d=> {
    const items=visibleBookings().filter(b=>b.date===iso(d)).sort((a,b)=>a.time.localeCompare(b.time));
    return '<div class="day-events">'+(items.length?items.map(b=>bookingButton(b)).join(''):'<div class="empty-day">Trống</div>')+'</div>';
  }).join('');
}
function tomorrowItems() { return visibleBookings().filter(b=>b.date===iso(addDays(today(),1))).sort((a,b)=>a.time.localeCompare(b.time)); }
function renderTomorrow() {
  const items=tomorrowItems();
  el('#tomorrowCount').textContent=items.length;
  const html=items.map(b=>bookingButton(b,'agenda-item')).join('')||'<p>Chưa có lịch ngày mai.</p>';
  el('#tomorrowAgenda').innerHTML=html; el('#notificationList').innerHTML=html;
  el('.mini-avatars').innerHTML=items.slice(0,3).map(b=>'<span>'+esc(b.name[0])+'</span>').join('');
  el('.notification i').hidden=items.length===0;
}
function renderCalendar() {
  const dates=state.mode==='day'?[state.date]:weekDates();
  el('#calendarTitle').textContent=state.mode==='day'?fullDate(state.date):shortDate(dates[0])+' – '+shortDate(dates[6]);
  el('#calendarDate').value=iso(state.date);
  els('.view-switch').forEach(b=>{ b.classList.toggle('selected',b.dataset.mode===state.mode); b.setAttribute('aria-pressed',b.dataset.mode===state.mode); });
  el('.calendar-grid').classList.toggle('day-mode',state.mode==='day');
  for (const id of ['calendarDays','calendarSlots']) el('#'+id).style.gridTemplateColumns=`repeat(${dates.length},minmax(0,1fr))`;
  el('#calendarDays').innerHTML=dates.map(d=>`<button class="cal-head-day ${iso(d)===iso(today())?'current':''}" data-day="${iso(d)}">${dayNames[d.getDay()]}<strong>${d.getDate()}</strong></button>`).join('');
  const items=visibleBookings().filter(b=>(state.filter==='all'||b.service===state.filter)&&dates.some(d=>iso(d)===b.date));
  const minutes=t=>Number(t.slice(0,2))*60+Number(t.slice(3));
  const start=Math.min(8,...items.map(b=>Math.floor(minutes(b.time)/60)));
  const end=Math.max(20,...items.map(b=>Math.ceil((minutes(b.time)+Number(b.duration))/60)));
  el('#timeColumn').innerHTML=Array.from({length:end-start},(_,i)=>`<div class="time-slot">${pad(start+i)}:00</div>`).join('');
  el('.calendar-body').style.height=(end-start)*60+'px';
  el('#calendarSlots').innerHTML=dates.map(d=>{
    const bookings=items.filter(b=>b.date===iso(d)).sort((a,b)=>a.time.localeCompare(b.time));
    // Connected overlap groups share columns so simultaneous bookings stay clickable.
    let group=[], groupEnd=0; const groups=[];
    for (const b of bookings) {
      const begin=minutes(b.time),finish=begin+Number(b.duration);
      if(group.length && begin>=groupEnd) { groups.push(group); group=[]; }
      group.push(b); groupEnd=Math.max(group.length===1?0:groupEnd,finish);
    }
    if(group.length) groups.push(group);
    const html=groups.map(g=>g.map((b,i)=>bookingButton(b,'calendar-event',`top:${minutes(b.time)-start*60}px;height:${Number(b.duration)-4}px;left:calc(${i*100/g.length}% + 3px);width:calc(${100/g.length}% - 6px)`)).join('')).join('');
    const date = iso(d);
    const slots = Array.from({length:end-start}, (_, i) => {
      const time = pad(start+i)+':00';
      return `<button type="button" class="calendar-add-slot" data-slot-date="${date}" data-slot-time="${time}" aria-label="Thêm lịch lúc ${time}, ${shortDate(d)}"><span aria-hidden="true">+ ${time}</span></button>`;
    }).join('');
    return `<div class="calendar-day-column">${slots}${html}</div>`;
  }).join('');
}
const transactionIcons = {
  edit:'<path d="m13.5 6.5 4 4M4 20l4-.8L19 8a2.8 2.8 0 0 0-4-4L4.8 15.2 4 20Z"/>',
  delete:'<path d="M4 7h16M9 7V4h6v3m3 0-1 13H7L6 7m4 4v5m4-5v5"/>'
};
const transactionIcon = key => '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+transactionIcons[key]+'</svg>';
const financePageSize=20;
function renderFinance(focusTransaction=null) {
  const current=iso(today()).slice(0,7), month=state.financeMonth || current;
  const filterKey=JSON.stringify([month,state.workspace,state.kind]);
  if (filterKey!==state.financeFilterKey) {
    state.financePage=1;
    state.financeFilterKey=filterKey;
  }
  const options=[...new Set([current,month,...state.transactions.map(t=>t.date.slice(0,7))])].sort().reverse();
  const picker=el('#financeMonth');
  picker.replaceChildren(...options.map(value=>new Option('Tháng '+value.slice(5)+'/'+value.slice(0,4),value)));
  picker.value=month;
  el('.transactions-panel .eyebrow').textContent='Tháng '+month.slice(5)+'/'+month.slice(0,4);
  els('.finance-card.income small,.finance-card.expense small').forEach(node=>node.textContent='Tháng '+month.slice(5)+'/'+month.slice(0,4));
  const visible=visibleTransactions();
  const tx=visible.filter(t=>t.date.slice(0,7)===month);
  const total=(items,kind)=>items.filter(t=>t.kind===kind).reduce((sum,t)=>sum+Number(t.amount),0);
  const income=total(tx,'income'),expense=total(tx,'expense');
  el('#financeIncome').textContent=money(income); el('#financeExpense').textContent=money(expense); el('#financeNet').textContent=money(income-expense);
  const currentTx=month===current?tx:visible.filter(t=>t.date.slice(0,7)===current);
  const monthIncome=total(currentTx,'income');
  el('#monthRevenue').textContent=money(monthIncome); el('#monthProfit').textContent=money(monthIncome-total(currentTx,'expense'));
  const rows=tx.filter(t=>state.kind==='all'||t.kind===state.kind)
    .sort((a,b)=>b.date.localeCompare(a.date)||String(b.id).localeCompare(String(a.id),'en',{numeric:true}));
  const target=focusTransaction===null?-1:rows.findIndex(t=>String(t.id)===String(focusTransaction));
  if (target>=0) state.financePage=Math.floor(target/financePageSize)+1;
  const pages=Math.max(1,Math.ceil(rows.length/financePageSize));
  state.financePage=Math.max(1,Math.min(state.financePage,pages));
  const start=(state.financePage-1)*financePageSize;
  const pageRows=rows.slice(start,start+financePageSize);
  el('#transactionTable').innerHTML='<div class="transaction-row head"><div>NỘI DUNG</div><div>NGÀY</div><div>LOẠI</div><div>SỐ TIỀN</div></div>'+ (pageRows.map(t=>`<div class="transaction-row"><div class="transaction-content"><strong>${esc(t.title)}</strong><small>${esc(t.note)} · ${esc(services[t.service]||'Chưa phân loại')}</small></div><div class="transaction-date"><time datetime="${esc(t.date)}">${shortDate(parseDate(t.date))}</time></div><div class="transaction-kind">${t.kind==='income'?'Khoản thu':'Khoản chi'}</div><div class="transaction-actions"><span class="amount-${t.kind}">${t.kind==='income'?'+':'-'}${money(t.amount)}</span><div class="transaction-tools"><button type="button" class="transaction-icon" data-edit-transaction="${esc(t.id)}" aria-label="Sửa giao dịch ${esc(t.title)}" title="Sửa">${transactionIcon('edit')}</button><button type="button" class="transaction-icon transaction-delete" data-delete-transaction="${esc(t.id)}" aria-label="Xóa giao dịch ${esc(t.title)}" title="Xóa">${transactionIcon('delete')}</button></div></div></div>`).join('')||'<p>Chưa có giao dịch phù hợp trong tháng đã chọn.</p>');
  el('#transactionPagination').hidden=rows.length<=financePageSize;
  el('#transactionRange').textContent=(rows.length?start+1:0)+'–'+Math.min(start+financePageSize,rows.length)+' / '+rows.length+' giao dịch';
  el('#transactionPage').textContent='Trang '+state.financePage+'/'+pages;
  el('[data-finance-page="-1"]').disabled=state.financePage===1;
  el('[data-finance-page="1"]').disabled=state.financePage===pages;
  els('[data-kind-filter]').forEach(b=>{b.classList.toggle('selected',b.dataset.kindFilter===state.kind);b.setAttribute('aria-pressed',b.dataset.kindFilter===state.kind);});
  const bs=visibleBookings();
  el('#weekBookings').textContent=bs.filter(b=>within(b.date,period(today(),'week'))).length+' lịch';
  el('.nav-badge').textContent=bs.filter(b=>b.date===iso(today())).length;
  el('.stat-card.white .stat-top span').textContent='KHÁCH TRONG THÁNG';
  el('.stat-card.white .stat-value').textContent=new Set(bs.filter(b=>within(b.date,period(today(),'month'))).map(b=>b.phone||b.name.trim().toLowerCase())).size+' người';
  els('.stat-foot').forEach(n=>n.textContent='Theo dữ liệu đã ghi nhận');
  renderChart();
}
async function deleteTransaction(button) {
  const id = button.dataset.deleteTransaction;
  const item = state.transactions.find(t => String(t.id) === id);
  if (!item || button.disabled) return;
  const kind = item.kind === 'income' ? 'khoản thu' : 'khoản chi';
  if (!window.confirm(`Xóa ${kind} “${item.title}” (${money(item.amount)}, ${shortDate(parseDate(item.date))})? Thao tác này không thể hoàn tác.`)) return;
  const index = els('[data-delete-transaction]').indexOf(button);
  button.disabled = true;
  try {
    await persist({transactions:state.transactions.filter(t => t !== item)}, () => {
      const restoreFocus = document.activeElement === button || document.activeElement === document.body;
      render();
      const remaining = els('[data-delete-transaction]');
      if (restoreFocus && state.view === 'finance') (remaining[Math.min(index,remaining.length-1)] || el('#openFinance')).focus();
      toast('Đã xóa '+kind+'.');
    });
  } finally {
    button.disabled = false;
  }
}
function renderChart() {
  const bounds=period(today(),state.range);
  const tx=visibleTransactions().filter(t=>t.kind==='income'&&within(t.date,bounds));
  el('#chartTotal').textContent=money(tx.reduce((s,t)=>s+Number(t.amount),0));
  el('.chart-summary .positive').textContent='';
  el('.chart-summary small').textContent='Doanh thu đã ghi nhận';
  const start=parseDate(bounds[0]),end=parseDate(bounds[1]);
  const count=state.range==='year'?12:Math.round((end-start)/86400000);
  const values=Array.from({length:count},(_,i)=>tx.filter(t=>state.range==='year'?parseDate(t.date).getMonth()===i:t.date===iso(addDays(start,i))).reduce((s,t)=>s+Number(t.amount),0));
  const max=Math.max(...values,100000);
  const pts=values.map((v,i)=>[i*680/(count-1),194-v/max*168]);
  const line=pts.map(([x,y],i)=>(i?'L':'M')+x+' '+y).join(' ');
  el('#chartLine').setAttribute('d',line); el('#chartArea').setAttribute('d',line+' L680 220 L0 220 Z');
  el('.chart-dot').setAttribute('cy',pts.at(-1)[1]);
  el('.chart-y').innerHTML=[max,max*2/3,max/3,0].map((n,i)=>'<span style="top:'+((26+i*56)/220*100)+'%">'+new Intl.NumberFormat('vi-VN',{notation:'compact'}).format(n)+'</span>').join('');
  el('.chart-x').innerHTML=values.map((_,i)=>i===0||i===count-1||i%Math.ceil(count/6)===0?'<span style="left:'+(i*100/(count-1))+'%">'+(state.range==='year'?'T'+(i+1):shortDate(addDays(start,i)).slice(0,5))+'</span>':'').join('');
  els('[data-range]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.range===state.range));
  el('.line-chart').setAttribute('role','img');
  el('.line-chart').setAttribute('aria-label','Doanh thu đã ghi nhận: '+money(tx.reduce((s,t)=>s+Number(t.amount),0)));
  if(!el('#chartData')) el('.revenue-panel').insertAdjacentHTML('beforeend','<details class="chart-data" id="chartData"><summary>Xem số liệu chi tiết</summary><div class="chart-data-scroll"></div></details>');
  el('#chartData .chart-data-scroll').innerHTML='<table><caption>Doanh thu (VND) · '+shortDate(start)+' – '+shortDate(addDays(end,-1))+'</caption><thead><tr><th scope="col">Thời gian</th><th scope="col">Doanh thu</th></tr></thead><tbody>'+values.map((v,i)=>'<tr><th scope="row">'+(state.range==='year'?'Tháng '+(i+1):shortDate(addDays(start,i)))+'</th><td>'+money(v)+'</td></tr>').join('')+'</tbody></table>';
}
function render() { renderDates(); renderWeek(); renderCalendar(); renderTomorrow(); renderFinance(); document.dispatchEvent(new Event('tipi:render')); }
function setView(view) {
  state.view=view;
  els('.view').forEach(n=>n.classList.toggle('active',n.id===view+'View'));
  els('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===view));
  el('#sidebar').classList.remove('open'); render();
  const heading=el('#'+view+'View h2');heading.tabIndex=-1;heading.focus({preventScroll:true});
}
const safeImage = s => typeof s==='string' && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(s);
const imageViewer = {sources:[],index:0};
function imageThumbnail(src,i) {
  return `<button type="button" class="image-thumb" data-view-image aria-label="Xem ảnh mẫu ${i+1}"><img src="${src}" alt="Ảnh mẫu ${i+1}"></button>`;
}
function renderImageViewer() {
  const {sources,index}=imageViewer;
  const stage=el('#imageStage'), image=new Image();
  image.alt='Ảnh mẫu '+(index+1);
  image.onerror=()=>{
    if (image.parentNode!==stage) return;
    const error=document.createElement('p');
    error.textContent='Không mở được ảnh này.';
    error.setAttribute('role','status');
    stage.replaceChildren(error);
  };
  stage.replaceChildren(image);
  image.src=sources[index];
  el('#imageCount').textContent='Ảnh '+(index+1)+' / '+sources.length;
  els('[data-image-step]').forEach(b=>b.hidden=sources.length<2);
}
function openImageViewer(button) {
  const thumbs=els('[data-view-image]',button.closest('.image-gallery'));
  const sources=thumbs.map(b=>el('img',b).getAttribute('src'));
  const index=thumbs.indexOf(button);
  if (!safeImage(sources[index])) return;
  imageViewer.sources=sources;
  imageViewer.index=index;
  renderImageViewer();
  openModal('imageModal');
}
function stepImage(step) {
  const count=imageViewer.sources.length;
  if (count<2) return;
  imageViewer.index=(imageViewer.index+step+count)%count;
  renderImageViewer();
}
function showDetail(id) {
  const b=state.bookings.find(b=>String(b.id)===id); if(!b)return;
  const status = b.cancelledAt ? '<p class="booking-cancelled">Đã hủy</p>' : '';
  const actions = b.cancelledAt ? '' : `<div class="modal-footer"><button type="button" class="outline-button cancel-booking" data-cancel-booking="${esc(b.id)}">Hủy lịch hẹn</button><button type="button" class="primary-button" data-edit="${esc(b.id)}">Chỉnh sửa lịch hẹn</button></div>`;
  el('#bookingDetail').innerHTML=status+'<dl class="details">'+[
    ['Khách hàng',b.name],['Số điện thoại',b.phone||'Chưa có'],['Dịch vụ',services[b.service]],['Ngày',fullDate(parseDate(b.date))],['Giờ',b.time+' · '+b.duration+' phút'],['Liên hệ qua',contacts[b.contact]||b.contact],['Mẫu khách chọn',b.style||'Chưa có'],['Giá dịch vụ',money(b.price||0)],['Ghi chú',b.note||'Không có']
  ].map(([k,v])=>'<div><dt>'+k+'</dt><dd>'+esc(v)+'</dd></div>').join('')+'</dl><div class="image-gallery">'+(b.images||[]).filter(safeImage).map(imageThumbnail).join('')+'</div>'+actions;
  openModal('detailModal');
}
function showCancelledBookings() {
  const cancelled = state.bookings.filter(b => b.cancelledAt && matchesWorkspace(b))
    .sort((a,b) => b.cancelledAt.localeCompare(a.cancelledAt));
  el('#cancelledBookingsList').innerHTML = cancelled.length
    ? cancelled.map(b => bookingButton(b,'agenda-item')).join('')
    : '<p>Chưa có lịch hẹn đã hủy.</p>';
  openModal('cancelledBookingsModal');
}
function cancelBooking(id) {
  const booking = state.bookings.find(b => String(b.id) === id);
  if (!booking || booking.cancelledAt || !window.confirm('Hủy lịch hẹn của '+booking.name+'?')) return;
  const bookings = state.bookings.map(b => b === booking ? {...b,cancelledAt:new Date().toISOString()} : b);
  persist({bookings}, () => {
    closeModal('detailModal');
    render();
    toast('Đã hủy lịch hẹn của '+booking.name);
  });
}
function imagePreview() { el('#imagePreview').innerHTML=state.images.filter(safeImage).map((src,i)=>`<div>${imageThumbnail(src,i)}<button type="button" data-remove-image="${i}" aria-label="Bỏ ảnh mẫu ${i+1}">Bỏ ảnh</button></div>`).join(''); }
function openBooking(date=iso(today()), b=null, time) {
  const form=el('#bookingForm'); form.reset(); state.editing=b?.id??null;
  state.bookingSession++;
  setImageLoading(false);
  el('#sampleStatus').textContent='';
  state.service=b?.service||(state.workspace==='all'?'nail':state.workspace);
  state.images=[...(b?.images||[])]; imagePreview();
  for (const key of ['name','phone','date','time','duration','contact','style','price','note']) if(b && b[key]!=null) form.elements[key].value=b[key];
  if(!b) form.elements.date.value=date;
  if(!b && time) {
    form.elements.time.value=time;
    if (state.filter !== 'all') state.service=state.filter;
    const hour = Number(time.slice(0,2));
    if (hour === 23) form.elements.duration.value='60';
  }
  el('#bookingModalTitle').textContent=b?'Chỉnh sửa lịch hẹn':'Thêm lịch cho khách';
  els('[data-service]').forEach(n=>n.classList.toggle('selected',n.dataset.service===state.service));
  openModal('bookingModal');
}
async function readImage(file) {
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>10*1024*1024) throw Error('Chọn ảnh JPG, PNG hoặc WebP không quá 10 MB.');
  const url=URL.createObjectURL(file);
  try {
    const img=new Image(); img.src=url; await img.decode();
    const scale=Math.min(1,1200/Math.max(img.width,img.height));
    const canvas=document.createElement('canvas');canvas.width=Math.round(img.width*scale);canvas.height=Math.round(img.height*scale);
    canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);
    return canvas.toDataURL('image/jpeg',0.8);
  } finally {URL.revokeObjectURL(url);}
}
function setImageLoading(loading) {
  state.imageLoading=loading;
  for (const selector of ['#bookingForm [type=submit]','#sampleUpload','#pasteSample']) el(selector).disabled=loading;
}
async function addBookingImages(getFiles,fallback) {
  if (state.imageLoading || modalStack.at(-1)?.node.id!=='bookingModal') return;
  const modal=modalStack.at(-1), session=state.bookingSession;
  const status=el('#sampleStatus');
  const stillOpen=()=>state.bookingSession===session && modalStack.includes(modal);
  setImageLoading(true);
  status.textContent='Đang đọc ảnh…';
  try {
    const files=await getFiles();
    if (!stillOpen()) return;
    if (!files.length) throw new Error(fallback);
    if (state.images.length+files.length>3) throw new Error('Mỗi lịch hẹn có tối đa 3 ảnh.');
    const images=await Promise.all(files.map(readImage));
    if (!stillOpen()) return;
    state.images.push(...images);
    imagePreview();
    status.textContent='Đã thêm '+images.length+' ảnh.';
  } catch (error) {
    if (stillOpen()) status.textContent=error.message || fallback;
  } finally {
    if (stillOpen()) setImageLoading(false);
  }
}
initializeUI();
if (!document.documentElement.hasAttribute('data-cloud')) {
  el('.settings-panel').insertAdjacentHTML('beforeend','<button type="button" class="outline-button" id="exportLegacy">Xuất dữ liệu sang Tipi web</button>');
  el('#exportLegacy').onclick = () => {
    const file = new Blob([JSON.stringify({format:'tipi-transfer',version:1,data:snapshot()})],{type:'application/json'});
    const url = URL.createObjectURL(file);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'tipi-du-lieu-cu.json';
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url),30000);
  };
}
el('#profileForm .settings-form').insertAdjacentHTML('beforeend', '<div class="shop-message"><label for="shopMessage">Thông tin chủ shop để gửi khách</label><textarea id="shopMessage" name="shopMessage" rows="6" placeholder="Tên chủ shop, số điện thoại, địa chỉ, thông tin chuyển khoản, hướng dẫn đặt lịch..."></textarea><div class="shop-message-actions"><small>Nhấn Lưu thông tin để giữ nội dung cho lần sau.</small><button type="button" class="outline-button" id="copyShopMessage">Sao chép nội dung</button></div><p id="copyStatus" role="status" aria-live="polite"></p></div>');
el('#profileForm .modal-footer button').type='submit';
renderProfile(); render();
el('#copyShopMessage').onclick=async ()=>{
  const field=el('#shopMessage'),status=el('#copyStatus'),text=field.value;
  if(!text.trim()){status.textContent='Bạn chưa nhập thông tin để sao chép.';field.focus();return;}
  try {
    if(!navigator.clipboard?.writeText) throw Error('Clipboard unavailable');
    await navigator.clipboard.writeText(text);
    status.textContent='Đã sao chép. Bạn có thể dán vào tin nhắn cho khách.';
  } catch {
    // Older browsers and non-HTTPS previews need a selected-text fallback.
    field.focus();field.select();field.setSelectionRange(0,text.length);
    let copied=false;
    try {copied=document.execCommand?.('copy')===true;} catch {}
    status.textContent=copied?'Đã sao chép. Bạn có thể dán vào tin nhắn cho khách.':'Đã chọn nội dung. Nhấn giữ và chọn Sao chép, hoặc dùng Ctrl+C / Cmd+C.';
  }
};
document.addEventListener('click', e=>{
  const b=e.target.closest('button,a'); if(!b)return;
  if(b.dataset.closeModal) closeModal(b.dataset.closeModal);
  else if(b.dataset.view) setView(b.dataset.view);
  else if(b.dataset.viewJump) {
    if(b.closest('.tomorrow-panel')) {state.date=addDays(today(),1);state.weekStart=monday(state.date);state.mode='day';}
    setView(b.dataset.viewJump);
  }
  else if(b.dataset.booking) showDetail(b.dataset.booking);
  else if(b.hasAttribute('data-cancelled-bookings')) showCancelledBookings();
  else if(b.dataset.cancelBooking) cancelBooking(b.dataset.cancelBooking);
  else if(b.dataset.slotDate) openBooking(b.dataset.slotDate,null,b.dataset.slotTime);
  else if(b.dataset.edit) {closeModal('detailModal');openBooking(null,state.bookings.find(x=>String(x.id)===b.dataset.edit));}
  else if(b.dataset.day) {state.date=parseDate(b.dataset.day);state.weekStart=monday(state.date);state.mode='day';setView('calendar');}
  else if(b.dataset.mode) {state.mode=b.dataset.mode;renderCalendar();}
  else if(b.dataset.kindFilter) {state.kind=b.dataset.kindFilter;renderFinance();}
  else if(b.hasAttribute('data-finance-page')) {
    if (b.disabled) return;
    state.financePage+=Number(b.dataset.financePage);
    renderFinance();
    const table=el('#transactionTable');
    table.tabIndex=-1;
    table.focus({preventScroll:true});
    table.scrollIntoView?.({block:'start',behavior:'auto'});
  }
  else if(b.hasAttribute('data-delete-transaction')) void deleteTransaction(b);
  else if(b.hasAttribute('data-edit-transaction')) {
    const item=state.transactions.find(t=>String(t.id)===b.dataset.editTransaction);
    if (item) openFinance(item);
  }
  else if(b.dataset.service) {state.service=b.dataset.service;els('[data-service]').forEach(n=>n.classList.toggle('selected',n===b));}
  else if(b.dataset.kind) selectFinanceKind(b.dataset.kind);
  else if(b.dataset.range) {state.range=b.dataset.range;els('[data-range]').forEach(n=>n.classList.toggle('selected',n===b));renderChart();}
  else if(b.hasAttribute('data-remove-image')) {state.images.splice(Number(b.dataset.removeImage),1);imagePreview();}
  else if(b.hasAttribute('data-view-image')) openImageViewer(b);
  else if(b.hasAttribute('data-image-step')) stepImage(Number(b.dataset.imageStep));
  else if(b.hasAttribute('data-account')) {
    el('#accountInfo').innerHTML='<h3>'+esc(state.profile.owner)+'</h3><p>Chủ tiệm '+esc(state.profile.studio)+'</p><p>'+esc(state.profile.phone||'Chưa thêm số điện thoại')+'</p><p>Hồ sơ trên thiết bị này; chưa có tài khoản đăng nhập hoặc đồng bộ.</p>';
    openModal('accountModal');
  }
});
els('.modal-backdrop').forEach(n=>n.addEventListener('click',e=>{if(e.target===n)closeModal(n.id);}));
document.addEventListener('keydown',e=>{
  const m=modalStack.at(-1)?.node;if(!m)return;
  if(e.key==='Escape'){closeModal(m.id);return;}
  if(m.id==='imageModal' && ['ArrowLeft','ArrowRight'].includes(e.key)){
    e.preventDefault();stepImage(e.key==='ArrowLeft'?-1:1);return;
  }
  if(e.key==='Tab'){
    const items=els('button:not(:disabled),input:not(:disabled),select,textarea,a[href]',m)
      .filter(node=>node.tabIndex>=0 && !node.closest('[hidden]')),first=items[0],last=items.at(-1);
    if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
    else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
  }
});
el('#mobileMenu').onclick=()=>el('#sidebar').classList.toggle('open');
for(const id of ['openBooking','openBookingCalendar','mobileAdd']) el('#'+id).onclick=()=>openBooking(state.view==='calendar'?iso(state.date):iso(today()));
el('#tomorrowAdd').onclick=()=>openBooking(iso(addDays(today(),1)));
el('#editProfile').onclick=()=>{closeModal('accountModal');setView('settings');};
el('.notification').onclick=()=>{renderTomorrow();openModal('notificationModal');};
el('#workspace').onchange=e=>{
  state.workspace=e.target.value;state.filter=state.workspace;
  el('#serviceFilter').value=state.filter;
  render();
};
el('#serviceFilter').onchange=e=>{
  state.filter=e.target.value;
  // Explicitly choosing all services also exits a narrower workspace.
  if(state.workspace!=='all'&&state.filter!==state.workspace){state.workspace='all';el('#workspace').value='all';}
  render();
};
el('#calendarDate').onchange=e=>{if(e.target.value){state.date=parseDate(e.target.value);state.weekStart=monday(state.date);render();}};
for(const [id,n] of [['weekPrev',-7],['weekNext',7],['calPrev',-1],['calNext',1]]) el('#'+id).onclick=()=>{
  const step=id.startsWith('week')?n:n*(state.mode==='week'?7:1);
  state.date=addDays(state.date,step);state.weekStart=monday(state.date);render();
};
el('#calToday').onclick=()=>{state.date=today();state.weekStart=monday(state.date);render();};
el('#sampleUpload').onchange=e=>{
  const files=[...e.target.files];
  e.target.value='';
  if (files.length) return addBookingImages(()=>files,'Không đọc được ảnh đã chọn.');
};
const pasteHint='Clipboard chưa có ảnh. Hãy sao chép ảnh thay vì đường link, hoặc dùng Chọn ảnh.';
el('#pasteSample').onclick=()=>{
  void addBookingImages(async ()=>{
    if (!navigator.clipboard?.read) throw new Error('Trình duyệt không hỗ trợ nút Dán ảnh. Hãy thử Cmd+V / Ctrl+V hoặc Chọn ảnh.');
    let items;
    try {items=await navigator.clipboard.read();}
    catch {throw new Error('Không đọc được clipboard. Hãy cho phép dán, thử Cmd+V / Ctrl+V hoặc dùng Chọn ảnh.');}
    const allowed=['image/png','image/jpeg','image/webp'];
    const blobs=await Promise.all(items.map(item=>{
      const type=allowed.find(t=>item.types.includes(t));
      return type?item.getType(type):null;
    }));
    return blobs.filter(Boolean);
  },pasteHint);
};
document.addEventListener('paste',e=>{
  if (modalStack.at(-1)?.node.id!=='bookingModal') return;
  const clipboard=e.clipboardData;
  if (!clipboard) return;
  const fromItems=Array.from(clipboard.items || [])
    .filter(item=>item.kind==='file' && item.type.startsWith('image/')).map(item=>item.getAsFile()).filter(Boolean);
  const files=fromItems.length?fromItems:Array.from(clipboard.files || []).filter(file=>file.type.startsWith('image/'));
  if (!files.length) return;
  e.preventDefault();
  void addBookingImages(()=>files,pasteHint);
});
el('#bookingForm').onsubmit=e=>{
  e.preventDefault();if(state.imageLoading)return;
  const data=Object.fromEntries(new FormData(e.target));data.name=data.name.trim();
  if(!data.name){toast('Vui lòng nhập tên khách.');return;}
  const start=Number(data.time.slice(0,2))*60+Number(data.time.slice(3));
  if(start+Number(data.duration)>1440){toast('Lịch hẹn cần kết thúc trong cùng ngày.');return;}
  const booking={...data,id:state.editing??Date.now(),service:state.service,price:Number(data.price||0),duration:Number(data.duration),images:[...state.images]};
  const bookings=state.editing===null?[...state.bookings,booking]:state.bookings.map(b=>b.id===state.editing?booking:b);
  persist({bookings}, () => {closeModal('bookingModal');render();toast('Đã lưu lịch hẹn của '+data.name);});
};
function selectFinanceKind(kind) {
  state.financeKind=kind;
  els('.finance-tabs button').forEach(b=>{
    b.classList.toggle('selected',b.dataset.kind===kind);
    b.setAttribute('aria-pressed',b.dataset.kind===kind);
  });
}
function openFinance(item=null) {
  const form=el('#financeForm');
  form.reset();
  state.financeEditing=item?.id??null;
  form.elements.date.value=iso(today());
  form.elements.service.value=state.workspace==='all'?'nail':state.workspace;
  if (item) for (const key of ['title','amount','date','service','note']) form.elements[key].value=item[key]??'';
  selectFinanceKind(item?.kind || 'income');
  el('#financeModal h2').textContent=item?'Sửa giao dịch':'Ghi khoản mới';
  openModal('financeModal');
}
el('#openFinance').onclick=()=>openFinance();
el('#financeMonth').onchange=e=>{state.financeMonth=e.target.value;renderFinance();};
el('#financeForm').onsubmit=async e=>{
  e.preventDefault();
  const modal=modalStack.at(-1), button=el('[type=submit]',e.target);
  if (button.disabled) return;
  const data=Object.fromEntries(new FormData(e.target));data.title=data.title.trim();
  if(!data.title||!Number.isFinite(Number(data.amount))||Number(data.amount)<=0){toast('Nhập nội dung và số tiền lớn hơn 0.');return;}
  const editing=state.financeEditing;
  const item=editing===null?null:state.transactions.find(t=>t.id===editing);
  if (editing!==null && !item) {toast('Không tìm thấy giao dịch để sửa.');return;}
  const updated={...item,...data,id:item?.id??Date.now(),amount:Number(data.amount),kind:state.financeKind};
  const transactions=item?state.transactions.map(t=>t===item?updated:t):[updated,...state.transactions];
  button.disabled=true;
  try {
    await persist({transactions}, () => {
      const stillOpen=modalStack.at(-1)===modal;
      if (stillOpen) {
        state.financeMonth=updated.date.slice(0,7);
        if (state.kind!=='all' && state.kind!==updated.kind) state.kind='all';
        closeModal('financeModal');
      }
      render();
      if (stillOpen) renderFinance(updated.id);
      if (stillOpen) (els('[data-edit-transaction]').find(node=>node.dataset.editTransaction===String(updated.id)) || el('#openFinance')).focus();
      toast(item?'Đã cập nhật giao dịch.':'Đã lưu giao dịch.');
    });
  } finally {
    button.disabled=false;
  }
};
el('#profileForm').onsubmit=async e=>{
  e.preventDefault();const form=e.target,button=el('button[type=submit]',form);button.disabled=true;
  try {
    const data=Object.fromEntries(new FormData(form));
    if(!data.studio.trim()||!data.owner.trim())throw Error('Nhập tên tiệm và chủ tiệm.');
    const file=el('#avatarUpload').files[0],avatar=file?await readImage(file):state.profile.avatar;
    await persist({profile:{...state.profile,...data,studio:data.studio.trim(),owner:data.owner.trim(),avatar}}, () => {
      renderProfile();el('#avatarUpload').value='';toast('Đã lưu thông tin tiệm.');
    });
  }catch(err){toast(err.message);}finally{button.disabled=false;}
};
let dayAtRender=iso(today());
setInterval(()=>{const day=iso(today());if(day!==dayAtRender){state.date=today();state.weekStart=monday(state.date);dayAtRender=day;render();}},60000);

window.tipiApp = {
  snapshot,
  load(data) {
    Object.assign(state,data);
    renderProfile();
    render();
  },
  restore(data) {
    return persist(data, () => {renderProfile();render();});
  }
};
