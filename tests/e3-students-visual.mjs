// Screenshot the real checked-out application using the authenticated mock from E2.
// No production Supabase requests, credentials, or database changes.
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {chromium} from 'playwright';

const source=readFileSync(new URL('./e2-browser.test.mjs',import.meta.url),'utf8');
const match=source.match(/const mockModule = \x60([\s\S]*?)\x60;/);
assert.ok(match,'Existing authenticated E2 mock must remain available');
const people=[
 ['Anna Becker','Mathematik',45,35,'active'],
 ['Anna Schulz','Klavier',30,25,'active'],
 ['Ben Wagner','Englisch',60,120,'active','monthly_flat'],
 ['Clara Hoffmann','Mathematik',45,35,'active'],
 ['David Klein','Gitarre',45,30,'paused'],
 ['Emma Fischer','Mathematik',45,35,'ended'],
 ['Jonas Meyer','Klavier',30,25,'ended']
];
const students=[],versions=[],events=[];
people.forEach(([name,subject,minutes,price,status,billing],i)=>{
 const id='visual-student-'+(i+1);
 students.push({id,ledger_id:'ledger-1',created_at:'2026-01-01T00:00:00Z'});
 versions.push({id:'visual-version-'+(i+1),student_id:id,ledger_id:'ledger-1',effective_from:'2026-01-01',created_at:'2026-01-01T00:00:00Z',student_name:name,nickname:'',subject,minutes,lessons_per_week:1,billing_mode:billing||'per_lesson',rate:billing?null:price,monthly_fee:billing?price:null});
 if(status!=='active')events.push({student_id:id,event_type:status==='paused'?'pause':'end',effective_from:'2026-01-01',pause_until:status==='paused'?'2099-01-06':null,created_at:'2026-01-01T00:00:00Z'});
});
const fixture={students,versions,events,seq:people.length};
const needle='const state={students:[],versions:[],events:[],seq:0};';
assert.ok(match[1].includes(needle),'Mock state initializer changed');
const mock=match[1].replace(needle,'const state='+JSON.stringify(fixture)+';');
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1});
const page=await context.newPage();
const errors=[];
page.on('pageerror',e=>errors.push(e.message));
await page.route('https://esm.sh/**',route=>route.fulfill({status:200,contentType:'application/javascript',headers:{'access-control-allow-origin':'*'},body:mock}));
mkdirSync('browser-evidence/students',{recursive:true});
try{
 await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded'});
 await page.locator('[data-ll-tab="students"]').waitFor({timeout:15000});
 await page.locator('[data-ll-tab="students"]').click();
 await page.locator('[data-student]').first().waitFor({timeout:15000});
 await page.locator('[data-student]').last().waitFor();
 await page.evaluate(()=>document.fonts.ready);
 const data=await page.evaluate(()=>{
  const measure=sel=>{const el=document.querySelector(sel);if(!el)return null;const b=el.getBoundingClientRect(),c=getComputedStyle(el);return {x:+b.x.toFixed(1),y:+b.y.toFixed(1),width:+b.width.toFixed(1),height:+b.height.toFixed(1),fontSize:c.fontSize,fontWeight:c.fontWeight,lineHeight:c.lineHeight,padding:c.padding,borderRadius:c.borderRadius,background:c.backgroundColor}};
  return {viewport:{width:innerWidth,height:innerHeight},documentWidth:document.documentElement.scrollWidth,groups:[...document.querySelectorAll('.e2-group h2')].map(x=>x.textContent.trim()),rows:[...document.querySelectorAll('[data-student]')].map(x=>({name:x.querySelector('strong')?.textContent,...(()=>{const b=x.getBoundingClientRect();return {y:b.y,height:b.height}})()})),measurements:Object.fromEntries(['.ll-header','.ll-header h1','.ll-settings','.ll-content','.e2-screen','.e2-search','.e2-search input','.e2-group h2','.e2-student-list','.e2-student-row','.e2-row-main strong','.e2-row-main small','.e2-row-price','.e2-floating button','.ll-tabs','.ll-tab','.ll-tab span:last-child'].map(s=>[s,measure(s)])),navLabels:[...document.querySelectorAll('.ll-tab span:last-child')].map(x=>x.textContent),selectedTab:document.querySelector('[data-ll-tab="students"]')?.getAttribute('aria-current')};
 });
 writeFileSync('browser-evidence/students/measurements.json',JSON.stringify({actual:data,reference:{viewport:{width:390,height:844},header:{padding:'20px 20px 12px',titleFontSize:'22px'},content:{padding:'16px 20px 96px'},searchHeight:44,rowMinHeight:56,listRadius:10,action:{widthPercent:72,height:56,bottom:92,fontSize:17},nav:{minHeight:56,bottomPadding:16,topBorderActive:3}}},null,2));
 await page.screenshot({path:'browser-evidence/students/students-overview-390x844.png',fullPage:false,animations:'disabled'});
 assert.equal(data.rows.length,7,'Seven deterministic visual fixture students');
 assert.equal(data.groups.length,3,'Active, paused and ended sections');
 assert.deepEqual(data.rows.map(x=>x.name),people.map(x=>x[0]),'Sorted students in wireframe order');
 assert.ok(data.documentWidth<=390,'No horizontal overflow');
 assert.equal(data.selectedTab,'page','Students tab active');
 assert.equal(data.measurements['.e2-search input'].height,44,'Wireframe search field height');
 assert.ok(data.rows.every(x=>x.height>=56),'Wireframe minimum row height');
 assert.deepEqual(errors,[],'No page errors');
 console.log('Students screenshot saved, metrics:',JSON.stringify(data,null,2));
}finally{await context.close();await browser.close();}
