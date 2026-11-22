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
const draftKey=()=>`ll-draft:${user?.id||'guest'}`;const stepKey=()=>`ll-step:${user?.id||'guest'}`;const lastUseKey=()=>`ll-last-use:${user?.id||'guest'}`;const DAY=86400000;let otpSentAt=0,recoveryMode=false;const defaultDraft=()=>({teacher_name:'',teacher_address:{street:'',postcode:'',city:'',country:'Deutschland'},teacher_email:user?.email||'',tax_number:'',vat_mode:'',iban:'',bank_name:'',payment_days:14,cancellation_rule:'24h',phone:''});
function login(){
 frame('<div class="auth-heading"><div class="auth-mark" aria-hidden="true"></div><h1>Lesson Ledger</h1><p class="muted">Unterricht, Notizen und Rechnungen für Privatlehrkräfte.</p></div>'+
 '<form id="loginForm" class="card auth-card"><h2>Anmelden</h2>'+
 '<label class="field">E-Mail<input id="email" type="email" autocomplete="email" required placeholder="name@beispiel.de"></label>'+
 '<label class="field">Passwort<input id="password" type="password" autocomplete="current-password" required></label>'+
 '<button class="primary" type="submit" id="passwordBtn">Anmelden</button>'+
 '<p id="error" class="error" role="alert"></p>'+
 '<button type="button" class="link" id="forgotPasswort">Passwort festlegen oder zurücksetzen</button>'+
 '<button type="button" class="link" id="emailFallback">Stattdessen E-Mail-Code verwenden</button>'+
 '<p class="muted small">Noch kein Konto? <button type="button" class="link" id="createAccount">Konto erstellen</button></p></form>','setup-screen');
 $('loginForm').onsubmit=async e=>{
  e.preventDefault();const email=$('email').value.trim(),password=$('password').value;
  $('passwordBtn').disabled=true;
  const {error}=await supabase.auth.signInWithPasswort({email,password});
  if(error){$('passwordBtn').disabled=false;return err(error);}
  await load();
 };
 $('forgotPasswort').onclick=()=>passwordRecovery();
 $('emailFallback').onclick=()=>emailCodeLogin();
 $('createAccount').onclick=()=>register();
}
function emailCodeLogin(){
 frame('<h1>Mit E-Mail anmelden</h1><p class="muted">An email code or link will be sent. E-Mail sending limits may apply.</p><div class="card">'+
 '<label class="field">E-Mail<input id="email" type="email" autocomplete="email"></label>'+
 button('Anmelde-E-Mail senden','emailBtn')+'<p id="error" class="error" role="alert"></p>'+button('Zurück zur Passwortanmeldung','backLogin','secondary')+'</div>','setup-screen');
 $('backLogin').onclick=login;
 $('emailBtn').onclick=async()=>{
  const email=$('email').value.trim();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return err('Bitte eine gültige E-Mail-Adresse eingeben.');
  $('emailBtn').disabled=true;
  const {error}=await supabase.auth.signInWithOtp({email,options:{emailRedirectTo:location.href.split('?')[0].split('#')[0],shouldCreateUser:false}});
  if(error){$('emailBtn').disabled=false;return err(error);}
  otpSentAt=Date.now();verify(email);
 };
}
function passwordRecovery(){
 frame('<h1>Passwort festlegen oder zurücksetzen</h1><p class="muted">Verwende die E-Mail-Adresse deines bestehenden Kontos, damit Schüler und Einstellungen erhalten bleiben. Wir senden einen Wiederherstellungslink.</p>'+
 '<form id="recoveryForm" class="card"><label class="field">E-Mail-Adresse des Kontos<input id="recoveryE-Mail" type="email" autocomplete="email" required></label>'+
 '<button type="submit" class="primary" id="sendRecovery">Wiederherstellungslink senden</button><p id="error" class="error" role="alert"></p>'+
 button('Zurück zur Anmeldung','backLogin','secondary')+'</form>','setup-screen');
 $('backLogin').onclick=login;
 $('recoveryForm').onsubmit=async e=>{
  e.preventDefault();const email=$('recoveryE-Mail').value.trim();$('sendRecovery').disabled=true;
  const {error}=await supabase.auth.resetPasswordForE-Mail(email,{redirectTo:location.origin+location.pathname});
  if(error){$('sendRecovery').disabled=false;return err(error);}
  frame('<h1>Prüfe dein Postfach</h1><p>Öffne den Link in der E-Mail, um ein Passwort festzulegen. Falls das Versandlimit erreicht ist, warte vor einem neuen Versuch.</p>'+button('Zurück zur Anmeldung','backLogin','secondary'),'setup-screen');
  $('backLogin').onclick=login;
 };
}
function choosePassword(){
 frame('<h1>Passwort festlegen</h1><p class="muted">Dein bestehendes Konto und deine Daten bleiben erhalten.</p>'+
 '<form id="newPasswordForm" class="card">'+
 '<label class="field">Neues Passwort<input id="newPassword" type="password" autocomplete="new-password" Min.length="12" required></label>'+
 '<label class="field">Passwort bestätigen<input id="confirmPassword" type="password" autocomplete="new-password" Min.length="12" required></label>'+
 '<p id="error" class="error" role="alert"></p><button type="submit" id="savePassword" class="primary">Passwort speichern</button></form>','setup-screen');
 $('newPasswordForm').onsubmit=async e=>{
  e.preventDefault();const password=$('newPassword').value;
  if(password.length<12)return err('Bitte Min.destens 12 Zeichen verwenden.');
  if(password!==$('confirmPassword').value)return err('Passworts do not match.');
  $('savePassword').disabled=true;
  const {error}=await supabase.auth.updateUser({password});
  if(error){$('savePassword').disabled=false;return err(error);}
  recoveryMode=false;await load();
 };
}
function register(){
 frame('<h1>Konto erstellen</h1><p class="muted">Already used Lesson Ledger? Go back and choose Passwort festlegen oder zurücksetzen to keep your existing data.</p>'+
 '<form id="registerForm" class="card"><label class="field">E-Mail<input id="registerE-Mail" type="email" autocomplete="email" required></label>'+
 '<label class="field">Passwort (mindestens 12 Zeichen)<input id="registerPassword" type="password" autocomplete="new-password" Min.length="12" required></label>'+
 '<p id="error" class="error" role="alert"></p><button class="primary" id="registerBtn" type="submit">Konto erstellen</button>'+
 button('Zurück zur Anmeldung','backLogin','secondary')+'</form>','setup-screen');
 $('backLogin').onclick=login;
 $('registerForm').onsubmit=async e=>{
  e.preventDefault();$('registerBtn').disabled=true;
  const {data,error}=await supabase.auth.signUp({email:$('registerE-Mail').value.trim(),password:$('registerPassword').value,options:{emailRedirectTo:location.origin+location.pathname}});
  if(error){$('registerBtn').disabled=false;return err(error);}
  if(data.session)return load();
  frame('<h1>Prüfe dein Postfach</h1><p>Bestätige bei einem neuen Konto deine E-Mail-Adresse. Bestehende Nutzer sollten stattdessen ihr Passwort zurücksetzen.</p>'+button('Zurück zur Anmeldung','backLogin','secondary'),'setup-screen');
  $('backLogin').onclick=login;
 };
}

