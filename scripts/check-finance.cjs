const {webkit}=require(process.env.TIPI_PLAYWRIGHT_PATH || 'playwright');
const path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
(async()=>{
 const browser=await webkit.launch();
 try {
  for(const width of [320,390,768,1024,1440]){
   const page=await browser.newPage({viewport:{width,height:900},hasTouch:width<1250});
   page.setDefaultTimeout(6000);
   const errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/*',route=>{
    const u=new URL(route.request().url());
    if(u.origin!=='https://tipi.test')return route.abort();
    const filename=u.pathname==='/'?'index.html':u.pathname.slice(1);
    if(!/^[a-z][\w.-]+\.(html|css|js)$/.test(filename))return route.abort();
    return route.fulfill({path:path.join(root,filename)});
   });
   await page.goto('https://tipi.test');
   await page.evaluate(()=>document.querySelector('[data-view=finance]').click());
   const load=async n=>page.evaluate(n=>{
    const profile=window.tipiApp.snapshot().profile;
    const transactions=Array.from({length:n},(_,i)=>({id:i+1,title:'Giao dịch dài để kiểm tra bố cục không che ngày '+i,
      note:'Ghi chú mẫu',amount:100000,kind:i%2?'expense':'income',date:'2026-11-14',service:'nail'}));
    window.tipiApp.load({profile,bookings:[],transactions});
    const picker=document.querySelector('#financeMonth');picker.value='2026-11';picker.dispatchEvent(new Event('change'));
   },n);
   const rows=()=>page.locator('#transactionTable .transaction-row:not(.head)');
   const next=page.locator('[data-finance-page="1"]'),prev=page.locator('[data-finance-page="-1"]');
   for(const n of [0,20,21,40,41]){
    await load(n);
    assert.equal(await rows().count(),Math.min(n,20));
    assert.equal(await page.locator('#transactionPagination').isVisible(),n>20);
    if(n>20){
     while(await next.isEnabled())await next.click();
     assert.equal(await rows().count(),n%20||20);
     assert.equal(await next.isDisabled(),true);
     assert.equal(await page.locator('#financeIncome').textContent(),new Intl.NumberFormat('vi-VN').format(Math.ceil(n/2)*100000)+' ₫');
     while(await prev.isEnabled())await prev.click();
    }
   }
   const layout=await rows().first().evaluate(row=>{
    const date=row.querySelector('.transaction-date'),kind=row.querySelector('.transaction-kind');
    const a=date.getBoundingClientRect(),r=row.getBoundingClientRect();
    return {dateVisible:getComputedStyle(date).display!=='none'&&a.width>0,kindVisible:getComputedStyle(kind).display!=='none',
      overflow:row.scrollWidth>row.clientWidth+1||a.right>r.right+1,format:date.textContent,
      pageOverflow:document.documentElement.scrollWidth>innerWidth};
   });
   assert.equal(layout.dateVisible,true,JSON.stringify({width,layout}));
   assert.equal(layout.kindVisible,true,JSON.stringify({width,layout}));
   assert.equal(layout.overflow||layout.pageOverflow,false,JSON.stringify({width,layout}));
   assert.equal(layout.format,'14/11/2026');
   await next.click();await next.click();
   page.once('dialog',dialog=>dialog.accept());
   await page.locator('[data-delete-transaction]').click();
   assert.equal(await rows().count(),20);
   assert.equal(await page.locator('#transactionPage').textContent(),'Trang 2/2');
   // Changing the kind must return to page one.
   await page.locator('[data-kind-filter=income]').click();
   assert.equal(await page.locator('#transactionPage').textContent(),'Trang 1/1');
   await page.locator('[data-kind-filter=all]').click();
   await page.locator('[data-edit-transaction]').first().click();
   await page.locator('#financeForm [name=date]').fill('2026-11-01');
   await page.locator('#financeForm [type=submit]').click();
   await page.waitForFunction(()=>!document.querySelector('#financeModal.open'));
   assert.equal(await page.locator('#transactionPage').textContent(),'Trang 2/2');
   assert.equal(await page.locator(':focus').getAttribute('data-edit-transaction'),'41');
   assert.equal((await rows().last().locator('time').textContent()),'01/11/2026');
   // Workspace change resets the page.
   await page.evaluate(()=>{
    const input=document.querySelector('#workspace');input.value='makeup';input.dispatchEvent(new Event('change'));
   });
   assert.equal(await rows().count(),0);
   assert.equal(await page.locator('#transactionPage').textContent(),'Trang 1/1');
   assert.deepEqual(errors,[]);
   console.log('PASS WebKit width',width,': boundary counts, totals, dates, filters, deletion, edit destination and focus');
   await page.close();
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
