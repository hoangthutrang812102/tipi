import assert from 'node:assert/strict';
import test from 'node:test';
import {eventFor,monthTabs,reconcile} from '../worker/sync.js';

const booking = {id:1,date:'2099-11-03',time:'23:00',duration:60,service:'nail',name:'Private',phone:'0123'};
const tx = {id:1,date:'2026-11-01',title:'=NOT_A_FORMULA()',amount:200,kind:'income',service:'nail'};
test('calendar title and private customer details use Vietnam time and escape HTML',() => {
  const event = eventFor({...booking,style:'A < B',contact:'zalo',price:200000,note:'Line 1\nLine 2',images:['do-not-send']});
  assert.equal(event.start.dateTime,'2099-11-03T16:00:00.000Z');
  assert.equal(event.end.dateTime,'2099-11-03T17:00:00.000Z');
  assert.equal(event.start.timeZone,'Asia/Ho_Chi_Minh');
  assert.equal(event.summary,'Tipi - Nail - Private');
  assert.equal(eventFor({...booking,service:'makeup'}).summary,'Tipi - Makeup - Private');
  assert.equal(event.visibility,'private');
  assert.match(event.description,/Số điện thoại: 0123/);
  assert.match(event.description,/Zalo.*A &lt; B.*200\.000.*Line 1<br>Line 2/);
  assert.doesNotMatch(JSON.stringify(event),/do-not-send|attendees/);
});
test('month clips weeks at boundaries and groups totals',() => {
  const tabs = monthTabs('2026-11',[tx,{...tx,id:2,date:'2026-11-02',kind:'expense',amount:30,service:'shared'}]);
  assert.equal(tabs.length,7);
  assert.deepEqual(tabs[0][1].at(-1),['Tổng cộng',200,30,170]);
  assert.equal(tabs[1][1][1][0],'2026-11-01');
  assert.equal(tabs[2][1][1][0],'2026-11-02');
});
test('reconciles calendar create, retry, update and cancellation',async () => {
  const events = new Map();
  const calls = [];
  const api = async (url,method='GET',body) => {
    calls.push(method);
    if (url.includes('?')) return {items:[...events.values()]};
    if (method==='POST') events.set(body.id,structuredClone(body));
    if (method==='PATCH') {
      const id = url.split('/').at(-1);
      events.set(id,{id,...structuredClone(body)});
    }
    if (method==='DELETE') events.delete(url.split('/').at(-1));
  };
  const cfg = {calendar:true,calendarId:'test'};
  const run = (revision,bookings) => reconcile(api,cfg,'shop',{revision,data:{bookings,transactions:[]}},async () => {});
  assert.equal(await run(1,[booking]),true);
  assert.equal(events.size,1);
  const id = [...events.keys()][0];
  assert.equal(await run(1,[booking]),true);
  assert.equal(await run(2,[{...booking,phone:'4567'}]),true);
  assert.equal(events.size,1);
  assert.match(events.get(id).description,/4567/);
  assert.equal(await run(3,[{...booking,cancelledAt:'2099-11-01'}]),true);
  assert.equal(events.size,0);
  assert.deepEqual(calls,['GET','POST','GET','PATCH','GET','DELETE']);
});
test('moving a transaction updates both files and treats formula-like text as text',async () => {
  const cfg = {sheets:true};
  const updates = [];
  const files = new Map();
  const api = async (url,method='GET',body) => {
    if (url.includes('drive/v3')) {
      const q = new URL(url).searchParams.get('q');
      if (method === 'POST') {
        const file = {...body,id:'file'+(files.size+1),parents:body.parents || ['my-drive']};
        files.set(file.id,file);
        return file;
      }
      if (q) return {files:[...files.values()].filter(f => q.includes("'"+f.mimeType+"'")
        && Object.values(f.appProperties).some(tag => q.includes("'"+tag+"'")))};
      return files.get(new URL(url).pathname.split('/').at(-1));
    }
    if (method==='GET') return {sheets:[]};
    updates.push({url,body});
  };
  const run = (revision,transactions) => reconcile(api,cfg,'shop',{revision,data:{bookings:[],transactions}},async () => {});
  await run(1,[tx]);
  await run(2,[{...tx,date:'2026-12-01'}]);
  await run(2,[{...tx,date:'2026-12-01'}]);
  assert.equal(files.size,4);
  assert.deepEqual(files.get('file2').parents,['file1']);
  assert.deepEqual(files.get('file3').parents,['file2']);
  assert.equal(files.get('file4').name,'Tipi - Thu chi 12/2026');
  assert.equal(updates.length,3);
  assert.match(JSON.stringify(updates[0]),/"stringValue":"=NOT_A_FORMULA\(\)"/);
  assert.doesNotMatch(JSON.stringify(updates[1]),/NOT_A_FORMULA/);
  assert.match(updates[1].url,/file3:batchUpdate/);
  assert.match(updates[2].url,/file4:batchUpdate/);
});

test('upgrades already synced events and monthly files without replacing their IDs',async () => {
  const cfg = {calendar:true,calendarId:'calendar',calendarRevision:7,sheets:true,sheetsRevision:7,
    files:{'2026-11':{id:'legacy-sheet',hash:'old'}}};
  const oldEvent = {...eventFor(booking),summary:'Tipi · Nail',description:undefined,id:'legacy-event',
    extendedProperties:{private:{tipiWorkspace:'shop',tipiBooking:'1'}}};
  const fileCalls = [];
  const eventCalls = [];
  const api = async (input,method='GET',body) => {
    const url = new URL(input);
    if (url.pathname.includes('/calendar/')) {
      if (method==='GET') return {items:[oldEvent]};
      eventCalls.push([method,url.pathname,body]);
      return {};
    }
    if (url.pathname.includes('/drive/')) {
      fileCalls.push([method,url,body]);
      if (url.searchParams.has('q')) return {files:[]};
      if (method==='POST') return {id:body.name==='2026'?'year':'root'};
      if (method==='GET') return {id:'legacy-sheet',name:'Thu chi 11/2026',parents:['old-parent'],
        appProperties:{tipiMonth:'shop:2026-11'}};
      return {};
    }
    return method==='GET'?{sheets:[]}:{};
  };
  const snapshot = {revision:7,data:{bookings:[booking],transactions:[tx]}};
  assert.equal(await reconcile(api,cfg,'shop',snapshot,async () => {}),true);
  assert.equal(eventCalls.length,1);
  assert.equal(eventCalls[0][0],'PATCH');
  assert.match(eventCalls[0][1],/legacy-event$/);
  assert.equal(cfg.files['2026-11'].id,'legacy-sheet');
  const [,url,body] = fileCalls.find(([method]) => method==='PATCH');
  assert.match(url.pathname,/legacy-sheet$/);
  assert.equal(url.searchParams.get('addParents'),'year');
  assert.equal(url.searchParams.get('removeParents'),'old-parent');
  assert.equal(body.name,'Tipi - Thu chi 11/2026');
  assert.equal(fileCalls.filter(([method]) => method==='POST').length,2);
  const previous = fileCalls.length;
  await reconcile(api,cfg,'shop',snapshot,async () => {});
  assert.equal(fileCalls.length,previous);
  assert.equal(eventCalls.length,1);
});