function verify(email){frame('<p class="eyebrow">Anmeldung</p><h1>Prüfe dein Postfach</h1><p>Wir haben eine Anmeldung an <strong>'+escapeHTML(email)+'</strong> geschickt.</p><p class="muted">Öffne den Link oder gib den sechsstelligen Code ein.</p><div class="card"><label class="field">Bestätigungscode<input id="otp" inputmode="numeric" maxlength="6" autocomplete="one-time-code"></label>'+button('Code bestätigen','check')+'<p id="error" class="error" role="alert"></p><button class="link" id="resend">Code erneut senden</button><button class="link" id="wrong">Falsche Adresse?</button></div>');$('wrong').onclick=login;$('resend').onclick=async()=>{if(Date.now()-otpSentAt<60000)return err('Bitte warte 60 Sekunden, bevor du einen neuen Code anforderst.');const {error}=await supabase.auth.signInWithOtp({email,options:{emailRedirectTo:location.href.split('?')[0].split('#')[0],shouldCreateUser:false}});if(error)return err(error);otpSentAt=Date.now();$('error').textContent='Ein neuer Code wurde angefordert.'};$('check').onclick=async()=>{const {error}=await supabase.auth.verifyOtp({email,token:$('otp').value.trim(),type:'email'});if(error)err(error);else await load()}}
async function load(){if(recoveryMode)return;const {data:{user:u}}=await supabase.auth.getUser();if(recoveryMode)return;user=u;if(!u)return login();const last=Number(localStorage.getItem(lastUseKey())||0);if(last&&Date.now()-last>30*DAY){await supabase.auth.signOut({scope:'local'});user=null;return login()}localStorage.setItem(lastUseKey(),String(Date.now()));let r=await supabase.rpc('ensure_my_ledger');if(r.error)return frame('<h1>Verbindung fehlgeschlagen</h1><p class="error">'+escapeHTML(r.error.message)+'</p>');ledger=r.data;const q=await supabase.from('billing_settings_versions').select('*').eq('ledger_id',ledger).lte('effective_from',today()).order('effective_from',{ascending:false}).order('created_at',{ascending:false}).limit(1);if(q.error)return frame('<p class="error">'+escapeHTML(q.error.message)+'</p>');settings=q.data?.[0]||null;if(settings)home();else{draft=JSON.parse(localStorage.getItem(draftKey())||'null')||defaultDraft();step=Math.min(8,Math.max(0,Number(localStorage.getItem(stepKey())||0)));setup()}}
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
 frame('<div class="row"><h1>Hallo, '+escapeHTML(settings.teacher_name.split(/\s+/)[0])+'</h1><button class="secondary" id="settingsBtn">Einstellungen</button></div>'+
 '<div style="margin:22px 0 10px">'+button('+ Stunde erfassen','logLesson')+'</div><p class="muted" style="text-align:center">Erfasse zunächst einen Schüler, um Stunden zu dokumentieren.</p>'+
 '<section class="card"><div class="row"><h2>Schüler</h2>'+button('Alle anzeigen','addStudent','secondary')+'</div><div id="homeStudents" aria-live="polite"><p class="muted">Schüler werden geladen …</p></div><div class="row" id="homePagination" hidden><button class="secondary" id="homePrev">Zurück</button><span id="homePageLabel"></span><button class="secondary" id="homeNext">Weiter</button></div></section>'+
 '<section class="card"><h2>Rechnungen</h2><p class="muted">Noch keine Rechnungen vorhanden.</p></section>');
 $('settingsBtn').onclick=settingsPage;
 $('logLesson').disabled=true;
 $('addStudent').onclick=()=>studentsPage();
 let page=0;const pageSize=5;
 supabase.rpc('find_students',{p_query:'',p_status:'active',p_at:today()}).then(({data,error})=>{
  if(!$('homeStudents'))return;
  if(error){$('homeStudents').textContent='Schüler konnten nicht geladen werden.';return;}
  const students=data||[];
  const render=()=>{
   if(!$('homeStudents'))return;
   const total=Math.max(1,Math.ceil(students.length/pageSize));
   page=Math.min(page,total-1);
   $('homeStudents').innerHTML=students.length?students.slice(page*pageSize,(page+1)*pageSize).map(x=>'<button class="student-item" data-student="'+escapeHTML(x.student_id)+'"><span><strong>'+escapeHTML(x.student_name)+'</strong><span>'+escapeHTML(x.subject||'')+'</span></span><span aria-hidden="true">›</span></button>').join(''):'<p class="muted">Noch keine aktiven Schüler.</p>'+button('+ Schüler hinzufügen','homeAddStudent','secondary');
   document.querySelectorAll('#homeStudents [data-student]').forEach(b=>b.onclick=()=>studentPage(b.dataset.student));
   if($('homeAddStudent'))$('homeAddStudent').onclick=()=>studentForm();
   $('homePagination').hidden=students.length<=pageSize;
   $('homePageLabel').textContent=(page+1)+' / '+total;
   $('homePrev').disabled=page===0;$('homeNext').disabled=page===total-1;
  };
  $('homePrev').onclick=()=>{page--;render()};
  $('homeNext').onclick=()=>{page++;render()};
  render();
 });
}

