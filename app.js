import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.57.0';
const supabase=createClient('https://zcszskoegwgcjgqsfmfx.supabase.co','sb_publishable_7U5badP6_IAFBOOYKNNF6A_ZW4XqSK0',{auth:{detectSessionInUrl:true,autoRefreshToken:true,persistSession:true}});
const root=document.querySelector('#app');let user=null,ledger=null,settings=null,step=0,draft={},editing=false;const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
const nextMonthFirst=()=>{const d=new Date();return `${d.getFullYear()+(d.getMonth()===11?1:0)}-${String((d.getMonth()+1)%12+1).padStart(2,'0')}-01`};
const steps=[['teacher_name','Welcher Name soll auf deinen Rechnungen stehen?'],['teacher_address','Wie lautet deine Postanschrift?'],['teacher_email','Unter welcher E-Mail-Adresse können dich Zahlende erreichen?'],['tax_number','Wie lautet deine Steuernummer?'],['vat_mode','Wie berechnest du Umsatzsteuer?'],['iban','Wohin sollen Zahlende überweisen?'],['payment_days','Wie viele Tage haben Zahlende zum Bezahlen?'],['cancellation_rule','Deine Stornoregel'],['summary','Alles richtig?']];
const escapeHTML=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const $=id=>document.getElementById(id);
const button=(label,id,kind='primary')=>'<button type="button" id="'+id+'" class="'+kind+'">'+label+'</button>';
const frame=(html,screen='')=>{document.body.className=screen;root.innerHTML='<main class="shell">'+html+'</main>'};
const err=e=>{const n=$('error');if(n)n.textContent=e?.message||String(e)};
const addr=()=>draft.teacher_address||{street:'',postcode:'',city:'',country:'Deutschland'};
const ibanValid=s=>{let v=(s||'').replace(/\s/g,'').toUpperCase();if(!/^[A-Z]{2}[0-9A-Z]{13,32}$/.test(v))return false;v=v.slice(4)+v.slice(0,4);let r=0;for(const c of v){const str=/[A-Z]/.test(c)?String(c.charCodeAt(0)-55):c;for(const digit of str)r=(r*10+Number(digit))%97}return r===1};
const missing=s=>[['tax_number','Steuernummer'],['vat_mode','Umsatzsteuer'],['iban','IBAN']].filter(([k])=>!s?.[k]||s[k]==='unsure');
const draftKey=()=>`ll-draft:${user?.id||'guest'}`;const stepKey=()=>`ll-step:${user?.id||'guest'}`;const lastUseKey=()=>`ll-last-use:${user?.id||'guest'}`;const DAY=86400000;let otpSentAt=0;const defaultDraft=()=>({teacher_name:'',teacher_address:{street:'',postcode:'',city:'',country:'Deutschland'},teacher_email:user?.email||'',tax_number:'',vat_mode:'',iban:'',bank_name:'',payment_days:14,cancellation_rule:'24h',phone:''});
function login(){frame('<div style="padding-top:8vh"><div style="width:70px;height:70px;border:1.5px solid #aaa;border-radius:15px;background:#f4f4f3"></div><h1 style="margin-top:24px">Lesson Ledger</h1><p class="muted">Lessons, notes and invoices for private teachers.</p></div><div class="card">'+'<label class="field">E-Mail-Adresse<input id="email" type="email" autocomplete="email" placeholder="du@beispiel.de"></label>'+button('Mit E-Mail fortfahren','emailBtn')+'<p id="error" class="error" role="alert"></p></div>','setup-screen');$('emailBtn').onclick=async()=>{const email=$('email').value.trim();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return err('Bitte gib eine gültige E-Mail-Adresse ein.');const {error}=await supabase.auth.signInWithOtp({email,options:{emailRedirectTo:location.href.split('?')[0].split('#')[0]}});if(error)return err(error);otpSentAt=Date.now();verify(email)}}
function verify(email){frame('<p class="eyebrow">Anmeldung</p><h1>Prüfe dein Postfach</h1><p>Wir haben eine Anmeldung an <strong>'+escapeHTML(email)+'</strong> geschickt.</p><p class="muted">Öffne den Link oder gib den sechsstelligen Code ein.</p><div class="card"><label class="field">Bestätigungscode<input id="otp" inputmode="numeric" maxlength="6" autocomplete="one-time-code"></label>'+button('Code bestätigen','check')+'<p id="error" class="error" role="alert"></p><button class="link" id="resend">Code erneut senden</button><button class="link" id="wrong">Falsche Adresse?</button></div>');$('wrong').onclick=login;$('resend').onclick=async()=>{if(Date.now()-otpSentAt<60000)return err('Bitte warte 60 Sekunden, bevor du einen neuen Code anforderst.');const {error}=await supabase.auth.signInWithOtp({email,options:{emailRedirectTo:location.href.split('?')[0].split('#')[0]}});if(error)return err(error);otpSentAt=Date.now();$('error').textContent='Ein neuer Code wurde angefordert.'};$('check').onclick=async()=>{const {error}=await supabase.auth.verifyOtp({email,token:$('otp').value.trim(),type:'email'});if(error)err(error);else await load()}}
async function load(){const {data:{user:u}}=await supabase.auth.getUser();user=u;if(!u)return login();const last=Number(localStorage.getItem(lastUseKey())||0);if(last&&Date.now()-last>30*DAY){await supabase.auth.signOut({scope:'local'});user=null;return login()}localStorage.setItem(lastUseKey(),String(Date.now()));let r=await supabase.rpc('ensure_my_ledger');if(r.error)return frame('<h1>Verbindung fehlgeschlagen</h1><p class="error">'+escapeHTML(r.error.message)+'</p>');ledger=r.data;const q=await supabase.from('billing_settings_versions').select('*').eq('ledger_id',ledger).lte('effective_from',today()).order('effective_from',{ascending:false}).order('created_at',{ascending:false}).limit(1);if(q.error)return frame('<p class="error">'+escapeHTML(q.error.message)+'</p>');settings=q.data?.[0]||null;if(settings)home();else{draft=JSON.parse(localStorage.getItem(draftKey())||'null')||defaultDraft();step=Math.min(8,Math.max(0,Number(localStorage.getItem(stepKey())||0)));setup()}}
function field(key,label,value='',type='text'){return '<label class="field">'+label+'<input id="'+key+'" type="'+type+'" value="'+escapeHTML(value)+'"></label>'}
function setup(){const [key,title]=steps[step];let body='';if(key==='teacher_address'){const a=addr();body=field('street','Straße und Hausnummer',a.street)+field('postcode','Postleitzahl',a.postcode)+field('city','Ort',a.city)+field('country','Land',a.country||'Deutschland')}
else if(key==='vat_mode'){body=[['small_business','Kleinunternehmer (§ 19 UStG)','Ich berechne keine Umsatzsteuer.'],['exempt_teaching','Steuerfreier Unterricht (§ 4 Nr. 21 UStG)','Ich habe eine entsprechende Bescheinigung.'],['regular_19','Regulär 19 %','Meine Preise enthalten Umsatzsteuer.'],['unsure','Ich bin mir nicht sicher','Rechnungen bleiben gesperrt, bis du dich entschieden hast.']].map(([v,l,d])=>'<label class="choice"><input type="radio" name="vat_mode" value="'+v+'" '+(draft.vat_mode===v?'checked':'')+'><strong>'+l+'</strong><p class="muted small">'+d+'</p></label>').join('')}
else if(key==='iban')body=field('iban','IBAN',draft.iban)+field('bank_name','Bankname (optional)',draft.bank_name);
else if(key==='cancellation_rule')body='<div class="notice">Kostenlos bis 24 Stunden vor dem Termin. Danach wird die Stunde berechnet.</div>';
else if(key==='summary')body='<p class="muted small">Mit Zurück kannst du Angaben vor dem Speichern korrigieren.</p>'+Object.entries({Name:draft.teacher_name,Adresse:Object.values(addr()).join(', '),Kontakt:draft.teacher_email,Steuernummer:draft.tax_number||'Fehlt',Umsatzsteuer:draft.vat_mode||'Fehlt',IBAN:draft.iban||'Fehlt',Zahlungsfrist:draft.payment_days+' Tage',Stornoregel:'24 Stunden', 'Erste Rechnungsnummer':new Date().getFullYear()+'-0001'}).map(([k,v])=>'<div class="summary"><strong>'+escapeHTML(k)+'</strong><span>'+escapeHTML(v)+'</span></div>').join('');
else body=field(key,key==='teacher_name'?'Name':key==='teacher_email'?'Kontakt-E-Mail':key==='tax_number'?'Steuernummer':'Tage',draft[key],key==='teacher_email'?'email':key==='payment_days'?'number':'text');
frame('<p class="eyebrow">Einrichtung · Schritt '+(step+1)+' von 9</p><div class="progress"><div style="width:'+((step+1)/9*100)+'%"></div></div><h1>'+title+'</h1><div class="card">'+body+'<p id="error" class="error" role="alert"></p><div class="actions">'+button('Zurück','back','secondary')+button(key==='summary'?'Bestätigen':'Weiter','next')+'</div>'+(key==='tax_number'||key==='vat_mode'||key==='iban'?'<button id="skip" class="link">Später ergänzen</button>':'')+'</div>','setup-screen');$('back').onclick=()=>{if(step>0){step--;persist();setup()}};$('skip')?.addEventListener('click',()=>{if(key==='iban'){draft.iban='';draft.bank_name=''}else draft[key]='';step++;persist();setup()});$('next').onclick=async()=>{if(key==='summary')return save();if(key==='teacher_address'){const a={street:$('street').value.trim(),postcode:$('postcode').value.trim(),city:$('city').value.trim(),country:$('country').value.trim()||'Deutschland'};if(!a.street||!/^[0-9]{5}$/.test(a.postcode)||!a.city)return err('Bitte Straße, fünfstellige Postleitzahl und Ort eingeben.');draft.teacher_address=a}
else if(key==='vat_mode'){const v=document.querySelector('input[name=vat_mode]:checked');if(!v)return err('Bitte wähle eine Option.');draft.vat_mode=v.value}
else if(key==='iban'){const v=$('iban').value.trim();if(v&&!ibanValid(v))return err('Die IBAN ist ungültig. Bitte prüfe sie.');draft.iban=v.replace(/\s/g,'').toUpperCase();draft.bank_name=$('bank_name').value.trim()}
else if(key!=='cancellation_rule'){const v=$(key).value.trim();if((key==='teacher_name'||key==='teacher_email')&&!v)return err('Dieses Feld darf nicht leer sein.');if(key==='teacher_email'&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v))return err('Bitte gültige E-Mail-Adresse eingeben.');if(key==='payment_days'&&(!Number.isInteger(Number(v))||Number(v)<1||Number(v)>365))return err('Bitte 1 bis 365 Tage eingeben.');draft[key]=key==='payment_days'?Number(v):v}step++;persist();setup()}}
function persist(){localStorage.setItem(draftKey(),JSON.stringify(draft));localStorage.setItem(stepKey(),String(step))}
async function save(){const data={...draft,vat_mode:draft.vat_mode||'unsure',ledger_id:ledger,effective_from:today()};const {error}=await supabase.from('billing_settings_versions').insert(data);if(error)return err(error);localStorage.removeItem(draftKey());localStorage.removeItem(stepKey());editing=false;await load()}
function home(){
 const m=missing(settings);
 frame('<div class="row"><h1>Hello, '+escapeHTML(settings.teacher_name.split(/\s+/)[0])+'</h1><button class="secondary" id="settingsBtn" aria-label="Settings">☼</button></div>'+
 '<div style="margin:22px 0 10px">'+button('+ Log a lesson','logLesson')+'</div><p class="muted" style="text-align:center">Add your first student to start logging.</p>'+
 (m.length?'<section class="card" style="border:2px solid #242424"><h2>To do</h2><p class="muted">'+m.length+' things missing before your first invoice</p>'+m.map(([k,label])=>'<button class="link todo-item" data-key="'+k+'">'+escapeHTML(label)+' ›</button>').join('')+'</section>':'')+
 '<section class="card"><h2>Students</h2><p class="muted">Open your student list to add or manage students.</p>'+button('Students','addStudent','secondary')+'</section>'+
 '<section class="card"><h2>Invoices</h2><p class="muted">No invoices yet.</p></section>');
 $('settingsBtn').onclick=settingsPage;
 $('logLesson').disabled=true;
 document.querySelectorAll('.todo-item').forEach(b=>b.onclick=()=>settingsPage([b.dataset.key]));
 $('addStudent').onclick=()=>studentsPage();
}

