import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
const url = 'https://zcszskoegwgcjgqsfmfx.supabase.co';
const owner = 'feb42e04-41d2-4e71-a377-ec882c3ea99b';
const ledger = '93def825-755a-4619-879c-d776e2e8db67';
const key = process.env.SUPABASE_PUBLISHABLE_KEY;
const email = process.env.TEST_USER_EMAIL;
const password = process.env.TEST_USER_PASSWORD;
assert(key && email && password, 'Missing test credentials');
let token;
async function request(path, body) {
 const response = await fetch(url+path,{method:body===undefined?'GET':'POST',headers:{apikey:key, 'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(30000)});
 const data=await response.json();
 if(!response.ok) throw new Error(path+' HTTP '+response.status+' '+(data.code??'')+' '+(path.startsWith('/auth/')?'authentication failed':data.message??''));
 return data;
}
const rpc=(name,args)=>request('/rest/v1/rpc/'+name,args);
const session=await request('/auth/v1/token?grant_type=password',{email,password});
assert.equal(session.user.id,owner,'Unexpected test account');
token=session.access_token;
const ledgers=await request('/rest/v1/ledgers?select=id,owner_id');
assert.deepEqual(ledgers,[{id:ledger,owner_id:owner}],'Unexpected visible ledgers');
console.log('PASS authenticated dedicated ledger');
const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const month=today.slice(0,7)+'-01';
const d=new Date(month+'T00:00:00Z');d.setUTCMonth(d.getUTCMonth()-1);
const past=d.toISOString().slice(0,10);
const tag='REGRESSION '+randomUUID();
const students=[];
const invoices=new Set();
const preview=(s,m)=>rpc('get_invoice_preview',{p_student_id:s,p_billing_month:m});
async function gross(s,m,n){const p=await preview(s,m);assert.equal(Number(p.gross_amount),n);return p;}
async function student(mode,price){
 const s=await rpc('create_student',{p_details:{student_name:tag+' '+mode,subject:'Regression',start_date:past,minutes:60,lessons_per_week:1,billing_mode:mode,price,payer_name:'Synthetic payer',payer_address:{street:'Test 1',postcode:'12345',city:'Test'},location:'online'}});
 students.push(s);console.log('Created test student '+s);return s;
}
async function lesson(s,date,rate){return rpc('log_lesson_v2',{p_student_id:s,p_lesson_date:date,p_rate:rate,p_minutes:60,p_status:'held',p_idempotency_key:randomUUID()});}
async function issue(s,m,k=randomUUID()){
 const a=await rpc('issue_invoice',{p_student_id:s,p_billing_month:m,p_idempotency_key:k});
 assert(a.invoice_id,'Missing invoice ID');invoices.add(a.invoice_id);return a;
}
async function cancel(id){await rpc('cancel_invoice',{p_invoice_id:id,p_idempotency_key:randomUUID()});invoices.delete(id);}
let failed=false;
try{
 const s=await student('per_lesson',40);
 await lesson(s,past,40);
 const p=await gross(s,past,40);
 assert.deepEqual(p.validation_errors,[],'Complete billing settings required on test ledger');
 const a=await issue(s,past);
 await lesson(s,past.slice(0,8)+'02',50);
 await lesson(s,month,30);
 await gross(s,past,0);await gross(s,month,80);
 const k=randomUUID(),b=await issue(s,month,k);
 assert.equal((await issue(s,month,k)).invoice_id,b.invoice_id);
 await gross(s,month,0);
 await cancel(a.invoice_id);await gross(s,past,40);
 await cancel(b.invoice_id);await gross(s,past,90);await gross(s,month,30);
 console.log('PASS supplemental allocation, replay, cancellation');
 const f=await student('monthly_flat',120);
 await gross(f,past,120);
 const c=await issue(f,past);await gross(f,past,0);
 await cancel(c.invoice_id);await gross(f,past,120);
 const e=await issue(f,past);assert.notEqual(c.invoice_id,e.invoice_id);
 console.log('PASS flat fee and reissue');
}catch(e){failed=true;console.error(e.message);}
finally{
 for(const id of invoices){try{await cancel(id);}catch(e){failed=true;console.error('Cleanup invoice '+id+': '+e.message);}}
 for(const s of students){try{await rpc('set_student_status',{p_student_id:s,p_event:'end',p_effective_from:month});}catch(e){failed=true;console.error('Cleanup student '+s+': '+e.message);}}
 console.log('Historical synthetic records retained; run '+tag);
}
if(failed)process.exitCode=1;
