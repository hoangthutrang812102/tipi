const calendar = 'https://www.googleapis.com/calendar/v3/calendars';
const sheets = 'https://sheets.googleapis.com/v4/spreadsheets';
const drive = 'https://www.googleapis.com/drive/v3/files';
const vn = 'Asia/Ho_Chi_Minh';
const enc = encodeURIComponent;
const day = 86400000;
const service = {nail:'Nail', makeup:'Makeup', shared:'Chi phí chung'};
const contacts = {instagram:'Instagram',threads:'Threads',tiktok:'TikTok',zalo:'Zalo'};
const calendarFormat = 2;
const driveFormat = 2;
const vnd = new Intl.NumberFormat('vi-VN',{style:'currency',currency:'VND'});
const escapeHtml = text => String(text).replace(/[&<>"']/g,c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const monthFileName = month => 'Tipi - Thu chi '+month.slice(5)+'/'+month.slice(0,4);

export function needsCalendar(cfg,revision) {
  return cfg.calendar && (cfg.calendarRevision !== revision || cfg.calendarFormat !== calendarFormat);
}
export function needsSheets(cfg,revision) {
  return cfg.sheets && (cfg.sheetsRevision !== revision || cfg.driveFormat !== driveFormat);
}

export async function digest(value) {
  const bytes = await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value)));
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2,'0')).join('');
}

export function eventFor(booking) {
  const start = new Date(booking.date+'T'+booking.time+':00+07:00');
  const end = new Date(start.getTime()+Number(booking.duration)*60000);
  const kind = service[booking.service] || 'Lịch hẹn';
  const name = booking.name?.trim();
  const fields = [
    ['Tên khách',name],['Số điện thoại',booking.phone],['Dịch vụ',kind],
    ['Ngày',booking.date.split('-').reverse().join('/')],
    ['Giờ',booking.time+' (giờ Việt Nam)'],['Thời lượng',booking.duration+' phút'],
    ['Kênh liên hệ',contacts[booking.contact]],['Nhu cầu / mẫu chọn',booking.style],
    ['Giá',Number(booking.price)>0?vnd.format(Number(booking.price)):null],['Ghi chú',booking.note]
  ];
  return {
    summary: 'Tipi - '+kind+(name?' - '+name:''),
    description:fields.filter(([,value]) => String(value ?? '').trim())
      .map(([label,value]) => label+': '+escapeHtml(String(value).trim()).replace(/\r?\n/g,'<br>')).join('<br>'),
    start:{dateTime:start.toISOString(),timeZone:vn},
    end:{dateTime:end.toISOString(),timeZone:vn},
    visibility:'private'
  };
}

async function list(api,url,key) {
  const rows = [];
  let token;
  for (let page=0; page<12; page++) {
    const result = await api(url+(token?'&pageToken='+enc(token):''));
    rows.push(...(result[key] || []));
    token = result.nextPageToken;
    if (!token) return rows;
  }
  throw new Error('too-many-pages');
}

async function calendarSync(api,cfg,workspace,bookings,revision,checkpoint) {
  if (!cfg.calendarId) {
    // Never repeat a calendar creation whose outcome is unknown.
    if (cfg.calendarCreating) throw new Error('calendar-create-uncertain');
    cfg.calendarCreating = true;
    await checkpoint();
    try {
      cfg.calendarId = (await api(calendar,'POST',{summary:'Tipi',timeZone:vn})).id;
    } catch (error) {
      if (error.status >= 400 && error.status < 500) cfg.calendarCreating = false;
      throw error;
    }
    cfg.calendarCreating = false;
    await checkpoint();
  }
  const path = calendar+'/'+enc(cfg.calendarId)+'/events';
  const current = await list(api,path+'?maxResults=2500&privateExtendedProperty='+enc('tipiWorkspace='+workspace),'items');
  const today = new Date(Date.now()+7*3600000).toISOString().slice(0,10);
  const active = new Map(bookings.filter(b => !b.cancelledAt).map(b => [String(b.id),b]));
  const existing = new Map();
  let budget = 10;
  for (const event of current) {
    if (event.status === 'cancelled') continue;
    const key = event.extendedProperties?.private?.tipiBooking;
    if (!key) continue;
    if (!active.has(key) || existing.has(key)) {
      if (!budget--) return false;
      try { await api(path+'/'+enc(event.id),'DELETE'); }
      catch (error) { if (![404,410].includes(error.status)) throw error; }
    } else existing.set(key,event);
  }
  for (const [key,booking] of active) {
    const previous = existing.get(key);
    if (!previous && booking.date < today) continue;
    const body = eventFor(booking);
    const sameTime = (a,b) => Date.parse(a?.dateTime) === Date.parse(b.dateTime);
    if (previous?.summary === body.summary && sameTime(previous.start,body.start)
      && sameTime(previous.end,body.end) && previous.visibility === body.visibility
      && previous.description === body.description) continue;
    if (!budget--) return false;
    body.extendedProperties = {private:{tipiWorkspace:workspace,tipiBooking:key}};
    if (previous) await api(path+'/'+enc(previous.id),'PATCH',body);
    else {
      const id = await digest([workspace,key,revision]);
      for (let attempt=0; ; attempt++) {
        try { await api(path,'POST',{...body,id:id+attempt}); break; }
        catch (error) {
          if (error.status !== 409 || attempt >= 2) throw error;
          const found = await api(path+'/'+id+attempt).catch(e => {
            if ([404,410].includes(e.status)) return null;
            throw e;
          });
          if (found?.status !== 'cancelled' && found?.extendedProperties?.private?.tipiBooking === key
            && found?.extendedProperties?.private?.tipiWorkspace === workspace) break;
        }
      }
    }
  }
  return true;
}

