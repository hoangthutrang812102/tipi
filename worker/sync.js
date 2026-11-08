const calendar = 'https://www.googleapis.com/calendar/v3/calendars';
const sheets = 'https://sheets.googleapis.com/v4/spreadsheets';
const drive = 'https://www.googleapis.com/drive/v3/files';
const vn = 'Asia/Ho_Chi_Minh';
const enc = encodeURIComponent;
const day = 86400000;
const service = {nail:'Nail', makeup:'Makeup', shared:'Chi phí chung'};

export async function digest(value) {
  const bytes = await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value)));
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2,'0')).join('');
}

export function eventFor(booking) {
  const start = new Date(booking.date+'T'+booking.time+':00+07:00');
  const end = new Date(start.getTime()+Number(booking.duration)*60000);
  return {
    summary: 'Tipi · '+(service[booking.service] || 'Lịch hẹn'),
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
      && sameTime(previous.end,body.end) && previous.visibility === body.visibility) continue;
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
    ['Thu chi '+month.slice(5)+'/'+month.slice(0,4)],
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

async function sheetSync(api,cfg,workspace,transactions,checkpoint) {
  cfg.files ??= {};
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
    if (cfg.files[month]?.hash === hash) continue;
    if (!budget--) return false;
    if (!cfg.files[month]?.id) {
      const tag = workspace+':'+month;
      const query = "trashed = false and mimeType = 'application/vnd.google-apps.spreadsheet' and appProperties has { key='tipiMonth' and value='"+tag+"' }";
      const {files} = await api(drive+'?q='+enc(query)+'&fields=files(id),nextPageToken&pageSize=2');
      if (files.length > 1) throw new Error('duplicate-month');
      const id = files[0]?.id || (await api(drive+'?fields=id','POST',{
        name:tabs[0][1][0][0],mimeType:'application/vnd.google-apps.spreadsheet',appProperties:{tipiMonth:tag}
      })).id;
      cfg.files[month] = {id};
      await checkpoint();
    }
    await updateMonth(api,cfg.files[month].id,tabs);
    cfg.files[month].hash = hash;
  }
  return true;
}

export async function reconcile(api,cfg,workspace,snapshot,checkpoint) {
  const {data,revision} = snapshot;
  let calendarDone = true, sheetsDone = true;
  let failure;
  if (cfg.calendar && cfg.calendarRevision !== revision) {
    try {
      calendarDone = await calendarSync(api,cfg,workspace,data.bookings,revision,checkpoint);
      if (calendarDone) cfg.calendarRevision = revision;
    } catch (error) {
      failure = error;
    }
  }
  if (cfg.sheets && cfg.sheetsRevision !== revision) {
    sheetsDone = await sheetSync(api,cfg,workspace,data.transactions,checkpoint);
    if (sheetsDone) cfg.sheetsRevision = revision;
  }
  if (failure) throw failure;
  return calendarDone && sheetsDone;
}
