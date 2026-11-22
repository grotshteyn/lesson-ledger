import {germanBackendError} from '../frontend/backend-errors.js';
// E2 Students screens. Mount only after the shell has selected the Schüler route.
// All writes use existing tenant-scoped Supabase RPCs; no direct DB mutations.
export const STUDENT_STORIES = ['ST-1','ST-3','ST-4','ST-6','ST-6.5'];
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const normalize = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('de').trim();
export const money = value => Number(value || 0).toLocaleString('de-DE',{style:'currency',currency:'EUR'});
export const studentPrice = s => s.billing_mode === 'monthly_flat' ? money(s.monthly_fee ?? s.price) + ' / Monat' : money(s.rate ?? s.price) + ' / Stunde';
export const matchingStudents = (students,query) => students.filter(s=>!normalize(query)||normalize(s.student_name).includes(normalize(query))||normalize(s.nickname).includes(normalize(query)));
export const basicsChanges = values => ({nickname:String(values.nickname??'').trim(),subject:String(values.subject??'').trim()});
export const duplicateNames = (students,name) => students.some(s=>normalize(s.student_name)===normalize(name));
export const groupStudents = students => ['active','paused','ended'].map(status => ({status,items:students.filter(s=>s.status===status).sort((a,b)=>String(a.student_name).localeCompare(String(b.student_name),'de'))}));
export const groupLessons = lessons => Object.entries(lessons.reduce((groups,lesson)=>{const key=String(lesson.lesson_date).slice(0,7);(groups[key] ||= []).push(lesson);return groups;},{})).sort(([a],[b])=>b.localeCompare(a)).map(([month,items])=>({month,items:items.sort((a,b)=>String(b.lesson_date).localeCompare(String(a.lesson_date)))}));
const statusNames={active:'Aktiv',paused:'Pausiert',ended:'Beendet'};
const locationNames={my_place:'Bei mir',student_home:'Beim Schüler',online:'Online'};
const dateLabel = value => value ? new Date(String(value).slice(0,10)+'T12:00:00').toLocaleDateString('de-DE',{day:'2-digit',month:'short',year:'numeric'}) : '';
const input = (key,label,value='',type='text',required=false) => `<label class="e2-field">${escape(label)}<input name="${key}" type="${type}" value="${escape(value)}" ${required?'required':''}></label>`;
const select = (key,label,options,value) => `<label class="e2-field">${escape(label)}<select name="${key}">${options.map(([v,l])=>`<option value="${escape(v)}" ${String(value)===String(v)?'selected':''}>${escape(l)}</option>`).join('')}</select></label>`;
const card = (heading,body,edit='') => `<section class="e2-card"><div class="e2-card-heading"><h2>${heading}</h2>${edit}</div>${body}</section>`;
const detail = (label,value) => `<div class="e2-detail"><dt>${escape(label)}</dt><dd>${escape(value||'Nicht angegeben')}</dd></div>`;
const fieldValue=(form,key)=>String(new FormData(form).get(key)||'').trim();
const number=(form,key)=>Number(fieldValue(form,key));
const emailValid=v=>!v||/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const todayLocal=()=>{const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')};
const monthStart=date=>date.slice(0,7)+'-01';
const nextMonthStart=date=>{const d=new Date(date+'T12:00:00');d.setMonth(d.getMonth()+1,1);return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),'01'].join('-')};
export function mountStudents({root,supabase,onBack=()=>{},onLessonCreate=()=>{},onLessonOpen=()=>{},onSubpageChange=()=>{},today=todayLocal}){
 if(!root||!supabase)throw new Error('Schüleransicht benötigt ein Element und Supabase');
 let alive=true,sequence=0,search='',selected=null,view='lessons';
 const render=html=>{if(alive)root.innerHTML=`<div class="e2-screen">${html}</div>`};
 const bind=(selector,callback)=>root.querySelector(selector)?.addEventListener('click',callback);
 const showError=error=>{const el=root.querySelector('[role="alert"]');if(el)el.textContent=germanBackendError(error)};
 const rpc=async(name,args)=>{const {data,error}=await supabase.rpc(name,args);if(error)throw error;return data};
 const backButton='<button type="button" class="e2-back" data-back aria-label="Zurück">‹</button>';
 const footer=(save='Speichern')=>`<div class="e2-actions"><button type="button" class="e2-secondary" data-cancel>Abbrechen</button><button class="e2-primary" type="submit">${save}</button></div>`;
 const loading=()=>render('<p role="status">Wird geladen …</p>');
 async function list(){
   onSubpageChange(false);
  selected=null;const token=++sequence;
  render(`<header class="e2-heading"><h1>Schüler</h1></header><label class="e2-search">Schüler suchen<input id="e2-search" type="search" placeholder="Name oder Kurzname" value="${escape(search)}"></label><div id="e2-results" aria-live="polite"><p>Wird geladen …</p></div><p role="alert" class="e2-error"></p><div class="e2-floating"><button class="e2-primary" data-add>+ Schüler hinzufügen</button></div>`);
  const searchInput=root.querySelector('#e2-search');
  searchInput.addEventListener('input',()=>{search=searchInput.value;refreshList()});
  bind('[data-add]',()=>create());
  async function refreshList(){
   const request=++sequence;
   const result=root.querySelector('#e2-results');if(!result)return;
   result.textContent='Wird geladen …';
   try{
    const rows=await Promise.all(['active','paused','ended'].map(status=>rpc('find_students',{p_query:search.trim(),p_status:status,p_at:today()}).then(items=>(items||[]).map(s=>({...s,status})))));
    if(!alive||request!==sequence)return;
    const grouped=groupStudents(matchingStudents(rows.flat(),search));
    result.innerHTML=grouped.map(g=>`<section class="e2-group"><h2>${statusNames[g.status]} <span>(${g.items.length})</span></h2>${g.items.length?g.items.map(s=>`<button class="e2-student-row" data-student="${escape(s.student_id)}"><span class="e2-row-main"><strong>${escape(s.student_name)}</strong><small>${escape([s.nickname,s.subject].filter(Boolean).join(' · '))}</small></span><span class="e2-row-price">${escape(studentPrice(s))}</span></button>`).join(''):'<p class="e2-muted">Keine Schüler</p>'}</section>`).join('');
    result.querySelectorAll('[data-student]').forEach(b=>b.addEventListener('click',()=>detailPage(b.dataset.student)));
   }catch(e){if(alive&&request===sequence){result.textContent='Schüler konnten nicht geladen werden.';showError(e)}}
  }
  await refreshList();
 }
 function create(prefill=''){
   onSubpageChange(true);
  ++sequence;
  render(`<header class="e2-heading">${backButton}<h1>Schüler hinzufügen</h1></header><form id="e2-form">${card('Grundlagen',input('student_name','Name *',prefill,'text',true)+input('nickname','Kurzname')+input('subject','Fach *','','text',true)+input('start_date','Startdatum *',today(),'date',true))}${card('Stunden und Preis',input('minutes','Dauer in Minuten *',45,'number',true)+input('lessons_per_week','Stunden pro Woche *',1,'number',true)+select('billing_mode','Abrechnung',[['per_lesson','Pro Stunde'],['monthly_flat','Monatspauschale']],'per_lesson')+input('price','Betrag in Euro *','','number',true)+select('location','Unterrichtsort',[['','Nicht angegeben'],...Object.entries(locationNames)],''))}${card('Zahlungspflichtige Person','<label class="e2-check"><input name="student_pays" type="checkbox"> Schüler bezahlt selbst</label>'+input('payer_name','Name der zahlenden Person *')+input('payer_email','E-Mail','','email')+input('payer_street','Straße und Hausnummer')+input('payer_postcode','Postleitzahl')+input('payer_city','Ort'))}<p role="alert" class="e2-error"></p>${footer('Schüler speichern')}</form>`);
  bind('[data-back]',list);bind('[data-cancel]',list);
  root.querySelector('[name="student_pays"]').addEventListener('change',e=>{const form=e.target.form;form.elements.payer_name.value=e.target.checked?form.elements.student_name.value:'';form.elements.payer_name.disabled=e.target.checked});
  root.querySelector('#e2-form').addEventListener('submit',async e=>{
   e.preventDefault();const form=e.currentTarget,price=number(form,'price'),minutes=number(form,'minutes'),weekly=number(form,'lessons_per_week');
   if(!fieldValue(form,'student_name')||!fieldValue(form,'subject')||!fieldValue(form,'start_date')||(!form.elements.student_pays.checked&&!fieldValue(form,'payer_name')))return showError('Bitte alle Pflichtfelder ausfüllen.');
   if(!Number.isInteger(minutes)||minutes<=0||!Number.isInteger(weekly)||weekly<=0||!Number.isFinite(price)||price<=0)return showError('Dauer, Häufigkeit und Preis müssen größer als null sein.');
   if(!emailValid(fieldValue(form,'payer_email')))return showError('Bitte eine gültige E-Mail-Adresse eingeben.');
   const name=fieldValue(form,'student_name');
   const payload={student_name:name,nickname:fieldValue(form,'nickname'),subject:fieldValue(form,'subject'),start_date:fieldValue(form,'start_date'),minutes,lessons_per_week:weekly,billing_mode:fieldValue(form,'billing_mode'),price:String(price),location:fieldValue(form,'location'),payer_name:form.elements.student_pays.checked?name:fieldValue(form,'payer_name'),payer_email:fieldValue(form,'payer_email'),payer_address:{street:fieldValue(form,'payer_street'),postcode:fieldValue(form,'payer_postcode'),city:fieldValue(form,'payer_city'),country:'Deutschland'}};
   const submit=form.querySelector('[type="submit"]');submit.disabled=true;
   try{
    const existing=(await Promise.all(['active','paused','ended'].map(p_status=>rpc('find_students',{p_query:name,p_status,p_at:today()})))).flat();
    if(duplicateNames(existing,name)&&!confirm('Ein Schüler mit diesem Namen existiert bereits. Trotzdem hinzufügen?'))return;
    const id=await rpc('create_student',{p_details:payload});await detailPage(id,'details');
   }catch(error){showError(error)}finally{if(submit.isConnected)submit.disabled=false}
  });
 }
 async function detailPage(id,tab='lessons'){
   onSubpageChange(true);
  selected=id;view=tab;const token=++sequence;loading();
  try{
   const [current,status,versions,events]=await Promise.all([
    rpc('student_details_at',{p_student_id:id,p_at:today()}),
    rpc('student_status_at',{p_student_id:id,p_at:today()}),
    supabase.from('student_versions').select('*').eq('student_id',id).order('effective_from',{ascending:false}).order('created_at',{ascending:false}),
    supabase.from('student_status_events').select('*').eq('student_id',id).order('effective_from',{ascending:false})
   ]);
   if(versions.error||events.error)throw versions.error||events.error;
   if(!alive||token!==sequence)return;
   const v=(Array.isArray(current)?current[0]:current)||versions.data?.[0];if(!v)throw new Error('Schüler nicht gefunden.');
   const isDetails=tab==='details',payer=v.payer_address||{};
   const editButton=section=>`<button class="e2-edit" data-edit="${section}">Bearbeiten</button>`;
   render(`<header class="e2-heading">${backButton}<div><h1>${escape(v.student_name)}</h1><p class="e2-muted">${escape(v.subject)} · ${escape(studentPrice(v))} · ${escape(statusNames[status]||'Noch nicht begonnen')}</p></div></header><div class="e2-tabs" role="group" aria-label="Schüleransicht"><button data-tab="lessons" aria-pressed="${!isDetails}">Stunden</button><button data-tab="details" aria-pressed="${isDetails}">Details</button></div>${isDetails?
    card('Grundlagen',`<dl>${detail('Name',v.student_name)}${detail('Kurzname',v.nickname)}${detail('Fach',v.subject)}${detail('Beginn',dateLabel(v.start_date))}</dl>`,editButton('basics'))+
    card('Stunden und Preis',`<dl>${detail('Dauer',v.minutes+' Minuten')}${detail('Stunden pro Woche',v.lessons_per_week)}${detail('Preis',studentPrice(v))}${detail('Unterrichtsort',locationNames[v.location])}</dl>`,editButton('pricing'))+
    card('Zahlungspflichtige Person',`<dl>${detail('Name',v.payer_name)}${detail('E-Mail',v.payer_email)}${detail('Straße',payer.street)}${detail('PLZ',payer.postcode)}${detail('Ort',payer.city)}</dl>`,editButton('payer'))+
    card('Status',`<p>${escape(statusNames[status]||'Noch nicht begonnen')}</p><button class="e2-secondary" data-status>Status ändern</button>`)+
    card('Verlauf',`<ol class="e2-history">${(versions.data||[]).map(x=>`<li>Angaben gültig ab ${escape(dateLabel(x.effective_from))} · ${escape(studentPrice(x))}</li>`).join('')}${(events.data||[]).map(x=>`<li>${escape(x.event_type)} ab ${escape(dateLabel(x.effective_from))}</li>`).join('')}</ol>`):
    `<div class="e2-lesson-actions"><button class="e2-primary" data-new-lesson>+ Stunde erfassen</button></div><div id="e2-lessons" aria-live="polite">Stunden werden geladen …</div>`}
    <p role="alert" class="e2-error"></p><div class="e2-finish"><button class="e2-secondary" data-finish>Fertig</button></div>`);
   bind('[data-back]',list);bind('[data-finish]',list);
   root.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>detailPage(id,b.dataset.tab)));
   root.querySelectorAll('[data-edit]').forEach(b=>b.addEventListener('click',()=>editSection(id,v,b.dataset.edit)));
   bind('[data-status]',()=>editStatus(id,v,status));
   bind('[data-new-lesson]',()=>onLessonCreate(id));
   if(!isDetails)await loadLessons(id,token);
  }catch(error){if(token===sequence){render(`<p role="alert" class="e2-error">${escape(germanBackendError(error))}</p><button class="e2-secondary" data-back>Zurück</button>`);bind('[data-back]',list)}}
 }
 async function loadLessons(id,token){
  const box=root.querySelector('#e2-lessons');if(!box)return;
  const response=await supabase.from('active_lessons').select('*').eq('student_id',id).order('lesson_date',{ascending:false}).limit(250);
  if(!alive||token!==sequence)return;
  if(response.error){box.textContent=germanBackendError(response.error);return}
  const groups=groupLessons(response.data||[]);
  box.innerHTML=groups.length?groups.map(g=>card(new Date(g.month+'-01T12:00:00').toLocaleDateString('de-DE',{month:'long',year:'numeric'}),g.items.map(l=>`<button class="e2-student-row" data-lesson="${escape(l.id)}"><span class="e2-row-main"><strong>${escape(dateLabel(l.lesson_date))}</strong><small>${escape(l.status==='held'?'Gehalten':l.status==='cancelled_billable'?'Spät abgesagt':'Abgesagt')} · ${escape(l.minutes)} Min.${l.invoice_id?' · Abgerechnet':''}</small></span><span class="e2-row-price">${escape(money(l.billing_mode==='monthly_flat'||l.charge_override==='not_charged'?0:l.rate))}</span></button>`).join(''))).join(''):'<p class="e2-muted">Noch keine Stunden erfasst.</p>';
  box.querySelectorAll('[data-lesson]').forEach(b=>b.addEventListener('click',()=>onLessonOpen(b.dataset.lesson,id)));
 }
 function editSection(id,v,section){
   onSubpageChange(true);
  ++sequence;
  const address=v.payer_address||{};
  const basics=`<p class="e2-muted">Name: ${escape(v.student_name)} (nicht bearbeitbar)</p>`+input('nickname','Kurzname',v.nickname)+input('subject','Fach',v.subject,'text',true);
  const pricing=input('minutes','Dauer (Minuten)',v.minutes,'number',true)+input('lessons_per_week','Stunden pro Woche',v.lessons_per_week,'number',true)+select('billing_mode','Abrechnung',[['per_lesson','Pro Stunde'],['monthly_flat','Monatspauschale']],v.billing_mode)+input('price','Betrag in Euro',v.billing_mode==='monthly_flat'?v.monthly_fee:v.rate,'number',true)+select('location','Unterrichtsort',[['','Nicht angegeben'],...Object.entries(locationNames)],v.location);
  const payer=input('payer_name','Name',v.payer_name,'text',true)+input('payer_email','E-Mail',v.payer_email,'email')+input('payer_street','Straße',address.street)+input('payer_postcode','PLZ',address.postcode)+input('payer_city','Ort',address.city);
  const labels={basics:'Grundlagen',pricing:'Stunden und Preis',payer:'Zahlungspflichtige Person'};
  const effective=v.billing_mode==='monthly_flat'&&section==='pricing'&&today().slice(-2)!=='01'?nextMonthStart(today()):today();
  render(`<header class="e2-heading">${backButton}<h1>${labels[section]} bearbeiten</h1></header><form id="e2-edit">${card(labels[section],{basics,pricing,payer}[section]+input('effective_from','Gültig ab',effective,'date',true))}<p class="e2-muted">Änderungen werden versioniert. Bereits abgerechnete Stunden bleiben unverändert.</p><p role="alert" class="e2-error"></p>${footer()}</form>`);
  const cancel=()=>detailPage(id,'details');bind('[data-back]',cancel);bind('[data-cancel]',cancel);
  root.querySelector('#e2-edit').addEventListener('submit',async e=>{
   e.preventDefault();const form=e.currentTarget,at=fieldValue(form,'effective_from'),changes={};
   if(!at)return showError('Bitte ein Gültigkeitsdatum angeben.');
   if(section==='basics'){Object.assign(changes,basicsChanges({nickname:fieldValue(form,'nickname'),subject:fieldValue(form,'subject')}));if(!changes.subject)return showError('Fach ist erforderlich.')}
   if(section==='payer'){changes.payer_name=fieldValue(form,'payer_name');changes.payer_email=fieldValue(form,'payer_email');changes.payer_address={...address,street:fieldValue(form,'payer_street'),postcode:fieldValue(form,'payer_postcode'),city:fieldValue(form,'payer_city')};if(!changes.payer_name||!emailValid(changes.payer_email))return showError('Bitte Name und E-Mail prüfen.')}
   if(section==='pricing'){
    changes.minutes=number(form,'minutes');changes.lessons_per_week=number(form,'lessons_per_week');changes.location=fieldValue(form,'location');
    if(!Number.isInteger(changes.minutes)||changes.minutes<=0||!Number.isInteger(changes.lessons_per_week)||changes.lessons_per_week<=0)return showError('Dauer und Häufigkeit müssen positive ganze Zahlen sein.');
    changes.billing_mode=fieldValue(form,'billing_mode');changes.price=String(number(form,'price'));
    if(!(Number(changes.price)>0))return showError('Bitte einen Preis größer als null angeben.');
    if((v.billing_mode==='monthly_flat'||changes.billing_mode==='monthly_flat')&&at.slice(-2)!=='01')return showError('Monatspauschalen können nur am Monatsersten geändert werden.');
   }
   const submit=form.querySelector('[type="submit"]');submit.disabled=true;
   try{
    if(section==='pricing'){
     // The existing RPC handles price and billing-mode changes atomically.
     const {price,billing_mode,...other}=changes;
     await rpc('change_student_with_repricing',{p_student_id:id,p_effective_from:at,p_changes:{...other,price,billing_mode},p_reprice:false,p_idempotency_key:crypto.randomUUID()});
    }else await rpc('change_student',{p_student_id:id,p_effective_from:at,p_changes:changes});
    await detailPage(id,'details');
   }catch(error){showError(error)}finally{if(submit.isConnected)submit.disabled=false}
  });
 }
 function editStatus(id,v,current){
   onSubpageChange(true);
  ++sequence;const effective=v.billing_mode==='monthly_flat'&&today().slice(-2)!=='01'?nextMonthStart(today()):today();
  render(`<header class="e2-heading">${backButton}<h1>Status ändern</h1></header><form id="e2-status">${card('Status',select('event','Aktion',[['pause','Pausieren'],['restart','Wieder starten'],['end','Beenden']],current==='paused'||current==='ended'?'restart':'pause')+input('effective_from','Gültig ab',effective,'date',true)+input('pause_until','Pause bis (optional)','','date'))}<p class="e2-muted">Bei Monatspauschalen beginnen Statusänderungen am Monatsersten.</p><p role="alert" class="e2-error"></p>${footer('Status speichern')}</form>`);
  const cancel=()=>detailPage(id,'details');bind('[data-back]',cancel);bind('[data-cancel]',cancel);
  const form=root.querySelector('#e2-status');
  const update=()=>{form.elements.pause_until.closest('label').hidden=form.elements.event.value!=='pause'};form.elements.event.addEventListener('change',update);update();
  form.addEventListener('submit',async e=>{
   e.preventDefault();const event=fieldValue(form,'event'),at=fieldValue(form,'effective_from'),until=fieldValue(form,'pause_until');
   if(!at||until&&until<at)return showError('Bitte die Gültigkeitsdaten prüfen.');
   if(v.billing_mode==='monthly_flat'&&at.slice(-2)!=='01')return showError('Monatspauschalen beginnen am Monatsersten.');
   if(!confirm('Statusänderung speichern?'))return;
   const submit=form.querySelector('[type="submit"]');submit.disabled=true;
   try{await rpc('set_student_status',{p_student_id:id,p_event:event,p_effective_from:at,p_pause_until:event==='pause'&&until?until:null});await detailPage(id,'details')}
   catch(error){showError(error)}finally{if(submit.isConnected)submit.disabled=false}
  });
 }
 void onBack; // Shell owns navigation away from the Students tab.
 list();
 return ()=>{alive=false;sequence++;root.replaceChildren()};
}