function settingsPage(onlyKeys=null){
 if(Array.isArray(onlyKeys)&&onlyKeys.length)return settingsEditPage(onlyKeys);
 const s=settings,a=s.teacher_address||{},rows=[
 ['teacher_name','Name auf Rechnungen',s.teacher_name||'Nicht angegeben'],
 ['teacher_address','Postanschrift',[a.street,a.postcode,a.city].filter(Boolean).join(', ')||'Nicht angegeben'],
 ['teacher_email','E-Mail for payers',s.teacher_email||'Nicht angegeben'],
 ['phone','Telefon (optional)',s.phone||'Nicht angegeben'],
 ['tax_number','Steuernummer',s.tax_number||'Nicht angegeben'],
 ['vat_mode','Umsatzsteuer',({small_business:'Kleinunternehmer (§ 19 UStG)',exempt_teaching:'Steuerfreier Unterricht (§ 4 Nr. 21 UStG)',regular_19:'Regular Umsatzsteuer 19%',unsure:'Unsicher'})[s.vat_mode]||'Nicht angegeben'],
 ['iban','Bankverbindung',s.iban||'Nicht angegeben'],
 ['payment_days','Zahlungsfrist',(s.payment_days||14)+' Tage'],
 ['cancellation_rule','Stornoregel','Bis 24 Stunden vorher kostenlos, danach kostenpflichtig'],
 ['invoice_language','Rechnungssprache','Deutsch']
 ];
 frame('<div class="row"><button id="home" class="secondary" aria-label="Zurück zur Startseite">←</button><h1 style="flex:1">Einstellungen</h1></div>'+
 '<section class="card"><h2>Rechnungsangaben</h2>'+rows.map(([key,label,value])=>'<div class="settings-row"><div><div class="muted">'+escapeHTML(label)+'</div><div>'+escapeHTML(value)+'</div></div><button class="link" data-setting="'+key+'">'+(value==='Nicht angegeben'?'Hinzufügen':'Bearbeiten')+'</button></div>').join('')+'</section>'+
 '<section class="card"><h2>Anmeldung</h2><div class="settings-row"><div><div class="muted">Anmelde-E-Mail</div>'+escapeHTML(user.email)+'</div><button class="link" id="changeLoginLink">Ändern</button></div>'+button('Passwort festlegen oder ändern','setPassword','secondary')+button('Abmelden','signout','secondary')+'<div style="text-align:center">'+button('Überall abmelden','signoutAll','secondary')+'</div></section>','settings-screen');
 $('home').onclick=home;
 $('setPassword').onclick=()=>{recoveryMode=true;choosePassword();};
 document.querySelectorAll('[data-setting]').forEach(b=>b.onclick=()=>settingsEditPage(b.dataset.setting==='teacher_address'?['street','postcode','city','country']:b.dataset.setting==='invoice_language'||b.dataset.setting==='cancellation_rule'?null:[b.dataset.setting]));
 $('changeLoginLink').onclick=()=>settingsEditPage(['effective_from']);
 $('signout').onclick=async()=>{await supabase.auth.signOut({scope:'local'});user=null;login()};
 $('signoutAll').onclick=async()=>{await supabase.auth.signOut({scope:'global'});user=null;login()};
}
function settingsEditPage(onlyKeys=null){const s=settings;const missingOnly=Array.isArray(onlyKeys)&&onlyKeys.length>0;frame('<div class="row"><button id="home" class="secondary" aria-label="Zurück zu Einstellungen">←</button><h1>'+(missingOnly?'Fehlende Angaben':'Einstellungen')+'</h1></div><p class="muted">Änderungen werden als neue Version gespeichert. Bereits ausgestellte Rechnungen bleiben unverändert.</p><div class="card">'+field('teacher_name','Rechnungsname',s.teacher_name)+field('street','Straße',s.teacher_address?.street)+field('postcode','PLZ',s.teacher_address?.postcode)+field('city','Ort',s.teacher_address?.city)+field('country','Land',s.teacher_address?.country||'Deutschland')+field('teacher_email','Kontakt-E-Mail',s.teacher_email)+field('tax_number','Steuernummer',s.tax_number)+ '<label class="field">Umsatzsteuer<select id="vat_mode">'+[['small_business','Kleinunternehmer'],['exempt_teaching','Steuerfreier Unterricht'],['regular_19','Regulär 19 %'],['unsure','Unsicher']].map(([v,t])=>'<option value="'+v+'" '+(s.vat_mode===v?'selected':'')+'>'+t+'</option>').join('')+'</select></label>'+field('iban','IBAN',s.iban)+field('bank_name','Bankname',s.bank_name)+field('payment_days','Zahlungsfrist (Tage)',s.payment_days,'number')+field('phone','Telefon (optional)',s.phone)+field('effective_from','Gültig ab',today(),'date')+'<p class="muted small">Umsatzsteueränderungen gelten nur für Rechnungen ab diesem Datum. Im Zweifel Steuerberatung fragen.</p>'+'<p id="error" class="error"></p>'+button('Änderungen speichern','save','primary')+'</div><div class="card"><p>Angemeldet als '+escapeHTML(user.email)+'</p>'+field('login_email','Anmelde-E-Mail ändern',user.email,'email')+button('Neue Anmelde-E-Mail bestätigen','changeLogin','secondary')+'<p id="loginStatus" class="muted small"></p>'+button('Abmelden','signout','secondary')+' '+button('Überall abmelden','signoutAll','secondary')+'</div>','settings-screen');if(missingOnly){const keys=new Set([...onlyKeys,'effective_from']);document.querySelectorAll('.card:first-of-type .field').forEach(el=>{const input=el.querySelector('input,select');if(input&&!keys.has(input.id))el.hidden=true});} $('home').onclick=()=>settingsPage();$('changeLogin').onclick=async()=>{const email=$('login_email').value.trim();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){ $('loginStatus').textContent='Bitte eine gültige E-Mail-Adresse eingeben.';return;}const {error}=await supabase.auth.updateUser({email});$('loginStatus').textContent=error?error.message:'Bitte bestätige die neue Adresse per E-Mail. Die Kontakt-E-Mail bleibt unverändert.'};$('signout').onclick=async()=>{await supabase.auth.signOut({scope:'local'});user=null;login()};$('signoutAll').onclick=async()=>{await supabase.auth.signOut({scope:'global'});user=null;login()};$('save').onclick=async()=>{const a={street:$('street').value.trim(),postcode:$('postcode').value.trim(),city:$('city').value.trim(),country:$('country').value.trim()||'Deutschland'};const v=$('iban').value.trim();if(!$('teacher_name').value.trim()||!a.street||!/^[0-9]{5}$/.test(a.postcode)||!a.city)return err('Bitte Name und vollständige Anschrift eingeben.');if(v&&!ibanValid(v))return err('Die IBAN ist ungültig.');if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test($('teacher_email').value.trim()))return err('Die Kontakt-E-Mail ist ungültig.');const data={ledger_id:ledger,teacher_address:a,effective_from:$('effective_from').value};for(const k of ['teacher_name','teacher_email','tax_number','vat_mode','iban','bank_name','payment_days','phone'])data[k]=$(k).value.trim();data.iban=data.iban.replace(/\s/g,'').toUpperCase();data.payment_days=Number(data.payment_days);if(!Number.isInteger(data.payment_days)||data.payment_days<1||data.payment_days>365)return err('Die Zahlungsfrist muss 1 bis 365 Tage betragen.');data.cancellation_rule='24h';if(!data.effective_from)return err('Bitte ein Gültigkeitsdatum wählen.');if(data.effective_from<today())return err('Bitte heute oder ein zukünftiges Datum wählen.');if(data.vat_mode!==s.vat_mode&&data.effective_from<today())return err('Eine rückwirkende Umsatzsteueränderung ist nicht erlaubt.');const {error}=await supabase.from('billing_settings_versions').insert(data);if(error)return err(error);alert(data.effective_from>today()?'Änderung gespeichert. Sie wird am gewählten Datum wirksam.':'Änderungen gespeichert.');await load()}}

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
 frame('<div class="row screen-header"><button id="backHome" class="secondary" aria-label="Zurück zur Startseite">←</button><h1>Schüler</h1>'+button('+ Hinzufügen','newStudent','secondary')+'</div>'+
 '<label class="field">Suche<input id="studentSearch" placeholder="Name oder Kurzname" value="'+escapeHTML(typeof initialSearch==='string'?initialSearch:'')+'"></label>'+
 '<div class="student-filter-bar" role="group" aria-label="Schülerstatus">'+
 '<button class="filter-pill" data-filter="active" aria-pressed="true">Aktiv</button>'+
 '<button class="filter-pill" data-filter="paused" aria-pressed="false">Pausiert</button>'+
 '<button class="filter-pill" data-filter="ended" aria-pressed="false">Beendet</button></div>'+
 '<div id="studentResults" class="student-list" aria-live="polite"></div><p id="error" class="error"></p>');
 $('backHome').onclick=home;
 $('newStudent').onclick=()=>studentForm();
 let serial=0,selected='active';
 async function render(){
  const current=++serial,search=$('studentSearch').value.trim();
  const responses=await Promise.all(['active','paused','ended'].map(status=>supabase.rpc('find_students',{p_query:search,p_status:status,p_at:today()})));
  if(current!==serial)return;
  const error=responses.find(x=>x.error)?.error;
  if(error){$('studentResults').innerHTML='';return err(error);}
  const statuses=['active','paused','ended'];
  document.querySelectorAll('[data-filter]').forEach((b,i)=>{b.textContent=({active:'Aktiv',paused:'Pausiert',ended:'Beendet'})[statuses[i]]+' ('+(responses[i].data||[]).length+')';b.setAttribute('aria-pressed',String(b.dataset.filter===selected));});
  const matches=responses[statuses.indexOf(selected)].data||[];
  $('studentResults').innerHTML=matches.length?matches.map(x=>'<div class="lesson-student-row"><button class="student-item" data-student="'+escapeHTML(x.student_id)+'"><span><strong>'+escapeHTML(x.student_name)+'</strong><span>'+escapeHTML(x.subject)+' · '+escapeHTML(x.minutes||'')+' Min.</span></span><span class="student-price">'+escapeHTML(x.billing_mode==='monthly_flat'?x.monthly_fee+' € / Monat':x.rate+' € / Stunde')+'</span></button>'+(selected==='active'?'<button class="primary lesson-log-btn" data-log="'+escapeHTML(x.student_id)+'">Log</button>':'')+'</div>').join(''):'<p class="muted">Keine Schüler gefunden.</p>'+button('+ Schüler hinzufügen','addFromSearch','secondary');
  document.querySelectorAll('[data-student]').forEach(b=>b.onclick=()=>studentPage(b.dataset.student));
  document.querySelectorAll('[data-log]').forEach(b=>b.onclick=()=>quickLogLesson(b.dataset.log,b));
  if($('addFromSearch'))$('addFromSearch').onclick=()=>studentForm($('studentSearch').value.trim());
 }
 $('studentSearch').oninput=render;
 document.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{selected=b.dataset.filter;render()});
 render();
}