export function monthTabs(month,transactions) {
  const [year,num] = month.split('-').map(Number);
  const first = new Date(Date.UTC(year,num-1,1));
  const last = new Date(Date.UTC(year,num,0));
  const offset = (first.getUTCDay()+6)%7;
  const tabs = [['Tổng quan',[
    [monthFileName(month)],
    ['Mảng dịch vụ','Tổng thu','Tổng chi','Chênh lệch']
  ]]];
  const label = date => date.toISOString().slice(8,10)+'/'+date.toISOString().slice(5,7);
  for (let i=0; i<Math.ceil((offset+last.getUTCDate())/7); i++) {
    const start = new Date(Math.max(first.getTime(),first.getTime()+(i*7-offset)*day));
    const end = new Date(Math.min(last.getTime(),first.getTime()+(i*7-offset+6)*day));
    tabs.push(['Tuần '+(i+1)+' ('+label(start).replace('/','-')+' đến '+label(end).replace('/','-')+')',
      [['Ngày','Loại','Nội dung','Mảng','Số tiền (VND)','Ghi chú','Mã']]]);
  }
  const totals = {nail:[0,0],makeup:[0,0],shared:[0,0]};
  for (const t of [...transactions].sort((a,b) => a.date.localeCompare(b.date) || String(a.id).localeCompare(String(b.id)))) {
    const group = Object.hasOwn(totals,t.service) ? t.service : 'shared';
    const income = t.kind === 'income';
    totals[group][income?0:1] += Number(t.amount);
    const index = Math.floor((offset+Number(t.date.slice(8))-1)/7)+1;
    tabs[index][1].push([t.date,income?'Thu':'Chi',t.title,service[group],Number(t.amount),t.note || '',String(t.id)]);
  }
  let income=0,expense=0;
  for (const [group,[a,b]] of Object.entries(totals)) {
    income+=a; expense+=b;
    tabs[0][1].push([service[group],a,b,a-b]);
  }
  tabs[0][1].push(['Tổng cộng',income,expense,income-expense]);
  return tabs;
}

async function updateMonth(api,fileId,tabs) {
  const path = sheets+'/'+enc(fileId);
  const doc = await api(path+'?fields=sheets(properties(sheetId,title,gridProperties(rowCount,columnCount)))');
  const requests = [];
  for (const [i,[title,rows]] of tabs.entries()) {
    const sheetId = 240800+i;
    const existing = doc.sheets.find(sheet => sheet.properties.sheetId === sheetId)?.properties;
    const rowCount = Math.max(rows.length,existing?.gridProperties?.rowCount || 100);
    const columnCount = Math.max(7,existing?.gridProperties?.columnCount || 7);
    if (!existing) requests.push({addSheet:{properties:{sheetId,title,index:i,gridProperties:{rowCount,columnCount,frozenRowCount:i===0?2:1}}}});
    else if (existing.title !== title || existing.gridProperties.rowCount < rowCount || existing.gridProperties.columnCount < columnCount) {
      requests.push({updateSheetProperties:{properties:{sheetId,title,gridProperties:{rowCount,columnCount}},fields:'title,gridProperties.rowCount,gridProperties.columnCount'}});
    }
    requests.push({updateCells:{
      range:{sheetId,startRowIndex:0,endRowIndex:rowCount,startColumnIndex:0,endColumnIndex:7},
      rows:rows.map(row => ({values:row.map(value => ({userEnteredValue:typeof value==='number'?{numberValue:value}:{stringValue:String(value ?? '')}}))})),
      fields:'userEnteredValue'
    }});
  }
  await api(path+':batchUpdate','POST',{requests});
}

async function taggedDriveFile(api,mimeType,key,tag) {
  const query = "trashed = false and mimeType = '"+mimeType+"' and appProperties has { key='"+key+"' and value='"+tag+"' }";
  const files = await list(api,drive+'?q='+enc(query)+'&fields=files(id,name,parents),nextPageToken&pageSize=100','files');
  if (files.length > 1) throw new Error(key==='tipiMonth'?'duplicate-month':'duplicate-folder');
  return files[0];
}