function settingsPage(onlyKeys=null){const s=settings;const missingOnly=Array.isArray(onlyKeys)&&onlyKeys.length>0;frame('<div class="row"><h1>'+(missingOnly?'Fehlende Angaben':'Einstellungen')+'</h1><button id="home" class="secondary">Zurück</button></div><p class="muted">Änderungen werden als neue Version gespeichert. Bereits ausgestellte Rechnungen bleiben unverändert.</p><div class="card">'+field('teacher_name','Rechnungsname',s.teacher_name)+field('street','Straße',s.teacher_address?.street)+field('postcode','PLZ',s.teacher_address?.postcode)+field('city','Ort',s.teacher_address?.city)+field('country','Land',s.teacher_address?.country||'Deutschland')+field('teacher_email','Kontakt-E-Mail',s.teacher_email)+field('tax_number','Steuernummer',s.tax_number)+ '<label class="field">Umsatzsteuer<select id="vat_mode">'+[['small_business','Kleinunternehmer'],['exempt_teaching','Steuerfreier Unterricht'],['regular_19','Regulär 19 %'],['unsure','Unsicher']].map(([v,t])=>'<option value="'+v+'" '+(s.vat_mode===v?'selected':'')+'>'+t+'</option>').join('')+'</select></label>'+field('iban','IBAN',s.iban)+field('bank_name','Bankname',s.bank_name)+field('payment_days','Zahlungsfrist (Tage)',s.payment_days,'number')+field('phone','Telefon (optional)',s.phone)+field('effective_from','Gültig ab',today(),'date')+'<p class="muted small">Umsatzsteueränderungen gelten nur für Rechnungen ab diesem Datum. Im Zweifel Steuerberatung fragen.</p>'+'<p id="error" class="error"></p>'+button('Änderungen speichern','save','primary')+'</div><div class="card"><p>Angemeldet als '+escapeHTML(user.email)+'</p>'+field('login_email','Anmelde-E-Mail ändern',user.email,'email')+button('Neue Anmelde-E-Mail bestätigen','changeLogin','secondary')+'<p id="loginStatus" class="muted small"></p>'+button('Abmelden','signout','secondary')+' '+button('Überall abmelden','signoutAll','secondary')+'</div>','settings-screen');if(missingOnly){const keys=new Set([...onlyKeys,'effective_from']);document.querySelectorAll('.card:first-of-type .field').forEach(el=>{const input=el.querySelector('input,select');if(input&&!keys.has(input.id))el.hidden=true});} $('home').onclick=home;$('changeLogin').onclick=async()=>{const email=$('login_email').value.trim();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){ $('loginStatus').textContent='Bitte eine gültige E-Mail-Adresse eingeben.';return;}const {error}=await supabase.auth.updateUser({email});$('loginStatus').textContent=error?error.message:'Bitte bestätige die neue Adresse per E-Mail. Die Kontakt-E-Mail bleibt unverändert.'};$('signout').onclick=async()=>{await supabase.auth.signOut({scope:'local'});user=null;login()};$('signoutAll').onclick=async()=>{await supabase.auth.signOut({scope:'global'});user=null;login()};$('save').onclick=async()=>{const a={street:$('street').value.trim(),postcode:$('postcode').value.trim(),city:$('city').value.trim(),country:$('country').value.trim()||'Deutschland'};const v=$('iban').value.trim();if(!$('teacher_name').value.trim()||!a.street||!/^[0-9]{5}$/.test(a.postcode)||!a.city)return err('Bitte Name und vollständige Anschrift eingeben.');if(v&&!ibanValid(v))return err('Die IBAN ist ungültig.');if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test($('teacher_email').value.trim()))return err('Die Kontakt-E-Mail ist ungültig.');const data={ledger_id:ledger,teacher_address:a,effective_from:$('effective_from').value};for(const k of ['teacher_name','teacher_email','tax_number','vat_mode','iban','bank_name','payment_days','phone'])data[k]=$(k).value.trim();data.iban=data.iban.replace(/\s/g,'').toUpperCase();data.payment_days=Number(data.payment_days);if(!Number.isInteger(data.payment_days)||data.payment_days<1||data.payment_days>365)return err('Die Zahlungsfrist muss 1 bis 365 Tage betragen.');data.cancellation_rule='24h';if(!data.effective_from)return err('Bitte ein Gültigkeitsdatum wählen.');if(data.effective_from<today())return err('Bitte heute oder ein zukünftiges Datum wählen.');if(data.vat_mode!==s.vat_mode&&data.effective_from<today())return err('Eine rückwirkende Umsatzsteueränderung ist nicht erlaubt.');const {error}=await supabase.from('billing_settings_versions').insert(data);if(error)return err(error);alert(data.effective_from>today()?'Änderung gespeichert. Sie wird am gewählten Datum wirksam.':'Änderungen gespeichert.');await load()}}

