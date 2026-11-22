import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const mockModule = `
const state={students:[],versions:[],events:[],seq:0};
globalThis.__e2Mock=state;globalThis.__rpcCalls=[];
const now=()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')};
const current=id=>state.versions.filter(v=>v.student_id===id&&v.effective_from<=now()).sort((a,b)=>b.effective_from.localeCompare(a.effective_from)||b.created_at.localeCompare(a.created_at))[0];
const status=id=>{const e=state.events.filter(x=>x.student_id===id&&x.effective_from<=now()).at(-1);return e?e.event_type==='pause'?(e.pause_until&&e.pause_until<=now()?'active':'paused'):e.event_type==='restart'?'active':e.event_type==='end'?'ended':'removed':'active'};
function table(name){let filters=[];return {select(){return this},eq(k,v){filters.push(x=>x[k]===v);return this},lte(k,v){filters.push(x=>x[k]<=v);return this},gte(k,v){filters.push(x=>x[k]>=v);return this},order(){return this},limit(){return this},then(resolve,reject){let rows=name==='billing_settings_versions'?[{ledger_id:'ledger-1',effective_from:'2026-01-01',teacher_name:'Test Teacher',teacher_address:{street:'Main 1',postcode:'80331',city:'München'},teacher_email:'test@example.com',vat_mode:'small_business',iban:'DE89370400440532013000',payment_days:14}]:name==='student_versions'?state.versions:name==='student_status_events'?state.events:name==='active_lessons'||name==='lesson_voids'||name==='lessons'?[]:state.students;resolve({data:rows.filter(x=>filters.every(f=>f(x))),error:null})}}}
export function createClient(){return {
 auth:{getUser:async()=>({data:{user:{id:'user-1',email:'test@example.com'}}}),onAuthStateChange:()=>{},signOut:async()=>({error:null})},
 from:table,
 rpc:async(name,args)=>{
  globalThis.__rpcCalls.push({name,args});
  if(name==='ensure_my_ledger')return {data:'ledger-1',error:null};
  if(name==='create_student'){
   const id='student-'+(++state.seq),d=args.p_details;
   state.students.push({id,ledger_id:'ledger-1',created_at:new Date().toISOString()});
   state.versions.push({id:'version-'+state.seq,student_id:id,ledger_id:'ledger-1',effective_from:d.start_date,created_at:new Date().toISOString(),student_name:d.student_name,nickname:d.nickname,subject:d.subject,minutes:d.minutes,lessons_per_week:d.lessons_per_week,billing_mode:d.billing_mode,rate:d.billing_mode==='per_lesson'?Number(d.price):null,monthly_fee:d.billing_mode==='monthly_flat'?Number(d.price):null,payer_name:d.payer_name,payer_email:d.payer_email,payer_address:d.payer_address,location:d.location});
   return {data:id,error:null};
  }
  if(name==='student_details_at')return {data:current(args.p_student_id)?[current(args.p_student_id)]:[],error:null};
  if(name==='student_status_at')return {data:status(args.p_student_id),error:null};
  if(name==='find_students'){
   const term=(args.p_query||'').toLowerCase();
   return {data:state.students.map(s=>({...current(s.id),student_id:s.id,status:status(s.id)})).filter(v=>v.student_name&&v.status===args.p_status&&(v.student_name.toLowerCase().includes(term)||(v.nickname||'').toLowerCase().includes(term))),error:null};
  }
  if(name==='change_student'||name==='change_student_with_repricing'){
   const old=current(args.p_student_id),c=args.p_changes;
   state.versions.push({...old,...c,id:'version-'+(++state.seq),effective_from:args.p_effective_from,created_at:new Date(Date.now()+state.seq*1000).toISOString(),rate:(c.billing_mode||old.billing_mode)==='per_lesson'?Number(c.price??old.rate):null,monthly_fee:(c.billing_mode||old.billing_mode)==='monthly_flat'?Number(c.price??old.monthly_fee):null});
   return {data:'version-'+state.seq,error:null};
  }
  if(name==='set_student_status'){state.events.push({student_id:args.p_student_id,event_type:args.p_event,effective_from:args.p_effective_from,pause_until:args.p_pause_until,created_at:new Date().toISOString()});return {data:'event-'+state.events.length,error:null};}
  return {data:null,error:{message:'Unexpected RPC '+name}};
 }
}};
`;

