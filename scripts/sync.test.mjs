import assert from 'node:assert/strict';
import test from 'node:test';
import {eventFor,monthTabs,reconcile} from '../worker/sync.js';

const booking = {id:1,date:'2099-11-03',time:'23:00',duration:60,service:'nail',name:'Private',phone:'0123'};
const tx = {id:1,date:'2026-11-01',title:'=NOT_A_FORMULA()',amount:200,kind:'income',service:'nail'};
test('calendar timestamps stay in Vietnam time without exposing customer details',() => {
  const event = eventFor(booking);
  assert.equal(event.start.dateTime,'2099-11-03T16:00:00.000Z');
  assert.equal(event.end.dateTime,'2099-11-03T17:00:00.000Z');
  assert.equal(event.start.timeZone,'Asia/Ho_Chi_Minh');
  assert.doesNotMatch(JSON.stringify(event),/Private|0123/);
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
  assert.equal(await run(1,[booking]),true);
  assert.equal(await run(2,[{...booking,time:'21:00'}]),true);
  assert.equal(events.size,1);
  assert.equal(await run(3,[{...booking,cancelledAt:'2099-11-01'}]),true);
  assert.equal(events.size,0);
  assert.deepEqual(calls,['GET','POST','GET','PATCH','GET','DELETE']);
});
test('moving a transaction updates both files and treats formula-like text as text',async () => {
  const cfg = {sheets:true};
  const updates = [];
  let nextId=0;
  const api = async (url,method='GET',body) => {
    if (url.includes('drive/v3')) return method==='POST'?{id:'file'+(++nextId)}:{files:[]};
    if (method==='GET') return {sheets:[]};
    updates.push({url,body});
  };
  const run = (revision,transactions) => reconcile(api,cfg,'shop',{revision,data:{bookings:[],transactions}},async () => {});
  await run(1,[tx]);
  await run(2,[{...tx,date:'2026-12-01'}]);
  await run(2,[{...tx,date:'2026-12-01'}]);
  assert.equal(nextId,2);
  assert.equal(updates.length,3);
  assert.match(JSON.stringify(updates[0]),/"stringValue":"=NOT_A_FORMULA\(\)"/);
  assert.doesNotMatch(JSON.stringify(updates[1]),/NOT_A_FORMULA/);
  assert.match(updates[1].url,/file1:batchUpdate/);
  assert.match(updates[2].url,/file2:batchUpdate/);
});
