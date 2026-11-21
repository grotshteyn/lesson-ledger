import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.57.0';
const supabase=createClient('https://zcszskoegwgcjgqsfmfx.supabase.co','sb_publishable_7U5badP6_IAFBOOYKNNF6A_ZW4XqSK0',{auth:{detectSessionInUrl:true,autoRefreshToken:true,persistSession:true}});
const root=document.querySelector('#app');let user=null,ledger=null,settings=null,step=0,draft={},editing=false;const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
const steps=[['teacher_name','Welcher Name soll auf deinen Rechnungen stehen?'],['teacher_address','Wie lautet deine Postanschrift?'],['teacher_email','Unter welcher E-Mail-Adresse können dich Zahlende erreichen?'],['tax_number','Wie lautet deine Steuernummer?'],['vat_mode','Wie berechnest du Umsatzsteuer?'],['iban','Wohin sollen Zahlende überweisen?'],['payment_days','Wie viele Tage haben Zahlende zum Bezahlen?'],['cancellation_rule','Deine Stornoregel'],['summary','Alles richtig?']];
const escapeHTML=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const $=id=>document.getElementById(id);
const button=(label,id,kind='primary')=>'<button id="'+id+'" class="'+kind+'">'+label+'</button>';
const frame=html=>{root.innerHTML='<main class="shell"><header class="top"><span class="brand">Lesson Ledger</span><span class="muted small">Für Lehrkräfte</span></header>'+html+'</main>'};
const err=e=>{const n=$('error');if(n)n.textContent=e?.message||String(e)};
const addr=()=>draft.teacher_address||{street:'',postcode:'',city:'',country:'Deutschland'};
const ibanValid=s=>{let v=(s||'').replace(/\s/g,'').toUpperCase();if(!/^[A-Z]{2}[0-9A-Z]{13,32}$/.test(v))return false;v=v.slice(4)+v.slice(0,4);let r=0;for(const c of v){const str=/[A-Z]/.test(c)?String(c.charCodeAt(0)-55):c;for(const digit of str)r=(r*10+Number(digit))%97}return r===1};
const missing=s=>[['tax_number','Steuernummer'],['vat_mode','Umsatzsteuer'],['iban','IBAN']].filter(([k])=>!s?.[k]||s[k]==='unsure');
const draftKey=()=>`ll-draft:${user?.id||'guest'}`;const stepKey=()=>`ll-step:${user?.id||'guest'}`;const lastUseKey=()=>`ll-last-use:${user?.id||'guest'}`;const DAY=86400000;let otpSentAt=0;const defaultDraft=()=>({teacher_name:'',teacher_address:{street:'',postcode:'',city:'',country:'Deutschland'},teacher_email:user?.email||'',tax_number:'',vat_mode:'',iban:'',bank_name:'',payment_days:14,cancellation_rule:'24h',phone:''});
function login(){frame('<p class="eyebrow">Willkommen</p><h1>Dein Unterricht. Deine Übersicht.</h1><p class="muted">Einfaches Rechnungsprofil für selbstständige Lehrkräfte.</p><div class="card">'+'<label class="field">E-Mail-Adresse<input id="email" type="email" autocomplete="email" placeholder="du@beispiel.de"></label>'+button('Mit E-Mail fortfahren','emailBtn')+'<p id="error" class="error" role="alert"></p></div>');$('emailBtn').onclick=async()=>{const email=$('email').value.trim();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return err('Bitte gib eine gültige E-Mail-Adresse ein.');const {error}=await supabase.auth.signInWithOtp({email,options:{emailRedirectTo:location.href.split('?')[0].split('#')[0]}});if(error)return err(error);otpSentAt=Date.now();verify(email)}}
function verify(email){frame('<p class="eyebrow">Anmeldung</p><h1>Prüfe dein Postfach</h1><p>Wir haben eine Anmeldung an <strong>'+escapeHTML(email)+'</strong> geschickt.</p><p class="muted">Öffne den Link oder gib den sechsstelligen Code ein.</p><div class="card"><label class="field">Bestätigungscode<input id="otp" inputmode="numeric" maxlength="6" autocomplete="one-time-code"></label>'+button('Code bestätigen','check')+'<p id="error" class="error" role="alert"></p><button class="link" id="resend">Code erneut senden</button><button class="link" id="wrong">Falsche Adresse?</button></div>');$('wrong').onclick=login;$('resend').onclick=async()=>{if(Date.now()-otpSentAt<60000)return err('Bitte warte 60 Sekunden, bevor du einen neuen Code anforderst.');const {error}=await supabase.auth.signInWithOtp({email,options:{emailRedirectTo:location.href.split('?')[0].split('#')[0]}});if(error)return err(error);otpSentAt=Date.now();$('error').textContent='Ein neuer Code wurde angefordert.'};$('check').onclick=async()=>{const {error}=await supabase.auth.verifyOtp({email,token:$('otp').value.trim(),type:'email'});if(error)err(error);else await load()}}
async function load(){const {data:{user:u}}=await supabase.auth.getUser();user=u;if(!u)return login();const last=Number(localStorage.getItem(lastUseKey())||0);if(last&&Date.now()-last>30*DAY){await supabase.auth.signOut({scope:'local'});user=null;return login()}localStorage.setItem(lastUseKey(),String(Date.now()));let r=await supabase.rpc('ensure_my_ledger');if(r.error)return frame('<h1>Verbindung fehlgeschlagen</h1><p class="error">'+escapeHTML(r.error.message)+'</p>');ledger=r.data;const q=await supabase.from('billing_settings_versions').select('*').eq('ledger_id',ledger).lte('effective_from',today()).order('effective_from',{ascending:false}).order('created_at',{ascending:false}).limit(1);if(q.error)return frame('<p class="error">'+escapeHTML(q.error.message)+'</p>');settings=q.data?.[0]||null;if(settings)home();else{draft=JSON.parse(localStorage.getItem(draftKey())||'null')||defaultDraft();step=Math.min(8,Math.max(0,Number(localStorage.getItem(stepKey())||0)));setup()}}
function field(key,label,value='',type='text'){return '<label class="field">'+label+'<input id="'+key+'" type="'+type+'" value="'+escapeHTML(value)+'"></label>'}
function setup(){const [key,title]=steps[step];let body='';if(key==='teacher_address'){const a=addr();body=field('street','Straße und Hausnummer',a.street)+field('postcode','Postleitzahl',a.postcode)+field('city','Ort',a.city)+field('country','Land',a.country||'Deutschland')}
else if(key==='vat_mode'){body=[['small_business','Kleinunternehmer (§ 19 UStG)','Ich berechne keine Umsatzsteuer.'],['exempt_teaching','Steuerfreier Unterricht (§ 4 Nr. 21 UStG)','Ich habe eine entsprechende Bescheinigung.'],['regular_19','Regulär 19 %','Meine Preise enthalten Umsatzsteuer.'],['unsure','Ich bin mir nicht sicher','Rechnungen bleiben gesperrt, bis du dich entschieden hast.']].map(([v,l,d])=>'<label class="choice"><input type="radio" name="vat_mode" value="'+v+'" '+(draft.vat_mode===v?'checked':'')+'><strong>'+l+'</strong><p class="muted small">'+d+'</p></label>').join('')}
else if(key==='iban')body=field('iban','IBAN',draft.iban)+field('bank_name','Bankname (optional)',draft.bank_name);
else if(key==='cancellation_rule')body='<div class="notice">Kostenlos bis 24 Stunden vor dem Termin. Danach wird die Stunde berechnet.</div>';
else if(key==='summary')body='<p class="muted small">Mit Zurück kannst du Angaben vor dem Speichern korrigieren.</p>'+Object.entries({Name:draft.teacher_name,Adresse:Object.values(addr()).join(', '),Kontakt:draft.teacher_email,Steuernummer:draft.tax_number||'Fehlt',Umsatzsteuer:draft.vat_mode||'Fehlt',IBAN:draft.iban||'Fehlt',Zahlungsfrist:draft.payment_days+' Tage',Stornoregel:'24 Stunden', 'Erste Rechnungsnummer':new Date().getFullYear()+'-0001'}).map(([k,v])=>'<div class="summary"><strong>'+escapeHTML(k)+'</strong><span>'+escapeHTML(v)+'</span></div>').join('');
else body=field(key,key==='teacher_name'?'Name':key==='teacher_email'?'Kontakt-E-Mail':key==='tax_number'?'Steuernummer':'Tage',draft[key],key==='teacher_email'?'email':key==='payment_days'?'number':'text');
frame('<p class="eyebrow">Einrichtung · Schritt '+(step+1)+' von 9</p><div class="progress"><div style="width:'+((step+1)/9*100)+'%"></div></div><h1>'+title+'</h1><div class="card">'+body+'<p id="error" class="error" role="alert"></p><div class="actions">'+button('Zurück','back','secondary')+button(key==='summary'?'Bestätigen':'Weiter','next')+'</div>'+(key==='tax_number'||key==='vat_mode'||key==='iban'?'<button id="skip" class="link">Später ergänzen</button>':'')+'</div>');$('back').onclick=()=>{if(step>0){step--;persist();setup()}};$('skip')?.addEventListener('click',()=>{if(key==='iban'){draft.iban='';draft.bank_name=''}else draft[key]='';step++;persist();setup()});$('next').onclick=async()=>{if(key==='summary')return save();if(key==='teacher_address'){const a={street:$('street').value.trim(),postcode:$('postcode').value.trim(),city:$('city').value.trim(),country:$('country').value.trim()||'Deutschland'};if(!a.street||!/^[0-9]{5}$/.test(a.postcode)||!a.city)return err('Bitte Straße, fünfstellige Postleitzahl und Ort eingeben.');draft.teacher_address=a}
else if(key==='vat_mode'){const v=document.querySelector('input[name=vat_mode]:checked');if(!v)return err('Bitte wähle eine Option.');draft.vat_mode=v.value}
else if(key==='iban'){const v=$('iban').value.trim();if(v&&!ibanValid(v))return err('Die IBAN ist ungültig. Bitte prüfe sie.');draft.iban=v.replace(/\s/g,'').toUpperCase();draft.bank_name=$('bank_name').value.trim()}
else if(key!=='cancellation_rule'){const v=$(key).value.trim();if((key==='teacher_name'||key==='teacher_email')&&!v)return err('Dieses Feld darf nicht leer sein.');if(key==='teacher_email'&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v))return err('Bitte gültige E-Mail-Adresse eingeben.');if(key==='payment_days'&&(!Number.isInteger(Number(v))||Number(v)<1||Number(v)>365))return err('Bitte 1 bis 365 Tage eingeben.');draft[key]=key==='payment_days'?Number(v):v}step++;persist();setup()}}
function persist(){localStorage.setItem(draftKey(),JSON.stringify(draft));localStorage.setItem(stepKey(),String(step))}
async function save(){const data={...draft,vat_mode:draft.vat_mode||'unsure',ledger_id:ledger,effective_from:today()};const {error}=await supabase.from('billing_settings_versions').insert(data);if(error)return err(error);localStorage.removeItem(draftKey());localStorage.removeItem(stepKey());editing=false;await load()}
function home(){const m=missing(settings);frame('<div class="row"><div><p class="eyebrow">Startseite</p><h1>Hallo, '+escapeHTML(settings.teacher_name)+'!</h1></div><button class="secondary" id="settingsBtn">Einstellungen</button></div><section class="card"><h2>Stunde erfassen</h2><p class="muted">Lege zuerst einen Schüler an. Diese Funktion folgt mit E3.</p><button class="secondary" disabled>Stunde erfassen</button></section>'+(m.length?'<section class="card"><h2>To do</h2><p>'+m.length+' Angaben fehlen vor deiner ersten Rechnung.</p><p class="muted small">'+m.map(x=>escapeHTML(x[1])).join(' · ')+'</p>'+m.map(([k,label])=>'<button class="link todo-item" data-key="'+k+'">'+escapeHTML(label)+' ergänzen</button>').join('')+button('Angaben ergänzen','todo','secondary')+'</section>':'')+'<section class="card"><h2>Schüler</h2><p class="muted">Schüler anlegen und verwalten.</p><button id="addStudent" class="secondary">Schüler hinzufügen</button></section><section class="card"><h2>Rechnungen</h2><p class="muted">Noch keine Rechnungen. Die Rechnungsverwaltung folgt mit E4.</p></section>');$('settingsBtn').onclick=settingsPage;$('todo')?.addEventListener('click',()=>settingsPage(m.map(x=>x[0])));document.querySelectorAll('.todo-item').forEach(b=>b.onclick=()=>settingsPage([b.dataset.key]));$('addStudent').onclick=studentsPage;}
function settingsPage(onlyKeys=null){const s=settings;const missingOnly=Array.isArray(onlyKeys)&&onlyKeys.length>0;frame('<div class="row"><h1>'+(missingOnly?'Fehlende Angaben':'Einstellungen')+'</h1><button id="home" class="secondary">Zurück</button></div><p class="muted">Änderungen werden als neue Version gespeichert. Bereits ausgestellte Rechnungen bleiben unverändert.</p><div class="card">'+field('teacher_name','Rechnungsname',s.teacher_name)+field('street','Straße',s.teacher_address?.street)+field('postcode','PLZ',s.teacher_address?.postcode)+field('city','Ort',s.teacher_address?.city)+field('country','Land',s.teacher_address?.country||'Deutschland')+field('teacher_email','Kontakt-E-Mail',s.teacher_email)+field('tax_number','Steuernummer',s.tax_number)+ '<label class="field">Umsatzsteuer<select id="vat_mode">'+[['small_business','Kleinunternehmer'],['exempt_teaching','Steuerfreier Unterricht'],['regular_19','Regulär 19 %'],['unsure','Unsicher']].map(([v,t])=>'<option value="'+v+'" '+(s.vat_mode===v?'selected':'')+'>'+t+'</option>').join('')+'</select></label>'+field('iban','IBAN',s.iban)+field('bank_name','Bankname',s.bank_name)+field('payment_days','Zahlungsfrist (Tage)',s.payment_days,'number')+field('phone','Telefon (optional)',s.phone)+field('effective_from','Gültig ab',today(),'date')+'<p class="muted small">Umsatzsteueränderungen gelten nur für Rechnungen ab diesem Datum. Im Zweifel Steuerberatung fragen.</p>'+'<p id="error" class="error"></p>'+button('Änderungen speichern','save','primary')+'</div><div class="card"><p>Angemeldet als '+escapeHTML(user.email)+'</p>'+field('login_email','Anmelde-E-Mail ändern',user.email,'email')+button('Neue Anmelde-E-Mail bestätigen','changeLogin','secondary')+'<p id="loginStatus" class="muted small"></p>'+button('Abmelden','signout','secondary')+' '+button('Überall abmelden','signoutAll','secondary')+'</div>');if(missingOnly){const keys=new Set([...onlyKeys,'effective_from']);document.querySelectorAll('.card:first-of-type .field').forEach(el=>{const input=el.querySelector('input,select');if(input&&!keys.has(input.id))el.hidden=true});} $('home').onclick=home;$('changeLogin').onclick=async()=>{const email=$('login_email').value.trim();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){ $('loginStatus').textContent='Bitte eine gültige E-Mail-Adresse eingeben.';return;}const {error}=await supabase.auth.updateUser({email});$('loginStatus').textContent=error?error.message:'Bitte bestätige die neue Adresse per E-Mail. Die Kontakt-E-Mail bleibt unverändert.'};$('signout').onclick=async()=>{await supabase.auth.signOut({scope:'local'});user=null;login()};$('signoutAll').onclick=async()=>{await supabase.auth.signOut({scope:'global'});user=null;login()};$('save').onclick=async()=>{const a={street:$('street').value.trim(),postcode:$('postcode').value.trim(),city:$('city').value.trim(),country:$('country').value.trim()||'Deutschland'};const v=$('iban').value.trim();if(!$('teacher_name').value.trim()||!a.street||!/^[0-9]{5}$/.test(a.postcode)||!a.city)return err('Bitte Name und vollständige Anschrift eingeben.');if(v&&!ibanValid(v))return err('Die IBAN ist ungültig.');if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test($('teacher_email').value.trim()))return err('Die Kontakt-E-Mail ist ungültig.');const data={ledger_id:ledger,teacher_address:a,effective_from:$('effective_from').value};for(const k of ['teacher_name','teacher_email','tax_number','vat_mode','iban','bank_name','payment_days','phone'])data[k]=$(k).value.trim();data.iban=data.iban.replace(/\s/g,'').toUpperCase();data.payment_days=Number(data.payment_days);if(!Number.isInteger(data.payment_days)||data.payment_days<1||data.payment_days>365)return err('Die Zahlungsfrist muss 1 bis 365 Tage betragen.');data.cancellation_rule='24h';if(!data.effective_from)return err('Bitte ein Gültigkeitsdatum wählen.');if(data.effective_from<today())return err('Bitte heute oder ein zukünftiges Datum wählen.');if(data.vat_mode!==s.vat_mode&&data.effective_from<today())return err('Eine rückwirkende Umsatzsteueränderung ist nicht erlaubt.');const {error}=await supabase.from('billing_settings_versions').insert(data);if(error)return err(error);alert(data.effective_from>today()?'Änderung gespeichert. Sie wird am gewählten Datum wirksam.':'Änderungen gespeichert.');await load()}}