const BASE='http://127.0.0.1:8765/';
async function startPage(browser,viewport={width:1280,height:800}){
 const context=await browser.newContext({viewport});
 const page=await context.newPage();
 const pageErrors=[],failedRequests=[];
 page.on('pageerror',e=>pageErrors.push(e.message));
 page.on('requestfailed',r=>failedRequests.push(r.url()+' '+r.failure()?.errorText));
 page.on('dialog',d=>d.accept());
 await page.route('https://esm.sh/**',route=>route.fulfill({status:200,contentType:'application/javascript',headers:{'access-control-allow-origin':'*'},body:mockModule}));
 await page.goto(BASE,{waitUntil:'domcontentloaded'});
 try{
  await page.locator('[data-ll-tab="students"]').waitFor({timeout:10000});
 }catch(e){
  throw new Error('Three-tab shell did not load: '+JSON.stringify({url:page.url(),body:(await page.locator('body').innerText()).slice(0,700),pageErrors,failedRequests})+'; '+e.message);
 }
 assert.equal(await page.locator('.ll-tab').count(),3,'exactly three navigation tabs');
 assert.equal(await page.locator('#loginForm').count(),0,'mock authenticated session must not show login');
 assert.equal(await page.locator('[role="alert"]:visible').filter({hasText:/Verbindung fehlgeschlagen|Keine Berechtigung|Anmelden/}).count(),0,'no visible auth/server error');
 assert.deepEqual(pageErrors,[],'JavaScript page errors during app boot');
 return {context,page,pageErrors,failedRequests};
}
async function openStudents(page){
 await page.locator('[data-ll-tab="students"]').click();
 await page.locator('#e2-results .e2-group').first().waitFor();
 assert.equal(await page.locator('#e2-results .e2-group').count(),3,'all three student status groups');
 assert.equal(await page.locator('[data-ll-tab="students"]').getAttribute('aria-current'),'page');
}
async function createStudent(page,name,{selfPays=false}={}){
 await page.locator('[data-add]').click();
 await page.locator('#e2-form').waitFor();
 assert.equal(await page.locator('.ll-tabs:visible').count(),0,'tab bar hidden on student form');
 await page.locator('[name="student_name"]').fill(name);
 await page.locator('[name="subject"]').fill('Mathematik');
 await page.locator('[name="price"]').fill('35');
 if(selfPays)await page.locator('[name="student_pays"]').check();
 else await page.locator('[name="payer_name"]').fill('Test Parent');
 await page.locator('#e2-form [type="submit"]').click();
 await page.locator('#e2-search').waitFor();
 assert.equal(await page.locator('[data-ll-tab="students"]').getAttribute('aria-current'),'page');
 await page.locator('[data-student]').filter({hasText:name}).click();
 await page.locator('[data-tab="details"]').click();
 assert.match(await page.locator('.e2-heading').innerText(),new RegExp(name));
}
test('E2: authenticated three-tab shell, add, pricing edit, pause and search',async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 try{
  const {context,page,pageErrors}=await startPage(browser);
  await openStudents(page);
  await createStudent(page,'Anna Test');
  await page.locator('[data-edit="pricing"]').click();
  await page.locator('#e2-edit [name="price"]').fill('38');
  await page.locator('#e2-edit [type="submit"]').click();
  await page.locator('[data-edit="pricing"]').waitFor();
  assert.match(await page.locator('.e2-screen').innerText(),/38,00/);
  await page.locator('[data-status]').click();
  await page.locator('#e2-status [type="submit"]').click();
  await page.locator('[data-tab="details"]').waitFor();
  await page.locator('[data-back]').click();
  await page.locator('#e2-search').fill('Anna');
  await page.locator('[data-student]').first().waitFor();
  assert.match(await page.locator('#e2-results').innerText(),/Anna Test/);
  const calls=await page.evaluate(()=>globalThis.__rpcCalls.map(c=>c.name));
  assert.ok(calls.includes('create_student'));
  assert.ok(calls.includes('change_student_with_repricing'));
  assert.ok(calls.includes('set_student_status'));
  assert.deepEqual(pageErrors,[]);
  await context.close();
 }finally{await browser.close()}
});
test('E2: 360px student create and detail without horizontal overflow',async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 try{
  const {context,page,pageErrors}=await startPage(browser,{width:360,height:780});
  await openStudents(page);
  await createStudent(page,'Mobile Student',{selfPays:true});
  const size=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,viewport:document.documentElement.clientWidth}));
  assert.ok(size.scroll<=size.viewport+1,'Horizontal overflow: '+JSON.stringify(size));
  assert.deepEqual(pageErrors,[]);
  await context.close();
 }finally{await browser.close()}
});
test('E1: three-tab navigation, settings entry and return without legacy Home',async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 try{
  const {context,page,pageErrors}=await startPage(browser);
  assert.equal(await page.locator('#settingsBtn').count(),0,'legacy settings selector is absent');
  assert.equal(await page.locator('#addStudent').count(),0,'legacy add selector is absent');
  assert.equal(await page.locator('[data-ll-tab]').count(),3);
  await page.locator('[data-ll-tab="invoices"]').click();
  await page.getByRole('heading',{name:'Noch keine Rechnungen'}).waitFor();
  await page.locator('[data-ll-tab="students"]').click();
  await page.locator('[data-add]').waitFor();
  await page.locator('[data-ll-settings]').click();
  await page.getByRole('heading',{name:/Einstellungen/}).first().waitFor();
  assert.deepEqual(pageErrors,[]);
  await context.close();
 }finally{await browser.close()}
});

test('E3 navigation: cancel a lesson from a student returns to that same student Stunden view',async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 try{
  const {context,page}=await startPage(browser,{width:390,height:844});
  await openStudents(page);
  await createStudent(page,'Return Context');
  await page.locator('[data-tab="lessons"]').click();
  await page.locator('[data-new-lesson]').click();
  await page.locator('[data-action="list"]').click();
  await page.locator('[data-tab="lessons"][aria-pressed="true"]').waitFor();
  assert.match(await page.locator('.e2-heading').innerText(),/Return Context/);
  assert.equal(await page.locator('[data-ll-tab="students"]').getAttribute('aria-current'),'page');
  await context.close();
 }finally{await browser.close();}
});