const normalizeStudentText=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('de').trim();
function editDistance(a,b){const prev=Array.from({length:b.length+1},(_,i)=>i);for(let i=1;i<=a.length;i++){let diagonal=prev[0];prev[0]=i;for(let j=1;j<=b.length;j++){const above=prev[j];prev[j]=Math.min(prev[j]+1,prev[j-1]+1,diagonal+(a[i-1]===b[j-1]?0:1));diagonal=above;}}return prev[b.length]}
function studentSearchRank(student,term){
 if(!term)return 0;
 const fields=[student.student_name,student.nickname].filter(Boolean).map(normalizeStudentText);
 const tokens=fields.flatMap(x=>x.split(/\s+/)).concat(fields);
 if(tokens.some(x=>x===term))return 0;
 if(tokens.some(x=>x.startsWith(term)))return 1;
 if(tokens.some(x=>x.includes(term)))return 2;
 const tolerance=term.length>=5?2:term.length>=3?1:0;
 return tokens.some(x=>Math.abs(x.length-term.length)<=tolerance&&editDistance(x,term)<=tolerance)?3:Infinity;
}
async function studentsPage(initialSearch=''){
 frame('<div class="row screen-header"><h1>Students</h1>'+button('+ Add student','newStudent','secondary')+'</div>'+
 '<label class="field">Search<input id="studentSearch" placeholder="Name or short name" value="'+escapeHTML(typeof initialSearch==='string'?initialSearch:'')+'"></label>'+
 '<div class="student-filter-bar" role="group" aria-label="Student status">'+
 '<button class="filter-pill" data-filter="active" aria-pressed="true">Active</button>'+
 '<button class="filter-pill" data-filter="paused" aria-pressed="false">Paused</button>'+
 '<button class="filter-pill" data-filter="ended" aria-pressed="false">Ended</button></div>'+
 '<div id="studentResults" class="student-list" aria-live="polite"></div><p id="error" class="error"></p>');
 $('newStudent').onclick=()=>studentForm();
 let serial=0,selected='active';
 async function render(){
  const current=++serial,search=$('studentSearch').value.trim();
  const responses=await Promise.all(['active','paused','ended'].map(status=>supabase.rpc('find_students',{p_query:search,p_status:status,p_at:today()})));
  if(current!==serial)return;
  const error=responses.find(x=>x.error)?.error;
  if(error){$('studentResults').innerHTML='';return err(error);}
  const statuses=['active','paused','ended'];
  document.querySelectorAll('[data-filter]').forEach((b,i)=>{b.textContent=({active:'Active',paused:'Paused',ended:'Ended'})[statuses[i]]+' ('+(responses[i].data||[]).length+')';b.setAttribute('aria-pressed',String(b.dataset.filter===selected));});
  const matches=responses[statuses.indexOf(selected)].data||[];
  $('studentResults').innerHTML=matches.length?matches.map(x=>'<button class="student-item" data-student="'+escapeHTML(x.student_id)+'"><span><strong>'+escapeHTML(x.student_name)+'</strong><span>'+escapeHTML(x.subject)+' · '+escapeHTML(x.minutes||'')+' min</span></span><span class="student-price">'+escapeHTML(x.billing_mode==='monthly_flat'?x.monthly_fee+' € / month':x.rate+' € / lesson')+'</span></button>').join(''):'<p class="muted">No student found.</p>'+button('+ Add student','addFromSearch','secondary');
  document.querySelectorAll('[data-student]').forEach(b=>b.onclick=()=>studentPage(b.dataset.student));
  if($('addFromSearch'))$('addFromSearch').onclick=()=>studentForm($('studentSearch').value.trim());
 }
 $('studentSearch').oninput=render;
 document.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{selected=b.dataset.filter;render()});
 render();
}