async function studentsPage(){
 frame('<div class="row"><h1>Schüler</h1>'+button('Zurück','backStudents','secondary')+'</div>'+button('Schüler hinzufügen','newStudent')+'<div class="card">'+field('studentSearch','Name oder Kurzname')+'<label class="field">Status<select id="studentFilter"><option value="active">Aktiv</option><option value="paused">Pausiert</option><option value="ended">Beendet</option></select></label><div id="studentResults"></div><p id="error" class="error"></p></div>');
 $('backStudents').onclick=home;$('newStudent').onclick=()=>studentForm();
 const q=await supabase.from('students').select('id,student_versions(*)').eq('ledger_id',ledger);
 if(q.error)return err(q.error);
 const items=await Promise.all((q.data||[]).map(async st=>{
  const versions=(st.student_versions||[]).filter(v=>v.effective_from<=today()).sort((a,b)=>b.effective_from.localeCompare(a.effective_from)||b.created_at.localeCompare(a.created_at)||b.id.localeCompare(a.id));
  const v=versions[0];if(!v)return null;
  const r=await supabase.rpc('student_status_at',{p_student_id:st.id,p_at:today()});
  return r.error?null:{id:st.id,...v,status:r.data};
 }));
 const records=items.filter(Boolean);
 function render(){
  const query=$('studentSearch').value.trim().toLocaleLowerCase('de');
  const status=$('studentFilter').value;
  const matches=records.filter(x=>x.status===status&&[x.student_name,x.nickname].some(y=>(y||'').toLocaleLowerCase('de').includes(query))).sort((a,b)=>a.student_name.localeCompare(b.student_name,'de'));
  $('studentResults').innerHTML=matches.length?matches.map(x=>'<button class="student-item" data-student="'+escapeHTML(x.id)+'"><strong>'+escapeHTML(x.student_name)+'</strong><span>'+escapeHTML(x.subject)+' · '+escapeHTML(x.payer_name)+' · '+escapeHTML(x.billing_mode==='monthly_flat'?x.monthly_fee+' € / Monat':x.rate+' € / Stunde')+'</span></button>').join(''):'<p class="muted">Kein Schüler gefunden.</p>';
  document.querySelectorAll('[data-student]').forEach(b=>b.onclick=()=>studentPage(b.dataset.student));
 }
 $('studentSearch').oninput=render;$('studentFilter').onchange=render;render();
}
function studentForm(prefill=''){
 frame('<div class="row"><h1>Schüler hinzufügen</h1>'+button('Zurück','backStudents','secondary')+'</div><div class="card">'+
 field('student_name','Name *',prefill)+field('nickname','Kurzname (optional)')+field('subject','Fach *')+
 '<label class="field">Unterrichtsdauer (Minuten) <select id="minutes"><option>30</option><option selected>45</option><option>60</option><option>90</option></select></label>'+
 field('lessons_per_week','Stunden pro Woche',1,'number')+
 '<label class="field">Abrechnung<select id="billing_mode"><option value="per_lesson">Pro Stunde</option><option value="monthly_flat">Monatspauschale</option></select></label>'+
 field('price','Preis in € *','','number')+
 '<label class="choice"><input type="checkbox" id="studentPays"> Schüler zahlt selbst</label>'+
 field('payer_name','Name der zahlenden Person *')+
 field('payer_email','E-Mail der zahlenden Person (optional)','', 'email')+
 field('payer_street','Straße (optional)')+field('payer_postcode','PLZ (optional)')+field('payer_city','Ort (optional)')+
 '<label class="field">Unterrichtsort<select id="location"><option value="">Nicht angegeben</option><option value="my_place">Bei mir</option><option value="student_home">Beim Schüler</option><option value="online">Online</option></select></label>'+
 field('start_date','Beginn *',today(),'date')+
 '<div class="notice">Stornierung bis 24 Stunden vorher kostenlos, danach kostenpflichtig. Auch bei Nichterscheinen.</div>'+
 '<p id="error" class="error" role="alert"></p>'+button('Schüler speichern','saveStudent')+'</div>');
 $('backStudents').onclick=studentsPage;
 $('studentPays').onchange=()=>{$('payer_name').value=$('studentPays').checked?$('student_name').value:''};
 $('billing_mode').onchange=()=>{$('price').closest('label').firstChild.textContent=$('billing_mode').value==='monthly_flat'?'Monatsbeitrag in € *':'Preis in € *'};
 $('saveStudent').onclick=async()=>{
  const get=id=>$(id).value.trim();
  const errors=[];
  if(!get('student_name'))errors.push('Name');
  if(!get('subject'))errors.push('Fach');
  if(!get('payer_name')&&!$('studentPays').checked)errors.push('Zahlende Person');
  if(!get('start_date'))errors.push('Beginn');
  if(!(Number(get('price'))>0))errors.push('Preis über 0 €');
  if(!(Number(get('minutes'))>0))errors.push('Unterrichtsdauer');
  if(!(Number(get('lessons_per_week'))>0))errors.push('Stunden pro Woche');
  if(errors.length)return err('Bitte prüfen: '+errors.join(', ')+'.');
  if(get('payer_email')&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(get('payer_email')))return err('Bitte eine gültige E-Mail-Adresse eingeben.');
  const details={student_name:get('student_name'),nickname:get('nickname'),subject:get('subject'),minutes:Number(get('minutes')),lessons_per_week:Number(get('lessons_per_week')),billing_mode:get('billing_mode'),price:get('price'),payer_name:$('studentPays').checked?get('student_name'):get('payer_name'),payer_email:get('payer_email'),payer_address:{street:get('payer_street'),postcode:get('payer_postcode'),city:get('payer_city'),country:'Deutschland'},location:get('location'),start_date:get('start_date')};
  $('saveStudent').disabled=true;
  const {data,error}=await supabase.rpc('create_student',{p_details:details});
  if(error){$('saveStudent').disabled=false;return err(error);}
  alert('Gespeichert: '+details.student_name+', '+details.subject+', '+details.minutes+' Min., '+details.price+' €');
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
 if(error){frame('<p class="error">'+escapeHTML(error.message)+'</p>'+button('Zurück','backStudents'));$('backStudents').onclick=studentsPage;return;}
 const v=detail.data?.[0];if(!v)return studentsPage();
 const pending=(history.data||[]).filter(x=>x.effective_from>today());
 frame('<div class="row"><h1>'+escapeHTML(v.student_name)+'</h1>'+button('Zurück','backStudents','secondary')+'</div>'+
 '<div class="card"><h2>Schülerdaten</h2><p>'+escapeHTML(v.subject)+' · '+escapeHTML(v.minutes)+' Minuten · '+escapeHTML(v.lessons_per_week)+' / Woche</p>'+
 '<p>'+escapeHTML(v.billing_mode==='monthly_flat'?v.monthly_fee+' € pro Monat':v.rate+' € pro Stunde')+'</p>'+
 '<p>Zahlende Person: '+escapeHTML(v.payer_name)+'</p><p>Status: '+escapeHTML(status.data)+'</p>'+
 '<div class="actions">'+button('Daten ändern','changeStudent','secondary')+button('Status ändern','statusStudent','secondary')+'</div></div>'+
 (pending.length?'<div class="card"><h2>Geplante Änderungen</h2>'+pending.map(x=>'<p>Ab '+escapeHTML(x.effective_from)+': '+escapeHTML(x.billing_mode==='monthly_flat'?x.monthly_fee+' € / Monat':x.rate+' € / Stunde')+'</p>').join('')+'</div>':'')+
 '<div class="card"><h2>Änderungsverlauf</h2>'+history.data.map(x=>'<div class="summary"><strong>Ab '+escapeHTML(x.effective_from)+'</strong><span>'+escapeHTML(x.billing_mode==='monthly_flat'?x.monthly_fee+' € pro Monat':x.rate+' € pro Stunde')+' · erfasst '+escapeHTML(x.created_at.slice(0,10))+'</span></div>').join('')+
 (events.data||[]).map(x=>'<div class="summary"><strong>'+escapeHTML(x.event_type)+' ab '+escapeHTML(x.effective_from)+'</strong><span>Erfasst '+escapeHTML(x.created_at.slice(0,10))+(x.pause_until?' · bis '+escapeHTML(x.pause_until):'')+'</span></div>').join('')+'</div>');
 $('backStudents').onclick=studentsPage;
 $('changeStudent').onclick=()=>studentChangeForm(id,v);
 $('statusStudent').onclick=()=>studentStatusForm(id,v,status.data);
}
function studentChangeForm(id,v){
 const money=v.billing_mode==='monthly_flat'?v.monthly_fee:v.rate;
 const a=v.payer_address||{};
 frame('<div class="row"><h1>Schülerdaten ändern</h1>'+button('Zurück','backChange','secondary')+'</div><div class="card">'+
 field('subject','Fach',v.subject)+field('nickname','Kurzname',v.nickname||'')+
 field('minutes','Minuten',v.minutes,'number')+field('lessons_per_week','Stunden pro Woche',v.lessons_per_week,'number')+
 '<label class="field">Abrechnung<select id="billing_mode"><option value="per_lesson">Pro Stunde</option><option value="monthly_flat">Monatspauschale</option></select></label>'+
 field('price','Preis in €',money,'number')+field('payer_name','Zahlende Person',v.payer_name)+field('payer_email','E-Mail',v.payer_email||'','email')+
 field('payer_street','Straße',a.street||'')+field('payer_postcode','PLZ',a.postcode||'')+field('payer_city','Ort',a.city||'')+
 '<label class="field">Unterrichtsort<select id="location"><option value="">Nicht angegeben</option><option value="my_place">Bei mir</option><option value="student_home">Beim Schüler</option><option value="online">Online</option></select></label>'+
 field('effective_from','Gültig ab',today(),'date')+
 '<p class="muted small">Bereits erfasste Stunden und ausgestellte Rechnungen werden nicht rückwirkend verändert.</p>'+
 '<p id="error" class="error" role="alert"></p>'+button('Änderung speichern','saveChange')+'</div>');
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
 frame('<div class="row"><h1>Status ändern</h1>'+button('Zurück','backStatus','secondary')+'</div><div class="card">'+
 '<p>'+escapeHTML(v.student_name)+' · aktuell: '+escapeHTML(current)+'</p>'+
 '<label class="field">Aktion<select id="statusEvent"><option value="pause">Pausieren</option><option value="restart">Wieder starten</option><option value="end">Beenden</option></select></label>'+
 field('statusDate','Gültig ab',today(),'date')+field('pauseUntil','Pause bis (optional)','','date')+
 '<p class="muted small">Bei Monatspauschalen gelten Statusänderungen ab dem Monatsersten.</p>'+
 '<p id="error" class="error" role="alert"></p>'+button('Status speichern','saveStatus')+'</div>');
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
