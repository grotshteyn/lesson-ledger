// E3 screenshot matrix. Actual application and the authenticated E2 mock, with
// deterministic UI-only fixtures. No production database calls or writes.
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {chromium} from 'playwright';
const source=readFileSync(new URL('./e2-browser.test.mjs',import.meta.url),'utf8');
const match=source.match(/const mockModule = \x60([\s\S]*?)\x60;/);
assert.ok(match,'Existing E2 authenticated mock found');
const day=offset=>{const d=new Date();d.setDate(d.getDate()+offset);return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')};
const students=[],versions=[],events=[],lessons=[];
const people=[
 ['Anna Becker','Mathematik',45,35,'active'],
 ['Anna Schulz','Klavier',30,25,'active'],
 ['Ben Wagner','Englisch',60,120,'active','monthly_flat'],
 ['Clara Hoffmann','Mathematik',45,35,'active'],
 ['David Klein','Gitarre',45,30,'paused'],
 ['Emma Fischer','Mathematik',45,35,'ended'],
 ['Jonas Meyer','Klavier',30,25,'ended']
];
people.forEach(([name,subject,minutes,price,status,billing],i)=>{
 const id='visual-student-'+(i+1);
 students.push({id,ledger_id:'ledger-1',created_at:'2026-01-01T00:00:00Z'});
 versions.push({id:'visual-version-'+(i+1),student_id:id,ledger_id:'ledger-1',effective_from:'2026-01-01',start_date:'2026-01-01',created_at:'2026-01-01T00:00:00Z',student_name:name,nickname:i===0?'Anni':'',subject,minutes,lessons_per_week:1,billing_mode:billing||'per_lesson',rate:billing?null:price,monthly_fee:billing?price:null,payer_name:'Martina Becker',payer_email:'payer@example.de',payer_address:{street:'Seestraße 12',postcode:'78464',city:'Konstanz',country:'Deutschland'}});
 if(status!=='active')events.push({student_id:id,event_type:status==='paused'?'pause':'end',effective_from:'2026-01-01',pause_until:status==='paused'?'2099-01-06':null,created_at:'2026-01-01T00:00:00Z'});
});
[-1,-3,-5,-7,-10,-12,-14].forEach((offset,i)=>{
 const studentIndex=[3,2,0,1,3,0,1][i],s=versions[studentIndex];
 lessons.push({id:'visual-lesson-'+(i+1),student_id:s.student_id,lesson_date:day(offset),status:i===3?'cancelled_billable':'held',minutes:s.minutes,rate:s.rate??0,billing_mode:s.billing_mode,created_at:'2026-11-22T12:00:00Z',invoice_id:null,replaces_lesson_id:null});
});
const fixture={students,versions,events,seq:people.length,lessons};
let mock=match[1].replace('const state={students:[],versions:[],events:[],seq:0};','const state='+JSON.stringify(fixture)+';');
assert.notEqual(mock,match[1],'Fixture was injected');
mock=mock.replace("name==='active_lessons'||name==='lesson_voids'||name==='lessons'?[]:state.students","name==='active_lessons'||name==='lessons'?state.lessons:name==='lesson_voids'?[]:state.students");
mock=mock.replace('return {select(){return this},eq(k,v)', 'return {single(){this._single=true;return this},select(){return this},eq(k,v)');
mock=mock.replace('resolve({data:rows.filter(x=>filters.every(f=>f(x))),error:null})','{const result=rows.filter(x=>filters.every(f=>f(x)));resolve({data:this._single?result[0]||null:result,error:null})}');
mock=mock.replace("if(name==='set_student_status')","if(name==='log_lesson_v2'||name==='replace_lesson_v2')return {data:{state:'duplicate'},error:null};\n  if(name==='set_student_status')");
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,locale:'de-DE'});
const page=await context.newPage(),errors=[],records=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('dialog',d=>d.accept());
await page.route('https://esm.sh/**',route=>route.fulfill({status:200,contentType:'application/javascript',headers:{'access-control-allow-origin':'*'},body:mock}));
mkdirSync('browser-evidence/e3-all',{recursive:true});
async function capture(name,selector){
 await page.locator(selector).first().waitFor({state:'visible',timeout:15000});
 await page.evaluate(async()=>{window.scrollTo(0,0);await document.fonts.ready});
 const path='browser-evidence/e3-all/'+name+'.png';
 await page.screenshot({path,animations:'disabled',fullPage:false});
 const metrics=await page.evaluate(()=>{
  const r=s=>{const e=document.querySelector(s);if(!e)return null;const b=e.getBoundingClientRect(),c=getComputedStyle(e);return {x:Math.round(b.x),y:Math.round(b.y),width:Math.round(b.width),height:Math.round(b.height),fontSize:c.fontSize,lineHeight:c.lineHeight}};
  return {width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,header:r('.ll-header'),nav:r('.ll-tabs'),title:r('.e2-heading h1,.ll-heading h2,.ll-header h1'),firstRow:r('.e2-student-row,.ll-list-row'),form:r('form'),dialog:r('.ll-sheet'),floating:r('.ll-floating,.e2-floating'),buttons:[...document.querySelectorAll('button')].filter(x=>x.getBoundingClientRect().width>0).length};
 });
 assert.ok(metrics.scrollWidth<=390,'Horizontal overflow on '+name+': '+metrics.scrollWidth);
 records.push({name,path,metrics});
 console.log('Captured '+name);
}
try{
 await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded'});
 await page.locator('[data-ll-tab="students"]').waitFor();
 await page.locator('[data-ll-tab="lessons"]').click();
 await capture('01-lessons-overview','.ll-groups');
 await page.locator('[data-ll-tab="students"]').click();
 await page.locator('[data-student]').first().waitFor();
 await capture('02-students-overview','#e2-results');
 await page.locator('[data-student]').first().click();
 await capture('03-student-lessons','#e2-lessons');
 await page.locator('[data-tab="details"]').click();
 await capture('04-student-details','.e2-card');
 await page.locator('[data-edit="pricing"]').click();
 await capture('06-edit-lessons-price','#e2-edit');
 await page.locator('[data-choice="billing_mode"][data-value="monthly_flat"]').click();
 assert.equal(await page.locator('#e2-edit [name="billing_mode"]').inputValue(),'monthly_flat');
 await page.locator('[data-choice="billing_mode"][data-value="per_lesson"]').click();
 await page.locator('[data-choice="length_choice"][data-value="60"]').click();
 assert.equal(await page.locator('#e2-edit [name="minutes"]').inputValue(),'60');
 await page.locator('[data-choice="location"][data-value="online"]').click();
 assert.equal(await page.locator('#e2-edit [name="location"]').inputValue(),'online');
 await page.locator('[data-choice="effective_choice"][data-value="next"]').click();
 assert.match(await page.locator('#e2-edit [name="effective_from"]').inputValue(),/^[0-9]{4}-[0-9]{2}-01$/);
 await page.locator('[data-cancel]').click();
 await page.locator('[data-finish]').click();
 await page.locator('[data-add]').click();
 await capture('05-new-student','#e2-form');
 assert.equal(await page.locator('#e2-form [data-choice="length_choice"]').count(),5);
 assert.equal(await page.locator('#e2-form [data-choice="billing_mode"]').count(),2);
 await page.locator('[data-cancel]').click();
 await page.locator('[data-ll-tab="invoices"]').click();
 await capture('07-invoices','.ll-invoices-empty');
 await page.locator('[data-ll-tab="lessons"]').click();
 await page.locator('[data-action="new"]').click();
 await capture('08-new-lesson','.ll-form-card');
 assert.equal(await page.locator('.ll-status-segment button').count(),2);
 assert.equal(await page.locator('.ll-date-row').isVisible(),false);
 assert.equal(await page.locator('.ll-quick [data-action="today"]').getAttribute('aria-pressed'),'true');
 await page.locator('.ll-status-segment [data-status="cancelled_billable"]').click();
 assert.equal(await page.locator('#ll-status').inputValue(),'cancelled_billable');
 await page.locator('.ll-status-segment [data-status="held"]').click();
 await page.locator('[data-action="calendar"]').click();
 await capture('12-pick-date','#ll-calendar');
 await page.locator('.ll-sheet [data-action="cancel"]').click();
 await page.locator('[data-action="list"]').first().click();
 await page.locator('[data-open]').first().click();
 await capture('09-edit-lesson','.ll-form-card');
 assert.equal(await page.locator('.ll-status-segment button').count(),2);
 await page.locator('.ll-quick [data-action="calendar"]').click();
 await page.locator('.ll-sheet [data-day]').filter({hasText:/^10$/}).first().click();
 await capture('09b-edit-lesson-form','#ll-date');
 await page.locator('[data-action="list"]').first().click();
 await page.locator('[data-action="new"]').click();
 await page.locator('[data-pick]').first().click();
 await page.locator('#ll-date').evaluate((el,value)=>{el.value=value;el.dispatchEvent(new Event('change',{bubbles:true}))},day(-5));
 await page.locator('[data-action="save"]').click();
 console.log('Duplicate test:',JSON.stringify(await page.evaluate(()=>({date:document.querySelector('#ll-date')?.value,student:document.querySelector('#ll-selection')?.textContent,error:document.querySelector('#ll-error')?.textContent,overlay:!!document.querySelector('.ll-compare'),calls:globalThis.__rpcCalls?.slice(-3)}))));
 await capture('10-duplicate-confirmation','.ll-compare');
 await page.locator('.ll-sheet [data-action="cancel"]').click();
 await page.locator('[data-action="list"]').first().click();
 await page.locator('[data-ll-tab="students"]').click();
 await page.locator('[data-student]').first().click();
 await page.locator('[data-new-lesson]').click();
 await capture('11-new-lesson-student','.ll-form-card');
 assert.equal(await page.locator('#ll-students').count(),0);
 assert.equal(await page.locator('.ll-status-segment button').count(),2);
 assert.deepEqual(errors,[],'No JavaScript page errors');
 writeFileSync('browser-evidence/e3-all/measurements.json',JSON.stringify({screens:records,reference:'Lesson Ledger E3 Lesson logging wireframes.pdf, pages 1-12',viewport:{width:390,height:844},errors},null,2));
 assert.equal(records.length,13);
}finally{await context.close();await browser.close();}