function studentForm(prefill=''){
 frame('<div class="row"><h1>Add a student</h1>'+button('×','backStudents','secondary')+'</div><div class="card">'+
 field('student_name',"Student’s name *",prefill)+field('nickname','Short name (optional)')+field('subject','Subject *')+
 '<label class="field">Lesson length *</label><div class="segment" id="minutesSegment">'+[30,45,60,90,'Other'].map(n=>'<button type="button" data-minutes="'+n+'" aria-pressed="'+(n===45)+'">'+n+'</button>').join('')+'</div><input type="hidden" id="minutes" value="45">'+field('customMinutes','Other length in minutes','','number')+
 field('lessons_per_week','Lessons per week',1,'number')+
 '<label class="field">Billing *</label><div class="segment" id="billingSegment"><button type="button" data-billing="per_lesson" aria-pressed="true">Per lesson</button><button type="button" data-billing="monthly_flat" aria-pressed="false">Monthly flat fee</button></div><input type="hidden" id="billing_mode" value="per_lesson">'+
 field('price','Price per lesson (€) *','','number')+
 '<fieldset><legend>Who pays?</legend><label class="choice"><input type="checkbox" id="studentPays"> Student pays</label>'+
 field('payer_name','Payer name *')+
 field('payer_email','Email (needed before sending invoices)','', 'email')+
 field('payer_street','Street and number (needed before first invoice)')+field('payer_postcode','Postcode (optional)')+field('payer_city','Town (optional)')+'</fieldset>'+
 '<label class="field">Where?</label><div class="segment" id="locationSegment"><button type="button" data-location="my_place" aria-pressed="false">My place</button><button type="button" data-location="student_home" aria-pressed="false">Their home</button><button type="button" data-location="online" aria-pressed="false">Online</button></div><input type="hidden" id="location" value="">'+
 field('start_date','Start date *',today(),'date')+
 '<div class="notice">Cancellation rule: free if cancelled 24 h before, otherwise billed.</div>'+
 '<p id="error" class="error" role="alert"></p>'+button('Save student','saveStudent')+'</div>','student-form-screen');
 $('backStudents').onclick=()=>studentsPage();
 $('customMinutes').closest('label').hidden=true;
 document.querySelectorAll('[data-minutes]').forEach(b=>b.onclick=()=>{$('minutes').value=b.dataset.minutes==='Other'?'custom':b.dataset.minutes;document.querySelectorAll('[data-minutes]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));$('customMinutes').closest('label').hidden=$('minutes').value!=='custom'});
 document.querySelectorAll('[data-billing]').forEach(b=>b.onclick=()=>{$('billing_mode').value=b.dataset.billing;document.querySelectorAll('[data-billing]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));$('price').closest('label').firstChild.textContent=b.dataset.billing==='monthly_flat'?'Monthly fee (€) *':'Price per lesson (€) *'});
 document.querySelectorAll('[data-location]').forEach(b=>b.onclick=()=>{$('location').value=b.dataset.location;document.querySelectorAll('[data-location]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)))});
 $('studentPays').onchange=()=>{$('payer_name').value=$('studentPays').checked?$('student_name').value:''};

 $('saveStudent').onclick=async()=>{
  const get=id=>$(id).value.trim();
  const errors=[];
  if(!get('student_name'))errors.push('Name');
  if(!get('subject'))errors.push('Fach');
  if(!get('payer_name')&&!$('studentPays').checked)errors.push('Zahlende Person');
  if(!get('start_date'))errors.push('Beginn');
  if(!(Number(get('price'))>0))errors.push('Preis über 0 €');
  const duration=get('minutes')==='custom'?Number(get('customMinutes')):Number(get('minutes'));
  if(!Number.isInteger(duration)||duration<=0)errors.push('Unterrichtsdauer');
  if(!(Number(get('lessons_per_week'))>0))errors.push('Stunden pro Woche');
  if(errors.length)return err('Bitte prüfen: '+errors.join(', ')+'.');
  if(get('payer_email')&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(get('payer_email')))return err('Bitte eine gültige E-Mail-Adresse eingeben.');
  const duplicateCheck=await supabase.rpc('find_students',{p_query:get('student_name'),p_status:'active',p_at:today()});
  if(duplicateCheck.error)return err(duplicateCheck.error);
  const duplicate=(duplicateCheck.data||[]).some(x=>normalizeStudentText(x.student_name)===normalizeStudentText(get('student_name')));
  if(duplicate&&!confirm('Ein Schüler mit diesem Namen ist bereits vorhanden. Bitte prüfe, ob ein Kurzname hilft. Trotzdem speichern?'))return;
  const details={student_name:get('student_name'),nickname:get('nickname'),subject:get('subject'),minutes:duration,lessons_per_week:Number(get('lessons_per_week')),billing_mode:get('billing_mode'),price:get('price'),payer_name:$('studentPays').checked?get('student_name'):get('payer_name'),payer_email:get('payer_email'),payer_address:{street:get('payer_street'),postcode:get('payer_postcode'),city:get('payer_city'),country:'Deutschland'},location:get('location'),start_date:get('start_date')};
  $('saveStudent').disabled=true;
  const {data,error}=await supabase.rpc('create_student',{p_details:details});
  if(error){$('saveStudent').disabled=false;return err(error);}
  alert('Gespeichert: '+details.student_name+', '+details.subject+', '+details.minutes+' Min., '+details.price+' € '+(details.billing_mode==='monthly_flat'?'pro Monat':'pro Stunde'));
  studentPage(data);
 };
}

async function studentPage(id){
 const [detail,status,history,events]=await Promise.all([
  supabase.rpc('student_details_at',{p_student_id:id,p_at:today()}),
  supabase.rpc('student_status_at',{p_student_id:id,p_at:today()}),
  supabase.from('student_versions').select('*').eq('student_id',id).order('effective_from',{ascending:false}).order('created_at',{ascending:false}),
  supabase.from('student_status_events').select('*').eq('student_id',id).order('effective_from',{ascending:false})
 ]);
 const error=detail.error||status.error||history.error||events.error;
 if(error){frame('<p class="error">'+escapeHTML(error.message)+'</p>'+button('Zurück','backStudents'));$('backStudents').onclick=()=>studentsPage();return;}
 const v=detail.data?.[0]||(history.data||[]).slice().sort((a,b)=>a.effective_from.localeCompare(b.effective_from))[0];if(!v)return studentsPage();
 const pending=(history.data||[]).filter(x=>x.effective_from>today());
 const pendingEvents=(events.data||[]).filter(x=>x.effective_from>today());
 const niceDate=d=>{if(!d)return '';const [y,m,day]=d.slice(0,10).split('-');return new Date(Number(y),Number(m)-1,Number(day)).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'});};
 const statusLabel={active:'Active',paused:'Paused',ended:'Ended',removed:'Removed'}[status.data]||'Not yet started';
 const startDate=(history.data||[]).reduce((d,x)=>!d||x.effective_from<d?x.effective_from:d,null);
 const locationLabel={my_place:'My place',student_home:'Their home',online:'Online'}[v.location]||'Not set';
 const moneyLabel=x=>x.billing_mode==='monthly_flat'?x.monthly_fee+' € per month':x.rate+' € per lesson';
 frame('<div class="student-page-heading"><div class="row"><button id="backStudents" class="secondary" aria-label="Back to students">←</button><div style="flex:1"><h1>'+escapeHTML(v.student_name)+'</h1><p class="muted">'+statusLabel+' since '+niceDate(startDate)+'</p></div></div></div>'+
 '<section class="card"><h2>Status</h2><dl class="detail-grid"><dt>Subject</dt><dd>'+escapeHTML(v.subject)+', '+escapeHTML(v.minutes)+' min, '+escapeHTML(v.lessons_per_week)+'× per week</dd>'+
 '<dt>Price</dt><dd>'+escapeHTML(moneyLabel(v))+'</dd><dt>Payer</dt><dd>'+escapeHTML(v.payer_name)+'</dd>'+
 '<dt>Where</dt><dd>'+escapeHTML(locationLabel)+'</dd><dt>Cancellation</dt><dd>Free if cancelled 24 h before, otherwise billed</dd></dl>'+
 (pending.length||pendingEvents.length?'<div class="scheduled-note">'+pending.map(x=>'<div>From '+niceDate(x.effective_from)+': '+escapeHTML(moneyLabel(x))+'</div>').join('')+pendingEvents.map(x=>'<div>From '+niceDate(x.effective_from)+': '+escapeHTML(x.event_type)+'</div>').join('')+'</div>':'')+'</section>'+
 '<div class="actions">'+button('Change','changeStudent')+button('Pause or end','statusStudent','secondary')+'</div>'+
 '<section class="card"><h2>History</h2>'+
 (history.data||[]).map((x,i)=>'<div class="history-entry">'+(i===(history.data||[]).length-1?'Student added':'Details effective from '+niceDate(x.effective_from)+': '+escapeHTML(moneyLabel(x)))+'<div class="muted">entered '+niceDate(x.created_at)+'</div></div>').join('')+
 (events.data||[]).map(x=>'<div class="history-entry">'+escapeHTML(x.event_type)+' from '+niceDate(x.effective_from)+'<div class="muted">entered '+niceDate(x.created_at)+'</div></div>').join('')+'</section>'+
 '<div style="margin-top:24px">'+button('Remove mistakenly added student','removeStudent','secondary')+'</div>');

 $('backStudents').onclick=()=>studentsPage();
 $('changeStudent').onclick=()=>studentChangeForm(id,v);
 $('statusStudent').onclick=()=>studentStatusForm(id,v,status.data);
 $('removeStudent').onclick=async()=>{if(!confirm('Nur entfernen, wenn noch keine Stunde erfasst wurde. Der Datensatz bleibt zur Nachvollziehbarkeit erhalten. Fortfahren?'))return;const earliest=(history.data||[]).reduce((d,x)=>!d||x.effective_from<d?x.effective_from:d,null);const {error}=await supabase.rpc('set_student_status',{p_student_id:id,p_event:'remove',p_effective_from:earliest,p_pause_until:null});if(error)return alert(error.message);studentsPage();};
 if(status.data==='removed')$('removeStudent').hidden=true;
}
function studentChangeForm(id,v){
 const money=v.billing_mode==='monthly_flat'?v.monthly_fee:v.rate;
 const a=v.payer_address||{};
 frame('<div class="row"><h1>Change '+escapeHTML(v.student_name)+'</h1>'+button('×','backChange','secondary')+'</div><div class="card">'+
 field('subject','Fach',v.subject)+field('nickname','Kurzname',v.nickname||'')+
 field('minutes','Minuten',v.minutes,'number')+field('lessons_per_week','Stunden pro Woche',v.lessons_per_week,'number')+
 '<label class="field">Abrechnung<select id="billing_mode"><option value="per_lesson">Pro Stunde</option><option value="monthly_flat">Monatspauschale</option></select></label>'+
 field('price','Preis in €',money,'number')+field('payer_name','Zahlende Person',v.payer_name)+field('payer_email','E-Mail',v.payer_email||'','email')+
 field('payer_street','Straße',a.street||'')+field('payer_postcode','PLZ',a.postcode||'')+field('payer_city','Ort',a.city||'')+
 '<label class="field">Unterrichtsort<select id="location"><option value="">Nicht angegeben</option><option value="my_place">Bei mir</option><option value="student_home">Beim Schüler</option><option value="online">Online</option></select></label>'+
 field('effective_from','Gültig ab',v.effective_from>today()?v.effective_from:v.billing_mode==='monthly_flat'&&today().slice(-2)!=='01'?nextMonthFirst():today(),'date')+
 '<p class="muted small">Bereits erfasste Stunden und ausgestellte Rechnungen werden nicht rückwirkend verändert.</p>'+
 '<p id="error" class="error" role="alert"></p>'+button('Save change','saveChange')+'</div>');
 $('billing_mode').value=v.billing_mode;$('location').value=v.location||'';
 $('backChange').onclick=()=>studentPage(id);
 $('saveChange').onclick=async()=>{
  const g=k=>$(k).value.trim();
  if(!g('subject')||!g('payer_name')||!g('effective_from')||Number(g('minutes'))<=0||Number(g('lessons_per_week'))<=0||Number(g('price'))<=0)return err('Bitte alle Pflichtfelder und einen Preis über 0 eingeben.');
  if(g('payer_email')&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(g('payer_email')))return err('Ungültige E-Mail-Adresse.');
  const changes={subject:g('subject'),nickname:g('nickname'),minutes:Number(g('minutes')),lessons_per_week:Number(g('lessons_per_week')),billing_mode:g('billing_mode'),price:g('price'),payer_name:g('payer_name'),payer_email:g('payer_email'),payer_address:{street:g('payer_street'),postcode:g('payer_postcode'),city:g('payer_city'),country:'Deutschland'},location:g('location')};
  $('saveChange').disabled=true;
  const {error}=await supabase.rpc('change_student',{p_student_id:id,p_effective_from:g('effective_from'),p_changes:changes});
  if(error){$('saveChange').disabled=false;return err(error);}
  alert('Änderung gespeichert ab '+g('effective_from'));studentPage(id);
 };
}
function studentStatusForm(id,v,current){
 frame('<div class="row"><h1>Status ändern</h1>'+button('×','backStatus','secondary')+'</div><div class="card">'+
 '<p>'+escapeHTML(v.student_name)+' · aktuell: '+escapeHTML(current)+'</p>'+
 '<label class="field">Aktion<select id="statusEvent"><option value="pause">Pausieren</option><option value="restart">Wieder starten</option><option value="end">Beenden</option></select></label>'+
 field('statusDate','Gültig ab',v.billing_mode==='monthly_flat'&&today().slice(-2)!=='01'?nextMonthFirst():today(),'date')+field('pauseUntil','Pause bis (optional)','','date')+
 '<p class="muted small">Bei Monatspauschalen gelten Statusänderungen ab dem Monatsersten.</p>'+
 '<p id="error" class="error" role="alert"></p>'+button('Save status','saveStatus')+'</div>');
 $('backStatus').onclick=()=>studentPage(id);
 $('statusEvent').value=current==='paused'||current==='ended'?'restart':'pause';
 const toggle=()=>{$('pauseUntil').closest('label').hidden=$('statusEvent').value!=='pause';};
 $('statusEvent').onchange=toggle;toggle();
 $('saveStatus').onclick=async()=>{
  const action=$('statusEvent').value,date=$('statusDate').value,until=$('pauseUntil').value||null;
  if(!date)return err('Bitte ein Datum angeben.');
  if(!confirm('Statusänderung '+action+' ab '+date+' speichern?'))return;
  $('saveStatus').disabled=true;
  const {error}=await supabase.rpc('set_student_status',{p_student_id:id,p_event:action,p_effective_from:date,p_pause_until:action==='pause'?until:null});
  if(error){$('saveStatus').disabled=false;return err(error);}
  studentPage(id);
 };
}

supabase.auth.onAuthStateChange((event)=>{if(event==='SIGNED_IN'&&!user)setTimeout(load,0)});load();
