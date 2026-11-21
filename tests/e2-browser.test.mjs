import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const mockModule = `
const state={students:[],versions:[],events:[],seq:0};
globalThis.__e2Mock=state;
const now=()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')};
const current=id=>state.versions.filter(v=>v.student_id===id&&v.effective_from<=now()).sort((a,b)=>b.effective_from.localeCompare(a.effective_from)||b.created_at.localeCompare(a.created_at))[0];
const status=id=>{const e=state.events.filter(x=>x.student_id===id&&x.effective_from<=now()).at(-1);return e?e.event_type==='pause'?(e.pause_until&&e.pause_until<=now()?'active':'paused'):e.event_type==='restart'?'active':e.event_type==='end'?'ended':'removed':'active'};
function table(name){let filters=[];return {select(){return this},eq(k,v){filters.push(x=>x[k]===v);return this},lte(k,v){filters.push(x=>x[k]<=v);return this},order(){return this},limit(){return this},then(resolve,reject){let rows=name==='billing_settings_versions'?[{ledger_id:'ledger-1',effective_from:'2026-01-01',teacher_name:'Test Teacher',teacher_address:{street:'Main 1',postcode:'80331',city:'München'},teacher_email:'test@example.com',vat_mode:'small_business',iban:'DE89370400440532013000',payment_days:14}]:name==='student_versions'?state.versions:name==='student_status_events'?state.events:state.students;resolve({data:rows.filter(x=>filters.every(f=>f(x))),error:null})}}}
export function createClient(){return {
 auth:{getUser:async()=>({data:{user:{id:'user-1',email:'test@example.com'}}}),onAuthStateChange:()=>{},signOut:async()=>({error:null})},
 from:table,
 rpc:async(name,args)=>{
  if(name==='ensure_my_ledger')return {data:'ledger-1',error:null};
  if(name==='create_student'){
   const id='student-'+(++state.seq),d=args.p_details;
   state.students.push({id,ledger_id:'ledger-1'});
   state.versions.push({id:'version-'+state.seq,student_id:id,ledger_id:'ledger-1',effective_from:d.start_date,created_at:new Date().toISOString(),student_name:d.student_name,nickname:d.nickname,subject:d.subject,minutes:d.minutes,lessons_per_week:d.lessons_per_week,billing_mode:d.billing_mode,rate:d.billing_mode==='per_lesson'?Number(d.price):null,monthly_fee:d.billing_mode==='monthly_flat'?Number(d.price):null,payer_name:d.payer_name,payer_email:d.payer_email,payer_address:d.payer_address,location:d.location});
   return {data:id,error:null};
  }
  if(name==='student_details_at')return {data:current(args.p_student_id)?[current(args.p_student_id)]:[],error:null};
  if(name==='student_status_at')return {data:status(args.p_student_id),error:null};
  if(name==='find_students'){
   const term=(args.p_query||'').toLowerCase();
   return {data:state.students.map(s=>({...current(s.id),student_id:s.id,status:status(s.id)})).filter(v=>v.student_name&&v.status===args.p_status&&(v.student_name.toLowerCase().includes(term)||(v.nickname||'').toLowerCase().includes(term))),error:null};
  }
  if(name==='change_student'){
   const old=current(args.p_student_id),c=args.p_changes;
   state.versions.push({...old,...c,id:'version-'+(++state.seq),effective_from:args.p_effective_from,created_at:new Date(Date.now()+state.seq*1000).toISOString(),rate:c.billing_mode==='per_lesson'?Number(c.price):null,monthly_fee:c.billing_mode==='monthly_flat'?Number(c.price):null});
   return {data:'version-'+state.seq,error:null};
  }
  if(name==='set_student_status'){state.events.push({student_id:args.p_student_id,event_type:args.p_event,effective_from:args.p_effective_from,pause_until:args.p_pause_until,created_at:new Date().toISOString()});return {data:'event-'+state.events.length,error:null};}
  return {data:null,error:{message:'Unexpected RPC '+name}};
 }
}};
`;

test('E2 browser smoke: add, edit, pause and search',async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const page=await browser.newPage();
 page.on('dialog',d=>d.accept());
 page.on('pageerror',e=>{throw e});
 await page.route('https://esm.sh/**',route=>route.fulfill({status:200,contentType:'application/javascript',headers:{'access-control-allow-origin':'*'},body:mockModule}));
 try{
  await page.goto('http://127.0.0.1:8765/',{waitUntil:'networkidle'});
  await page.locator('#addStudent').click();
  await page.locator('#newStudent').click();
  await page.locator('#student_name').fill('Anna Test');
  await page.locator('#subject').fill('Maths');
  await page.locator('#price').fill('35');
  await page.locator('#payer_name').fill('Parent Test');
  await page.locator('#saveStudent').click();
  await page.locator('#changeStudent').waitFor();
  assert.match(await page.locator('main').innerText(),/Anna Test/);
  await page.locator('#changeStudent').click();
  await page.locator('#price').fill('38');
  await page.locator('#saveChange').click();
  await page.locator('#statusStudent').waitFor();
  assert.match(await page.locator('main').innerText(),/38 € pro Stunde/);
  await page.locator('#statusStudent').click();
  await page.locator('#saveStatus').click();
  await page.locator('#backStudents').click();
  await page.locator('#studentFilter').selectOption('paused');
  await page.waitForTimeout(500);
  const list=await page.locator('#studentResults').innerText();
  const state=await page.evaluate(()=>({events:globalThis.__e2Mock.events,versions:globalThis.__e2Mock.versions}));
  assert.match(list,/Anna Test/,'Paused student missing: '+JSON.stringify({list,state}));
 }finally{await browser.close()}
});