function studentForm(prefill=''){
 frame('<div class="row"><button id="backStudents" class="secondary" aria-label="Zurück zur Schülerübersicht">←</button><h1>Schüler hinzufügen</h1></div><div class="card">'+
 field('student_name',"Name des Schülers *",prefill)+field('nickname','Kurzname (optional)')+field('subject','Fach *')+
 '<label class="field">Unterrichtsdauer *</label><div class="segment" id="minutesSegment">'+[30,45,60,90,'Andere'].map(n=>'<button type="button" data-minutes="'+n+'" aria-pressed="'+(n===45)+'">'+n+'</button>').join('')+'</div><input type="hidden" id="minutes" value="45">'+field('customMinutes','Andere Dauer in Minuten','','number')+
 field('lessons_per_week','Stunden pro Woche',1,'number')+
 '<label class="field">Abrechnung *</label><div class="segment" id="billingSegment"><button type="button" data-billing="per_lesson" aria-pressed="true">Pro Stunde</button><button type="button" data-billing="monthly_flat" aria-pressed="false">Monatspauschale</button></div><input type="hidden" id="billing_mode" value="per_lesson">'+
 field('price','Preis pro Stunde (€) *','','number')+
 '<fieldset><legend>Wer bezahlt?</legend><label class="choice"><input type="checkbox" id="studentPays"> Schüler bezahlt selbst</label>'+
 field('payer_name','Name der zahlenden Person *')+
 field('payer_email','E-Mail (vor Rechnungsversand erforderlich)','', 'email')+
 field('payer_street','Straße und Hausnummer (vor erster Rechnung erforderlich)')+field('payer_postcode','PLZ (optional)')+field('payer_city','Ort (optional)')+'</fieldset>'+
 '<label class="field">Unterrichtsort</label><div class="segment" id="locationSegment"><button type="button" data-location="my_place" aria-pressed="false">Bei mir</button><button type="button" data-location="student_home" aria-pressed="false">Beim Schüler</button><button type="button" data-location="online" aria-pressed="false">Online</button></div><input type="hidden" id="location" value="">'+
 field('start_date','Startdatum *',today(),'date')+
 '<div class="notice">Stornoregel: Bis 24 Stunden vorher kostenlos, danach kostenpflichtig.</div>'+
 '<p id="error" class="error" role="alert"></p>'+button('Schüler speichern','saveStudent')+'</div>','student-form-screen');
 $('backStudents').onclick=()=>studentsPage();
 $('customMinutes').closest('label').hidden=true;
 document.querySelectorAll('[data-minutes]').forEach(b=>b.onclick=()=>{$('minutes').value=b.dataset.minutes==='Andere'?'custom':b.dataset.minutes;document.querySelectorAll('[data-minutes]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));$('customMinutes').closest('label').hidden=$('minutes').value!=='custom'});
 document.querySelectorAll('[data-billing]').forEach(b=>b.onclick=()=>{$('billing_mode').value=b.dataset.billing;document.querySelectorAll('[data-billing]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));$('price').closest('label').firstChild.textContent=b.dataset.billing==='monthly_flat'?'Monatspauschale (€) *':'Preis pro Stunde (€) *'});
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
 const niceDate=d=>{if(!d)return '';const [y,m,day]=d.slice(0,10).split('-');return new Date(Number(y),Number(m)-1,Number(day)).toLocaleDateString('de-DE',{day:'numeric',month:'short',year:'numeric'});};
 const statusLabel={active:'Aktiv',paused:'Pausiert',ended:'Beendet',removed:'Entfernt'}[status.data]||'Noch nicht begonnen';
 const startDate=(history.data||[]).reduce((d,x)=>!d||x.effective_from<d?x.effective_from:d,null);
 const locationLabel={my_place:'Bei mir',student_home:'Beim Schüler',online:'Online'}[v.location]||'Nicht angegeben';
 const moneyLabel=x=>x.billing_mode==='monthly_flat'?x.monthly_fee+' € pro Monat':x.rate+' € pro Stunde';
 frame('<div class="student-page-heading"><div class="row"><button id="backStudents" class="secondary" aria-label="Zurück zu Schülern">←</button><div style="flex:1"><h1>'+escapeHTML(v.student_name)+'</h1><p class="muted">'+statusLabel+' seit '+niceDate(startDate)+'</p></div></div></div>'+
 '<section class="card"><h2>Details</h2><dl class="detail-grid"><dt>Fach</dt><dd>'+escapeHTML(v.subject)+', '+escapeHTML(v.minutes)+' Min., '+escapeHTML(v.lessons_per_week)+'× pro Woche '+editStudentButton('subject')+'</dd>'+
 '<dt>Preis</dt><dd>'+escapeHTML(moneyLabel(v))+' '+editStudentButton('price')+'</dd><dt>Zahlende Person</dt><dd>'+escapeHTML(v.payer_name)+' '+editStudentButton('payer_name')+'</dd>'+
 '<dt>Ort</dt><dd>'+escapeHTML(locationLabel)+' '+editStudentButton('location')+'</dd><dt>Stornierung</dt><dd>Bis 24 Stunden vorher kostenlos, danach kostenpflichtig</dd></dl>'+
 (pending.length||pendingEvents.length?'<div class="scheduled-note">'+pending.map(x=>'<div>Ab '+niceDate(x.effective_from)+': '+escapeHTML(moneyLabel(x))+'</div>').join('')+pendingEvents.map(x=>'<div>Ab '+niceDate(x.effective_from)+': '+escapeHTML(x.event_type)+'</div>').join('')+'</div>':'')+'</section>'+
 '<div class="actions">'+button('Log','studentLog')+button('Status ändern','statusStudent','secondary')+'</div>'+
 '<section class="card"><h2>Stunden</h2><div id="lessonHistory">Wird geladen …</div></section>'+
 '<section class="card"><h2>Verlauf</h2>'+
 (history.data||[]).map((x,i)=>'<div class="history-entry">'+(i===(history.data||[]).length-1?'Schüler hinzugefügt':'Angaben gültig ab '+niceDate(x.effective_from)+': '+escapeHTML(moneyLabel(x)))+'<div class="muted">erfasst am '+niceDate(x.created_at)+'</div></div>').join('')+
 (events.data||[]).map(x=>'<div class="history-entry">'+escapeHTML(x.event_type)+' ab '+niceDate(x.effective_from)+'<div class="muted">erfasst am '+niceDate(x.created_at)+'</div></div>').join('')+'</section>'+
 '<div style="margin-top:24px">'+button('Versehentlich hinzugefügten Schüler entfernen','removeStudent','secondary')+'</div>');

 $('backStudents').onclick=()=>studentsPage();
 document.querySelectorAll('[data-direct-edit]').forEach(b=>b.onclick=()=>studentChangeForm(id,v,b.dataset.directEdit));
 $('statusStudent').onclick=()=>studentStatusForm(id,v,status.data);
 $('studentLog').onclick=()=>logLessonSheet(id);
 loadLessonHistory(id);
 $('removeStudent').onclick=async()=>{if(!confirm('Nur entfernen, wenn noch keine Stunde erfasst wurde. Der Datensatz bleibt zur Nachvollziehbarkeit erhalten. Fortfahren?'))return;const earliest=(history.data||[]).reduce((d,x)=>!d||x.effective_from<d?x.effective_from:d,null);const {error}=await supabase.rpc('set_student_status',{p_student_id:id,p_event:'remove',p_effective_from:earliest,p_pause_until:null});if(error)return alert(error.message);studentsPage();};
 if(status.data==='removed')$('removeStudent').hidden=true;
}
const editStudentButton=key=>'<button type="button" class="link" data-direct-edit="'+key+'" aria-label="Bearbeiten">Bearbeiten</button>';
function studentChangeForm(id,v,initialKey='price'){
 const money=v.billing_mode==='monthly_flat'?v.monthly_fee:v.rate;
 const a=v.payer_address||{};
 const changeFields=[
  ['price','Preis pro Stunde',money,'number'],
  ['subject','Fach',v.subject],
  ['nickname','Kurzname',v.nickname||''],
  ['minutes','Unterrichtsdauer (Minuten)',v.minutes,'number'],
  ['lessons_per_week','Stunden pro Woche',v.lessons_per_week,'number'],
  ['billing_mode','Abrechnung',v.billing_mode],
  ['payer_name','Name der zahlenden Person',v.payer_name],
  ['payer_email','E-Mail der zahlenden Person',v.payer_email||'','email'],
  ['payer_street','Straße der zahlenden Person',a.street||''],
  ['payer_postcode','PLZ der zahlenden Person',a.postcode||''],
  ['payer_city','Ort der zahlenden Person',a.city||''],
  ['location','Unterrichtsort',v.location||'']
 ];
 const editControl=([k,label,val,type])=>k==='billing_mode'?'<label class="field" data-edit="'+k+'">Neu<select id="'+k+'"><option value="per_lesson">Pro Stunde</option><option value="monthly_flat">Monatspauschale</option></select></label>':k==='location'?'<label class="field" data-edit="'+k+'">Neu<select id="'+k+'"><option value="">Nicht angegeben</option><option value="my_place">Bei mir</option><option value="student_home">Beim Schüler</option><option value="online">Online</option></select></label>':'<div data-edit="'+k+'">'+field(k,'Neu',val,type||'text')+'</div>';
 frame('<div class="sheet-overlay"><section class="sheet" role="dialog" aria-modal="true" aria-labelledby="changeTitle"><div class="row"><h1 id="changeTitle">Ändern '+escapeHTML(v.student_name)+'</h1>'+button('×','backChange','secondary')+'</div>'+
 '<label class="field" hidden>Was ändern?<select id="changeType">'+changeFields.map(([k,label])=>'<option value="'+k+'">'+escapeHTML(label)+'</option>').join('')+'</select></label>'+
 '<div class="change-current"><div><span class="muted">Bisher</span><div class="notice" id="oldValue">'+escapeHTML(String(money))+' €</div></div><div><span class="muted">Neu</span><div id="editFields">'+changeFields.map(editControl).join('')+'</div></div></div>'+
 '<div id="newModePrice" hidden>'+field('newBillingPrice','Neuer Preis (€)',money,'number')+'</div>'+field('effective_from','Gültig ab',v.effective_from>today()?v.effective_from:v.billing_mode==='monthly_flat'&&today().slice(-2)!=='01'?nextMonthFirst():today(),'date')+
 '<p class="muted">Bereits abgerechnete Stunden und ausgestellte Rechnungen bleiben unverändert. Monatspauschalen und Pausen beginnen am Monatsersten.</p>'+
 '<p id="error" class="error" role="alert"></p>'+button('Änderung speichern','saveChange')+'</section></div>','change-screen');
 $('billing_mode').value=v.billing_mode;$('location').value=v.location||'';
 $('changeType').value=changeFields.some(x=>x[0]===initialKey)?initialKey:'price';
 const selected=()=>changeFields.find(x=>x[0]===$('changeType').value);
 const show=()=>{const [key,,old]=selected();document.querySelectorAll('[data-edit]').forEach(el=>el.hidden=el.dataset.edit!==key);$('newModePrice').hidden=key!=='billing_mode';$('oldValue').textContent=String(old)+(key==='price'?' €':'');};
 $('changeType').onchange=show;show();
 $('backChange').onclick=()=>studentPage(id);
 $('saveChange').onclick=async()=>{
  const g=k=>$(k).value.trim(),key=$('changeType').value;
  if(!g('effective_from'))return err('Bitte ein Gültigkeitsdatum wählen.');
  if(key==='billing_mode'&&!(Number(g('newBillingPrice'))>0))return err('Bitte einen Preis über 0 eingeben.');
  if(key==='price'&&!(Number(g('price'))>0))return err('Bitte einen Preis über 0 eingeben.');
  if((key==='minutes'||key==='lessons_per_week')&&!(Number(g(key))>0))return err('Bitte einen Wert über 0 eingeben.');
  if(['subject','payer_name'].includes(key)&&!g(key))return err('Dieses Feld ist erforderlich.');
  if(key==='payer_email'&&g(key)&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(g(key)))return err('Ungültige E-Mail-Adresse.');
  const changes={};
  if(key==='price')changes.price=g('price');
  else if(key==='billing_mode'){changes.billing_mode=g('billing_mode');changes.price=g('newBillingPrice');}
  else if(['minutes','lessons_per_week'].includes(key))changes[key]=Number(g(key));
  else if(['payer_street','payer_postcode','payer_city'].includes(key))changes.payer_address={...a,[{payer_street:'street',payer_postcode:'postcode',payer_city:'city'}[key]]:g(key)};
  else changes[key]=g(key);
  $('saveChange').disabled=true;
  const {error}=await supabase.rpc('change_student',{p_student_id:id,p_effective_from:g('effective_from'),p_changes:changes});
  if(error){$('saveChange').disabled=false;return err(error);}
  studentPage(id);
 };
}

function studentStatusForm(id,v,current){
 frame('<div class="row"><button id="backStatus" class="secondary" aria-label="Zurück zum Schüler">←</button><h1>Status ändern</h1></div><div class="card">'+
 '<p>'+escapeHTML(v.student_name)+' · aktuell: '+escapeHTML(current)+'</p>'+
 '<label class="field">Aktion<select id="statusEvent"><option value="pause">Pausieren</option><option value="restart">Wieder starten</option><option value="end">Beenden</option></select></label>'+
 field('statusDate','Gültig ab',v.billing_mode==='monthly_flat'&&today().slice(-2)!=='01'?nextMonthFirst():today(),'date')+field('pauseUntil','Pause bis (optional)','','date')+
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


async function quickLogLesson(studentId,button,key=crypto.randomUUID()){button.disabled=true;
 const args={p_student_id:studentId,p_lesson_date:today(),p_idempotency_key:key};
 let {data,error}=await supabase.rpc('log_lesson',args);
 if(!error&&data?.state==='duplicate'){
  if(confirm('Für heute ist bereits eine Stunde erfasst. Eine zweite speichern?'))({data,error}=await supabase.rpc('log_lesson',{...args,p_confirm_duplicate:true}));
  else{button.disabled=false;return;}
 }
 button.disabled=false;
 if(error){const retry=confirm('Nicht gespeichert: '+error.message+'. Erneut versuchen?');if(retry)return quickLogLesson(studentId,button,key);return;}
 if(data?.state!=='saved')return;
 const row=button.closest('.lesson-student-row'),notice=document.createElement('div');
 notice.className='notice lesson-save-notice';notice.textContent='Stunde gespeichert. ';
 const undo=document.createElement('button');undo.className='link';undo.textContent='Rückgängig';notice.append(undo);
 row?.after(notice);
 let allowed=true;
 const timer=setTimeout(()=>{allowed=false;undo.remove();},10000);
 undo.onclick=async()=>{if(!allowed)return;allowed=false;clearTimeout(timer);undo.disabled=true;const {error}=await supabase.rpc('void_lesson',{p_lesson_id:data.id,p_reason:'undo',p_idempotency_key:crypto.randomUUID()});notice.textContent=error?'Rückgängig fehlgeschlagen: '+error.message:'Stunde entfernt';};
}
const lessonMoney=x=>x.billing_mode==='monthly_flat'?0:(x.charge_override==='not_charged'?0:x.charge_override==='charged'?Number(x.rate):x.status==='cancelled_free'?0:Number(x.rate));
async function loadLessonHistory(id){
 const target=$('lessonHistory');if(!target)return;
 const [a,b]=await Promise.all([supabase.from('lessons').select('*').eq('student_id',id).order('lesson_date',{ascending:false}).limit(100),supabase.from('lesson_voids').select('lesson_id').limit(500)]);
 if(a.error||b.error){target.textContent=(a.error||b.error).message;return;}
 const voided=new Set((b.data||[]).map(x=>x.lesson_id));
 const from=new Date();from.setDate(1);from.setMonth(from.getMonth()-1);
 const cutoff=[from.getFullYear(),String(from.getMonth()+1).padStart(2,'0'),'01'].join('-');
 const lessons=(a.data||[]).filter(x=>!voided.has(x.id)&&x.lesson_date>=cutoff);
 target.innerHTML=(lessons.length?lessons.map(x=>'<button class="student-item" data-lesson="'+escapeHTML(x.id)+'"><span><strong>'+escapeHTML(x.lesson_date)+'</strong><span>'+escapeHTML(x.no_show?'Nicht erschienen':x.status==='held'?'Gehalten':x.status==='cancelled_billable'?'Spät abgesagt':'Rechtzeitig abgesagt')+'</span></span><span>'+lessonMoney(x)+' €</span></button>').join(''):'<p class="muted">Keine Stunden im aktuellen oder vorherigen Monat.</p>')+
 '<button class="link" id="toggleLessonHistory">Verlauf einschließlich entfernter Stunden anzeigen</button><div id="voidedLessonHistory" hidden></div>';
 $('toggleLessonHistory').onclick=()=>{
  const el=$('voidedLessonHistory');el.hidden=!el.hidden;
  if(!el.hidden)el.innerHTML=(a.data||[]).map(x=>'<div class="history-entry">'+escapeHTML(x.lesson_date)+' · '+x.minutes+' Min. · '+escapeHTML(x.status)+(voided.has(x.id)?' · Entfernt':'')+'</div>').join('')||'Kein Verlauf';
 };
 target.querySelectorAll('[data-lesson]').forEach(b=>b.onclick=()=>lessonDetails(b.dataset.lesson,id));
}
async function lessonDetails(lessonId,studentId){
 const {data:x,error}=await supabase.from('lessons').select('*').eq('id',lessonId).single();
 if(error)return alert(error.message);
 frame('<div class="row"><h1>Stunde '+escapeHTML(x.lesson_date)+'</h1>'+button('Zurück','backLesson','secondary')+'</div><section class="card"><p>Status: '+escapeHTML(x.no_show?'Nicht erschienen':x.status)+'</p><p>Dauer: '+x.minutes+' Minuten</p><p>Preis: '+x.rate+' €</p><p>Berechnet: '+lessonMoney(x)+' €</p><p>Erfasst: '+escapeHTML(x.created_at)+'</p></section>'+(x.invoice_id?'<p class="notice">Diese Stunde ist abgerechnet. Bitte die Rechnung korrigieren. Rechnungs-ID: '+escapeHTML(x.invoice_id)+'</p>':'<div class="actions">'+button('Bearbeiten','editLesson')+button('Entfernen','removeLesson','secondary')+'</div>')+'<p id="error" class="error"></p>');
 $('backLesson').onclick=()=>studentPage(studentId);
 const remove=async(reason)=>{if(x.invoice_id)return err({message:'Bereits abgerechnet. Bitte Rechnung korrigieren.'});if(!confirm('Stunde stornieren? Der Verlauf bleibt erhalten.'))return;const {error}=await supabase.rpc('void_lesson',{p_lesson_id:lessonId,p_reason:reason,p_idempotency_key:crypto.randomUUID()});if(error)return err(error);studentPage(studentId);};
 if($('removeLesson'))$('removeLesson').onclick=()=>remove('remove');
 if($('editLesson'))$('editLesson').onclick=()=>{if(x.invoice_id)return err({message:'Bereits abgerechnet.'});logLessonSheet(studentId,x);};
}
async function logLessonSheet(studentId,original=null){
 const {data,error}=await supabase.rpc('student_details_at',{p_student_id:studentId,p_at:original?.lesson_date||today()});
 if(error||!data?.length)return alert(error?.message||'Keine Schülerdaten');
 const v=data[0],flat=v.billing_mode==='monthly_flat';
 frame('<div class="sheet-overlay"><section class="sheet" role="dialog" aria-modal="true"><div class="row"><h1>Log: '+escapeHTML(v.student_name)+'</h1>'+button('×','closeLog','secondary')+'</div>'+
 '<label class="field">Art<select id="lessonStatus"><option value="held">Gehalten</option><option value="cancelled">Abgesagt</option><option value="no_show">Nicht erschienen</option></select></label>'+
 field('lessonDate','Datum',original?.lesson_date||today(),'date')+field('lessonMinutes','Dauer (Minuten)',original?.minutes||v.minutes,'number')+
 (flat?'':'<div id="lessonPriceField">'+field('lessonRate','Preis (€)',original?.rate||v.rate,'number')+'</div>')+
 '<div id="lessonCancellation" hidden><label class="field">Wer hat abgesagt?<select id="cancelBy"><option value="student">Schüler</option><option value="teacher">Ich</option></select></label><label class="field" id="cancelTimingField">Mindestens 24 Stunden vorher?<select id="cancelInTime"><option value="false">Nein</option><option value="true">Ja</option></select></label></div>'+
 (flat?'':'<label class="field" id="lessonOverrideRow">Berechnung<select id="lessonOverride"><option value="">Nach Regel</option><option value="not_charged">Nicht berechnen</option><option value="charged">Trotzdem berechnen</option></select></label>')+
 '<section class="lesson-recent"><h2>Letzte 14 Tage</h2><div id="recentLessons" class="muted">Wird geladen …</div></section>'+ 
 '<p id="error" class="error"></p>'+button('Speichern','saveLesson')+'</section></div>','change-screen');
 $('closeLog').onclick=()=>studentPage(studentId);
 const recentSince=new Date(Date.now()-13*86400000).toISOString().slice(0,10);
 const refreshRecent=async()=>{
  const [a,b]=await Promise.all([supabase.from('lessons').select('id,lesson_date,minutes,status,rate').eq('student_id',studentId).gte('lesson_date',recentSince).order('lesson_date',{ascending:false}).limit(50),supabase.from('lesson_voids').select('lesson_id')]);
  const el=$('recentLessons');if(!el)return;
  if(a.error||b.error){el.textContent=(a.error||b.error).message;return;}
  const voided=new Set((b.data||[]).map(x=>x.lesson_id));
  const active=(a.data||[]).filter(x=>!voided.has(x.id));
  el.innerHTML=active.length?active.map(x=>'<div class="history-entry" data-recent-date="'+escapeHTML(x.lesson_date)+'">'+escapeHTML(x.lesson_date)+' · '+x.minutes+' Min. · '+escapeHTML(x.status)+' · '+x.rate+' €</div>').join(''):'Keine Stunden in den letzten 14 Tagen.';
  const date=$('lessonDate')?.value;
  el.querySelectorAll('[data-recent-date]').forEach(x=>x.classList.toggle('lesson-duplicate',x.dataset.recentDate===date));
 };
 $('lessonDate').addEventListener('change',async()=>{
  const date=$('lessonDate').value;
  if(!original){
   const {data}=await supabase.rpc('student_details_at',{p_student_id:studentId,p_at:date});
   if(data?.length){$('lessonMinutes').value=data[0].minutes;if(!flat)$('lessonRate').value=data[0].rate;}
  }
  refreshRecent();
 });
 refreshRecent();

 if(original){$('lessonStatus').value=original.no_show?'no_show':original.status==='held'?'held':'cancelled';if($('lessonOverride'))$('lessonOverride').value=original.charge_override||'';if(original.cancelled_by)$('cancelBy').value=original.cancelled_by;if(original.cancelled_in_time!==null)$('cancelInTime').value=String(original.cancelled_in_time);}
 const refresh=()=>{$('lessonCancellation').hidden=$('lessonStatus').value!=='cancelled';$('cancelTimingField').hidden=$('cancelBy').value!=='student';};
 $('lessonStatus').onchange=refresh;$('cancelBy').onchange=refresh;refresh();
 let key=crypto.randomUUID();
 $('saveLesson').onclick=async()=>{
  $('saveLesson').disabled=true;
  const status=$('lessonStatus').value;
  const params={p_student_id:studentId,p_lesson_date:$('lessonDate').value,p_status:status,p_minutes:Number($('lessonMinutes').value),p_rate:flat?null:Number($('lessonRate').value),p_cancelled_by:status==='cancelled'?$('cancelBy').value:null,p_cancelled_in_time:status==='cancelled'&&$('cancelBy').value==='student'?$('cancelInTime').value==='true':null,p_charge_override:flat?null:$('lessonOverride').value||null,p_idempotency_key:key};
  const rpc=original?'replace_lesson':'log_lesson';if(original){delete params.p_student_id;params.p_old_lesson_id=original.id;}
  let {data,error}=await supabase.rpc(rpc,params);
  if(!error&&data?.state==='duplicate'){
   if(confirm('An diesem Datum existiert bereits eine Stunde. Zweite Stunde speichern?')){params.p_confirm_duplicate=true;({data,error}=await supabase.rpc(rpc,params));}
   else{$('saveLesson').disabled=false;return;}
  }
  if(error){$('saveLesson').disabled=false;return err(error);}
  if(data?.state!=='saved'){$('saveLesson').disabled=false;return err({message:'Speichern wurde nicht bestätigt.'});}
  frame('<div class="card"><h2>'+(original?'Stunde geändert':'Stunde gespeichert')+'</h2><p>'+escapeHTML(params.p_lesson_date)+' · '+params.p_minutes+' Min.</p>'+button('Rückgängig','undoLesson','secondary')+button('Fertig','doneLesson')+'<p id="error" class="error"></p></div>');
  $('doneLesson').onclick=()=>studentPage(studentId);
  if(!original){let undoAllowed=true;setTimeout(()=>{undoAllowed=false;const b=$('undoLesson');if(b)b.remove();},10000);
  $('undoLesson').onclick=async()=>{if(!undoAllowed)return;undoAllowed=false;$('undoLesson').disabled=true;const {error}=await supabase.rpc('void_lesson',{p_lesson_id:data.id,p_reason:'undo',p_idempotency_key:crypto.randomUUID()});if(error)return err(error);studentPage(studentId);};}
 };
}

supabase.auth.onAuthStateChange((event)=>{if(event==='PASSWORD_RECOVERY'){recoveryMode=true;setTimeout(choosePassword,0);}else if(event==='SIGNED_IN'&&!user)setTimeout(load,0)});load();