async function organizeMonth(api,file,name,folder) {
  const current = file.parents || [];
  const params = new URLSearchParams({fields:'id,name,parents'});
  if (!current.includes(folder)) params.set('addParents',folder);
  const remove = current.filter(id => id !== folder);
  if (remove.length) params.set('removeParents',remove.join(','));
  if (file.name !== name || params.has('addParents') || remove.length) {
    await api(drive+'/'+enc(file.id)+'?'+params,'PATCH',{name});
  }
}

async function createDriveFile(api,cfg,tag,body,checkpoint) {
  cfg.creatingFiles ??= {};
  // If the response was lost, reconcile by tag instead of blindly creating again.
  if (cfg.creatingFiles[tag]) throw new Error('drive-create-uncertain');
  cfg.creatingFiles[tag] = true;
  await checkpoint();
  try {
    const file = await api(drive+'?fields=id,name,parents','POST',body);
    delete cfg.creatingFiles[tag];
    return file;
  } catch (error) {
    if (error.status >= 400 && error.status < 500 && error.status !== 408) delete cfg.creatingFiles[tag];
    throw error;
  }
}

async function sheetSync(api,cfg,workspace,transactions,checkpoint) {
  cfg.files ??= {};
  const folderMime = 'application/vnd.google-apps.folder';
  const sheetMime = 'application/vnd.google-apps.spreadsheet';
  const folders = new Map();
  async function folder(name,parent) {
    if (folders.has(name)) return folders.get(name);
    const tag = workspace+':'+(parent?name:'root');
    const found = await taggedDriveFile(api,folderMime,'tipiFolder',tag);
    const info = found || await createDriveFile(api,cfg,'folder:'+tag,{
      name,mimeType:folderMime,appProperties:{tipiFolder:tag},...(parent?{parents:[parent]}:{})
    },checkpoint);
    if (cfg.creatingFiles) delete cfg.creatingFiles['folder:'+tag];
    if (found && parent) await organizeMonth(api,found,name,parent);
    folders.set(name,info.id);
    return info.id;
  }
  const groups = new Map(Object.keys(cfg.files).map(m => [m,[]]));
  for (const t of transactions) {
    const key = t.date.slice(0,7);
    if (!groups.has(key)) groups.set(key,[]);
    groups.get(key).push(t);
  }
  let budget = 3;
  for (const [month,rows] of groups) {
    const tabs = monthTabs(month,rows);
    const hash = await digest(tabs);
    if (cfg.files[month]?.hash === hash && cfg.files[month]?.layout === driveFormat) continue;
    if (!budget--) return false;
    const entry = cfg.files[month] ??= {};
    if (entry.layout !== driveFormat || !entry.id) {
      const parent = await folder('Tipi - Thu chi');
      const year = await folder(month.slice(0,4),parent);
      const name = monthFileName(month);
      const tag = workspace+':'+month;
      const existing = entry.id
        ? await api(drive+'/'+enc(entry.id)+'?fields=id,name,parents,trashed,appProperties')
        : await taggedDriveFile(api,sheetMime,'tipiMonth',tag);
      if (existing) {
        if (existing.trashed || (entry.id && existing.appProperties?.tipiMonth !== tag)) throw new Error('month-file-unavailable');
        await organizeMonth(api,existing,name,year);
        entry.id = existing.id;
        if (cfg.creatingFiles) delete cfg.creatingFiles['month:'+tag];
      } else {
        entry.id = (await createDriveFile(api,cfg,'month:'+tag,{
          name,mimeType:sheetMime,parents:[year],appProperties:{tipiMonth:tag}
        },checkpoint)).id;
      }
      entry.layout = driveFormat;
      await checkpoint();
    }
    await updateMonth(api,entry.id,tabs);
    entry.hash = hash;
  }
  return true;
}

export async function reconcile(api,cfg,workspace,snapshot,checkpoint) {
  const {data,revision} = snapshot;
  let calendarDone = true, sheetsDone = true;
  let failure;
  if (needsCalendar(cfg,revision)) {
    try {
      calendarDone = await calendarSync(api,cfg,workspace,data.bookings,revision,checkpoint);
      if (calendarDone) {
        cfg.calendarRevision = revision;
        cfg.calendarFormat = calendarFormat;
      }
    } catch (error) {
      failure = error;
    }
  }
  if (needsSheets(cfg,revision)) {
    sheetsDone = await sheetSync(api,cfg,workspace,data.transactions,checkpoint);
    if (sheetsDone) {
      cfg.sheetsRevision = revision;
      cfg.driveFormat = driveFormat;
    }
  }
  if (failure) throw failure;
  return calendarDone && sheetsDone;
}
