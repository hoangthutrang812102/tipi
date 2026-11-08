/* Presentation and accessible interaction enhancements; booking data stays in app.js. */
(() => {
  const find = s => document.querySelector(s);
  const all = s => [...document.querySelectorAll(s)];
  const paths = {
    home:'<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>',
    calendar:'<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 11h18m-14 4h2m6 0h2"/>',
    wallet:'<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M17 5V3H6a3 3 0 0 0-3 3m18 5h-5v5h5m-3-2.5h.01"/>',
    settings:'<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="15" cy="17" r="3"/>',
    bell:'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M9 21h6"/>',
    more:'<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
    left:'<path d="m14 5-7 7 7 7"/>',
    right:'<path d="m10 5 7 7-7 7"/>',
    plus:'<path d="M12 5v14M5 12h14"/>',
    close:'<path d="m6 6 12 12M6 18 18 6"/>',
    trend:'<path d="m3 17 6-6 4 4 8-10m-6 0h6v6"/>',
    clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    users:'<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3m2-16a3 3 0 0 1 0 6m2 3a5 5 0 0 1 2 4v3"/>',
    spark:'<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z"/>',
    menu:'<path d="M4 6h16M4 12h16M4 18h16"/>'
  };
  const icon = name => '<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">'+paths[name]+'</svg>';
  const navIcons={overview:'home',calendar:'calendar',finance:'wallet',settings:'settings'};
  for(const b of all('[data-view]')) {
    const target=b.querySelector('.nav-icon')||b.querySelector('span');
    if(target) target.innerHTML=icon(navIcons[b.dataset.view]);
  }
  for(const [selector,name,label] of [
    ['#weekPrev','left','Tuần trước'],['#weekNext','right','Tuần sau'],
    ['#calPrev','left','Kỳ trước'],['#calNext','right','Kỳ sau'],
    ['#mobileMenu','menu','Mở menu'],['.profile-card .icon-button','more','Mở hồ sơ chủ tiệm']
  ]) {
    const b=find(selector);b.innerHTML=icon(name);b.setAttribute('aria-label',label);b.title=label;
  }
  find('.notification span').innerHTML=icon('bell');
  for(const b of all('.close-button')) { b.innerHTML=icon('close');b.setAttribute('aria-label','Đóng'); }
  const statIcons=['trend','calendar','users','wallet'];
  all('.stat-icon').forEach((n,i)=>n.innerHTML=icon(statIcons[i]));
  find('.tip-spark').innerHTML=icon('spark');
  for(const id of ['openBooking','openBookingCalendar','openFinance']) find('#'+id+' span').innerHTML=icon('plus');
  find('#tomorrowAdd').innerHTML=icon('plus')+' Thêm lịch hẹn';
  find('#mobileAdd').innerHTML=icon('plus');
  find('#mobileAdd').setAttribute('aria-label','Thêm lịch hẹn');
  all('.service-tabs button').forEach(b=>{b.textContent=b.dataset.service==='nail'?'Nail':'Makeup';});
  const scroll=document.createElement('div');scroll.className='week-scroll';scroll.tabIndex=0;scroll.setAttribute('role','region');scroll.setAttribute('aria-label','Lịch hẹn cả tuần, có thể cuộn ngang');
  find('#weekStrip').before(scroll);scroll.append(find('#weekStrip'),find('#weekEvents'));
  scroll.insertAdjacentHTML('afterend','<p class="scroll-hint">Chạm vào lịch để xem chi tiết. Vuốt ngang để xem hết tuần trên màn hình nhỏ.</p>');
  find('.calendar-toolbar').insertAdjacentHTML('afterend','<div class="calendar-legend" aria-label="Chú thích dịch vụ"><span><i class="legend-dot" aria-hidden="true"></i>Nail</span><span><i class="legend-dot makeup" aria-hidden="true"></i>Makeup</span><span>Ô trống: chưa có lịch hẹn</span></div>');
  find('.calendar-grid').insertAdjacentHTML('afterend','<p class="scroll-hint">Chọn Ngày để xem rõ trên điện thoại, hoặc vuốt ngang lịch Tuần.</p>');
  find('.calendar-grid').tabIndex=0;find('.calendar-grid').setAttribute('role','region');find('.calendar-grid').setAttribute('aria-label','Lưới lịch hẹn, có thể cuộn');
  find('#bookingForm [name=phone]').autocomplete='tel';
  find('#bookingForm [name=name]').autocomplete='name';
  for(const form of all('#bookingForm,#financeForm')) {
    form.insertAdjacentHTML('afterbegin','<p class="form-intro">Các trường có dấu * là bắt buộc.</p>');
  }
  let counter=0;
  for(const input of all('input[required],textarea[required]')) {
    const label=input.closest('label');
    if(label) input.insertAdjacentHTML('beforebegin','<span class="required-mark" aria-hidden="true"> *</span>');
    const error=document.createElement('p');error.className='form-error';error.id='fieldError'+(++counter);error.hidden=true;error.setAttribute('aria-live','polite');
    input.after(error);input.setAttribute('aria-describedby',error.id);
    function validate() {
      const invalid=!input.validity.valid;
      input.setAttribute('aria-invalid',String(invalid));error.hidden=!invalid;
      error.textContent=invalid?(input.validity.valueMissing?'Vui lòng điền thông tin này.':'Vui lòng kiểm tra giá trị đã nhập.'):'';
    }
    input.addEventListener('blur',validate);
    input.addEventListener('invalid',validate);
    input.addEventListener('input',()=>{if(input.getAttribute('aria-invalid')==='true')validate();});
    input.form?.addEventListener('reset',()=>{error.hidden=true;input.removeAttribute('aria-invalid');});
  }
  const scrim=document.createElement('button');scrim.className='sidebar-scrim';scrim.setAttribute('aria-label','Đóng menu');scrim.tabIndex=-1;find('.app-shell').append(scrim);
  const menu=find('#mobileMenu'),sidebar=find('#sidebar');
  menu.setAttribute('aria-controls','sidebar');menu.setAttribute('aria-expanded','false');
  function toggleMenu(open) {
    sidebar.classList.toggle('open',open);scrim.classList.toggle('open',open);
    menu.setAttribute('aria-expanded',String(open));
    if(open) sidebar.querySelector('select:not([hidden]),button')?.focus();else menu.focus();
  }
  menu.onclick=()=>toggleMenu(!sidebar.classList.contains('open'));
  scrim.onclick=()=>toggleMenu(false);
  document.addEventListener('keydown',e=>{
    if(!sidebar.classList.contains('open')||find('.modal-backdrop.open'))return;
    if(e.key==='Escape'){toggleMenu(false);return;}
    if(e.key==='Tab'){
      const items=[...sidebar.querySelectorAll('button,select:not([hidden])')],first=items[0],last=items.at(-1);
      if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
      else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
    }
  });
  function refresh() {
    for(const b of all('[data-view]')){
      if(b.classList.contains('active'))b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');
    }
    if(!sidebar.classList.contains('open')){scrim.classList.remove('open');menu.setAttribute('aria-expanded','false');}
    find('.top-avatar').setAttribute('aria-label','Hồ sơ '+state.profile.owner);
    find('.nav-badge').setAttribute('aria-label',find('.nav-badge').textContent+' lịch hẹn hôm nay');
  }
  document.addEventListener('tipi:render',refresh);refresh();
})();
