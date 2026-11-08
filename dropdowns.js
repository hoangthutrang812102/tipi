/* Keep native selects as the form/data source; enhance only their presentation. */
(() => {
  const controls = [];
  let opened = null;
  const svg = path => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+path+'</svg>';
  const arrow = svg('<path d="m7 10 5 5 5-5"/>');
  const check = svg('<path d="m5 12 4 4L19 6"/>');
  const normalize = text => text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').toLowerCase();

  for (const [number, select] of [...document.querySelectorAll('select')].entries()) {
    const label = select.labels?.[0];
    const name = select.getAttribute('aria-label') || [...(label?.childNodes || [])].filter(n => n.nodeType === 3).map(n => n.textContent).join(' ').trim() || 'Chọn một mục';
    const wrapper = document.createElement('span');
    wrapper.className = 'dropdown';
    if (select.id === 'serviceFilter') wrapper.classList.add('dropdown-filter');
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.id = 'dropdown-trigger-' + number;
    trigger.className = 'dropdown-trigger';
    trigger.setAttribute('role','combobox');
    trigger.setAttribute('aria-haspopup','listbox');
    trigger.setAttribute('aria-expanded','false');
    trigger.setAttribute('aria-label',name);
    trigger.innerHTML = '<span class="dropdown-value"></span><span class="dropdown-chevron">'+arrow+'</span>';
    const list = document.createElement('div');
    list.className = 'dropdown-menu';
    list.id = 'dropdown-list-' + number;
    list.setAttribute('role','listbox');
    list.setAttribute('aria-label',name);
    list.hidden = true;
    trigger.setAttribute('aria-controls',list.id);
    select.before(wrapper);
    wrapper.append(select,trigger);
    select.hidden = true;
    select.tabIndex = -1;
    if (label) label.htmlFor = trigger.id;
    (select.closest('.modal') || document.body).append(list);
    let active = 0;
    let query = '';
    let lastTyped = 0;

    function sync() {
      trigger.querySelector('.dropdown-value').textContent = select.selectedOptions[0]?.textContent || 'Chọn một mục';
      trigger.disabled = select.disabled;
      if (trigger.disabled && opened === control) close();
    }
    function rows() { return [...list.querySelectorAll('[role=option]')]; }
    function setActive(index) {
      active = index;
      rows().forEach((row,i) => row.classList.toggle('is-active',i === active));
      const row = rows()[active];
      if (row) {
        trigger.setAttribute('aria-activedescendant',row.id);
        row.scrollIntoView?.({block:'nearest'});
      }
    }
    function position() {
      const rect = trigger.getBoundingClientRect();
      const viewport = window.visualViewport;
      const leftEdge = viewport?.offsetLeft || 0, topEdge = viewport?.offsetTop || 0;
      const width = viewport?.width || window.innerWidth, height = viewport?.height || window.innerHeight;
      const menuWidth = Math.min(Math.max(rect.width,220),width-24);
      const below = topEdge + height - rect.bottom - 16;
      const above = rect.top - topEdge - 16;
      const upward = below < 200 && above > below;
      const available = Math.max(44,upward ? above : below);
      list.style.width = menuWidth + 'px';
      list.style.maxHeight = Math.min(300,available) + 'px';
      list.style.left = Math.max(leftEdge+12,Math.min(rect.left,leftEdge+width-menuWidth-12)) + 'px';
      list.style.top = (upward ? rect.top-list.getBoundingClientRect().height-8 : rect.bottom+8) + 'px';
      list.dataset.side = upward ? 'top' : 'bottom';
    }
    function open() {
      if (trigger.disabled) return;
      if (opened === control) return;
      opened?.close();
      sync();
      list.replaceChildren();
      for (const [index, option] of [...select.options].entries()) {
        const row = document.createElement('div');
        row.className = 'dropdown-option';
        row.id = list.id + '-option-' + index;
        row.setAttribute('role','option');
        row.setAttribute('aria-selected',String(option.selected));
        if (option.disabled) row.setAttribute('aria-disabled','true');
        const text = document.createElement('span');
        text.textContent = option.textContent;
        const tick = document.createElement('span');
        tick.className = 'dropdown-check';
        tick.innerHTML = check;
        row.append(text,tick);
        row.addEventListener('click',() => choose(index));
        list.append(row);
      }
      opened = control;
      query = '';
      list.hidden = false;
      trigger.setAttribute('aria-expanded','true');
      wrapper.classList.add('is-open');
      position();
      const index = select.selectedIndex;
      setActive(index >= 0 && !select.options[index].disabled ? index : [...select.options].findIndex(o => !o.disabled));
    }
    function close() {
      list.hidden = true;
      trigger.setAttribute('aria-expanded','false');
      trigger.removeAttribute('aria-activedescendant');
      wrapper.classList.remove('is-open');
      if (opened === control) opened = null;
    }
    function choose(index) {
      const option = select.options[index];
      if (!option || option.disabled) return;
      const changed = select.selectedIndex !== index;
      select.selectedIndex = index;
      close();
      sync();
      trigger.focus({preventScroll:true});
      if (changed) {
        select.dispatchEvent(new Event('input',{bubbles:true}));
        select.dispatchEvent(new Event('change',{bubbles:true}));
      }
    }
    const control = {trigger,list,sync,close};
    controls.push(control);
    trigger.addEventListener('click',() => opened === control ? close() : open());
    trigger.addEventListener('keydown',event => {
      const key = event.key;
      if (key === 'Escape' && opened === control) {
        event.preventDefault();event.stopPropagation();close();return;
      }
      if (key === 'Tab') {close();return;}
      if (['ArrowDown','ArrowUp','Home','End','Enter',' '].includes(key)) {
        event.preventDefault();event.stopPropagation();
        const wasOpen = opened === control;
        if (!wasOpen) open();
        else if (key === 'Enter' || key === ' ') {choose(active);return;}
        const indices = [...select.options].flatMap((o,i) => o.disabled ? [] : [i]);
        if (!indices.length) return;
        if (key === 'Home') setActive(indices[0]);
        else if (key === 'End') setActive(indices.at(-1));
        else if (wasOpen && (key === 'ArrowDown' || key === 'ArrowUp')) {
          const next = (indices.indexOf(active) + (key === 'ArrowDown' ? 1 : -1) + indices.length) % indices.length;
          setActive(indices[next]);
        }
      } else if (key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault();
        if (opened !== control) open();
        const now = Date.now();
        query = now-lastTyped > 700 ? key : query+key;lastTyped = now;
        const index = [...select.options].findIndex(o => !o.disabled && normalize(o.textContent).startsWith(normalize(query)));
        if (index >= 0) setActive(index);
      }
    });
    trigger.addEventListener('blur',() => close());
    list.addEventListener('pointerdown',event => event.preventDefault());
    select.addEventListener('change',sync);
    select.form?.addEventListener('reset',() => queueMicrotask(sync));
    sync();
  }
  document.addEventListener('pointerdown',event => {
    if (opened && !opened.trigger.contains(event.target) && !opened.list.contains(event.target)) opened.close();
  },true);
  document.addEventListener('scroll',event => {
    if (opened && !opened.list.contains(event.target)) opened.close();
  },true);
  window.addEventListener('resize',() => opened?.close());
  window.visualViewport?.addEventListener('resize',() => opened?.close());
  const syncAll = () => {opened?.close();controls.forEach(c => c.sync());};
  document.addEventListener('tipi:render',syncAll);
  document.addEventListener('tipi:dialog',syncAll);
})();
