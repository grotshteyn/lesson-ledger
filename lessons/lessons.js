// E3 isolated UI. The integrator mounts this inside the shell's content root.
export const lessonWeekGroups = (rows) => {
  const monday = date => { const [y,m,day] = date.split('-').map(Number); const d = new Date(Date.UTC(y,m-1,day)); d.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 6) % 7); return d.toISOString().slice(0, 10); };
  const groups = new Map();
  [...rows].sort((a,b) => b.lesson_date.localeCompare(a.lesson_date) || String(b.created_at||'').localeCompare(String(a.created_at||''))).forEach(row => {
    const key = monday(row.lesson_date);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  });
  return [...groups].sort((a,b) => b[0].localeCompare(a[0])).map(([week,items]) => ({week,items}));
};
export const lessonCalendarDays = (year, month) => {
  const first = new Date(year,month,1), offset = (first.getDay()+6)%7;
  return Array.from({length:Math.ceil((offset+new Date(year,month+1,0).getDate())/7)*7},(_,i)=>{
    const d = new Date(year,month,1-offset+i);
    return {date:[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-'),inMonth:d.getMonth()===month};
  });
};
const esc = v => String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const euro = v => Number(v||0).toLocaleString('de-DE',{style:'currency',currency:'EUR'});
const pretty = v => new Date(v+'T12:00:00').toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit',year:'numeric'});
const statusLabel = x => x.status==='held'?'Gehalten':x.status==='cancelled_billable'?'Spät abgesagt oder nicht erschienen':'Abgesagt';
export const lessonSaveFingerprint = (payload) => JSON.stringify([payload.studentId,payload.originalId||null,payload.date,payload.status,payload.minutes,payload.rate]);
const isoToday = () => {const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');};
const control = (label,id,type='text',value='',extra='') => '<label class="ll-field">'+esc(label)+'<input id="'+id+'" type="'+type+'" value="'+esc(value)+'" '+extra+'></label>';
const button = (text,action,kind='') => '<button type="button" class="ll-btn '+kind+'" data-action="'+action+'">'+esc(text)+'</button>';
const unwrap = result => {if(result.error)throw result.error;return result.data;};

/** Mount on a shell-owned content node. No globals, shared styles, or app.js edits.
 * onBack returns to shell tab; onSubpageChange(true) hides the bottom tabs.
 * openLesson(id,studentId) and createLesson(studentId) may be called by Students.
 */
export function mountLessons({root,supabase,onBack=()=>{},onSubpageChange=()=>{},today=isoToday,initialLessonId=null,initialStudentId=null}){
  if(!root || !supabase)throw new Error('root und supabase erforderlich');
  let disposed=false, view='list', students=[], names=new Map(), lessons=[], current=null, fixedStudent=null, draftKey=null, draftFingerprint=null, sheetReturn=null, revision=0, defaultsRevision=0;
  const el = id => root.querySelector('#'+id);
  const html = markup => {if(!disposed)root.innerHTML='<div class="ll-lessons">'+markup+'</div>';};
  const alertError = error => {const n=el('ll-error');if(n)n.textContent=error?.message||String(error);};
  const actions = () => root.querySelectorAll('[data-action]').forEach(b=>b.onclick=()=>dispatch(b.dataset.action));
  const subpage = value => onSubpageChange(Boolean(value));
  async function load(){
    const token=++revision;view='list';subpage(false);
    html('<h2>Stunden</h2><p role="status">Stunden werden geladen …</p>');
    try {
      const [a,b]=await Promise.all([
        supabase.from('active_lessons').select('*').order('lesson_date',{ascending:false}).order('created_at',{ascending:false}).limit(500),
        supabase.from('student_versions').select('student_id,student_name,nickname,effective_from,created_at').lte('effective_from',today()).order('effective_from',{ascending:false}).order('created_at',{ascending:false})
      ]);
      lessons=unwrap(a)||[]; const versions=unwrap(b)||[];
      names=new Map();students=[];
      for(const s of versions)if(!names.has(s.student_id)){names.set(s.student_id,s.student_name);students.push(s);}
      if(disposed||token!==revision)return;
      const currentMonth=today().slice(0,7);
      const monthLessons=lessons.filter(x=>x.lesson_date.slice(0,7)===currentMonth);
      const groups=lessonWeekGroups(monthLessons);
      const monthHeading=new Date(currentMonth+'-01T12:00:00').toLocaleDateString('de-DE',{month:'long',year:'numeric'});
      html('<header class="ll-heading"><h2>Stunden</h2></header><div class="ll-groups"><h3>'+esc(monthHeading)+'</h3>'+(groups.length?groups.map(g=>'<section><h3>Woche ab '+pretty(g.week)+'</h3><div class="ll-card">'+g.items.map(x=>'<button class="ll-list-row" data-open="'+esc(x.id)+'" data-student="'+esc(x.student_id)+'"><span><strong>'+pretty(x.lesson_date)+'</strong><small>'+esc(names.get(x.student_id)||'Unbekannter Schüler')+' · '+statusLabel(x)+'</small></span><b>'+euro(x.status==='held'||x.status==='cancelled_billable'?x.rate:0)+'</b></button>').join('')+'</div></section>').join(''):'<p class="ll-card">Noch keine Stunden erfasst.</p>')+'</div><div class="ll-floating">'+button('+ Stunde erfassen','new','ll-primary')+'</div>');
      actions();root.querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>openLesson(b.dataset.open,b.dataset.student));
    }catch(e){if(token===revision){html('<h2>Stunden</h2><p role="alert">'+esc(e.message)+'</p>'+button('Erneut versuchen','reload'));actions();}}
  }
  async function openLesson(id,studentId){
    ++revision;view='detail';subpage(true);html('<p role="status">Stunde wird geladen …</p>');
    try{
      const x=unwrap(await supabase.from('lessons').select('*').eq('id',id).single());if(disposed||view!=='detail')return;
      current=x;fixedStudent=studentId||x.student_id;
      const history=unwrap(await supabase.from('lessons').select('id,lesson_date,created_at,status,rate,minutes').eq('student_id',x.student_id).order('created_at',{ascending:false}).limit(30));
      html('<header class="ll-heading">'+button('Zurück','list')+'<h2>Stunde bearbeiten</h2></header><section class="ll-card"><h3>'+pretty(x.lesson_date)+'</h3><p>'+esc(names.get(x.student_id)||'Schüler')+'</p><p>'+statusLabel(x)+' · '+esc(x.minutes)+' Min. · '+euro(x.rate)+'</p></section>'+(x.invoice_id?'<p class="ll-card" role="status">Diese Stunde ist bereits abgerechnet und kann nicht verändert werden.</p>':'<div class="ll-actions">'+button('Bearbeiten','edit','ll-primary')+button('Entfernen','remove')+'</div>')+'<section class="ll-card"><h3>Verlauf</h3>'+history.map(h=>'<p>'+pretty(h.lesson_date)+' · '+statusLabel(h)+' · '+euro(h.rate)+' <small>'+esc(h.created_at)+'</small></p>').join('')+'</section><p id="ll-error" role="alert"></p>'+button('Fertig','list'));
      actions();
    }catch(e){html('<p role="alert">'+esc(e.message)+'</p>'+button('Zurück','list'));actions();}
  }
  async function createLesson(studentId=null,original=null){
    ++revision;view='form';subpage(true);current=original;fixedStudent=studentId||original?.student_id||null;draftKey=crypto.randomUUID();draftFingerprint=null;
    const date=original?.lesson_date||today();
    html('<p role="status">Formular wird geladen …</p>');
    try{
      if(!students.length){const r=unwrap(await supabase.from('student_versions').select('student_id,student_name,effective_from,created_at').lte('effective_from',today()).order('effective_from',{ascending:false}).order('created_at',{ascending:false}));const seen=new Set();students=r.filter(s=>{if(seen.has(s.student_id))return false;seen.add(s.student_id);return true;});}
      renderForm(date,original);
      if(original){
        const historyTarget=el('ll-edit-history');
        try{
          const history=unwrap(await supabase.from('lessons').select('id,lesson_date,created_at,status,rate,minutes').eq('student_id',original.student_id).order('created_at',{ascending:false}).limit(30));
          if(view==='form'&&current?.id===original.id&&historyTarget?.isConnected){
            historyTarget.innerHTML=(history||[]).map(h=>'<p>'+pretty(h.lesson_date)+' · '+statusLabel(h)+' · '+euro(h.rate)+' <small>'+esc(h.created_at)+'</small></p>').join('')||'<p>Keine Einträge vorhanden.</p>';
          }
        }catch(e){if(historyTarget?.isConnected)historyTarget.textContent='Verlauf konnte nicht geladen werden.';}
      }
      if(fixedStudent)await defaults(fixedStudent,date,!original);
    }catch(e){alertError(e);}
  }
  function renderForm(date,original){
    html('<header class="ll-heading"><h2>'+(original?'Stunde bearbeiten':'Neue Stunde')+'</h2>'+button('Abbrechen','list')+'</header><section class="ll-card">'+(fixedStudent?'<p><strong>'+esc(students.find(s=>s.student_id===fixedStudent)?.student_name||names.get(fixedStudent)||'Schüler')+'</strong></p>':'<label class="ll-field">Schüler suchen<input id="ll-search" type="search" placeholder="Name oder Kurzname" autocomplete="off"></label><div id="ll-students" class="ll-student-scroll" role="listbox" aria-label="Schüler auswählen"></div><p id="ll-selection">Bitte Schüler auswählen</p>')+'<div class="ll-quick">'+button('Heute','today')+button('Gestern','yesterday')+button('Datum wählen','calendar')+'</div>'+control('Datum','ll-date','date',date,'required')+'<label class="ll-field">Status<select id="ll-status"><option value="held">Gehalten</option><option value="cancelled_billable">Spät abgesagt oder nicht erschienen</option></select></label>'+control('Dauer (Minuten)','ll-minutes','number',original?.minutes??60,'min="5" max="240" step="1"')+control('Preis (€)','ll-rate','number',original?.rate??0,'min="0" step="0.01"')+'<p class="ll-muted">0 € bedeutet: nicht berechnen.</p></section>'+(original?'<section class="ll-card"><h3>Verlauf</h3><div id="ll-edit-history" role="status">Verlauf wird geladen …</div></section>':'')+'<p id="ll-error" role="alert"></p><div class="ll-actions">'+button('Abbrechen','list')+button('Speichern','save','ll-primary')+'</div>');
    if(original)el('ll-status').value=original.status==='cancelled_billable'?'cancelled_billable':'held';
    if(!fixedStudent){const search=el('ll-search');search.oninput=()=>showStudents(search.value);showStudents('');}
    el('ll-date').onchange=()=>{if(fixedStudent&&!original)defaults(fixedStudent,el('ll-date').value,true);};
    actions();
  }
  function showStudents(query){
    const target=el('ll-students');if(!target)return;
    const q=query.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('de');
    const rows=students.filter(s=>(s.student_name+' '+(s.nickname||'')).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('de').includes(q)).slice(0,50);
    target.innerHTML=rows.map(s=>'<button type="button" role="option" aria-selected="'+(fixedStudent===s.student_id)+'" data-pick="'+esc(s.student_id)+'">'+esc(s.student_name)+'</button>').join('')||'<p>Keine Treffer</p>';
    target.querySelectorAll('[data-pick]').forEach(b=>b.onclick=async()=>{fixedStudent=b.dataset.pick;el('ll-selection').textContent=students.find(s=>s.student_id===fixedStudent)?.student_name||'';showStudents(el('ll-search').value);await defaults(fixedStudent,el('ll-date').value,true);});
  }
  async function defaults(id,date,update){
    if(!date)return;
    const request=++defaultsRevision;
    try{
      const rows=unwrap(await supabase.rpc('student_details_at',{p_student_id:id,p_at:date}));
      if(!rows || (Array.isArray(rows)&&!rows.length))throw Error('Keine Schülerdaten für dieses Datum.');
      if(update&&request===defaultsRevision&&view==='form'&&fixedStudent===id&&el('ll-date')?.value===date){const details=Array.isArray(rows)?rows[0]:rows;el('ll-minutes').value=details.minutes;el('ll-rate').value=details.billing_mode==='monthly_flat'?0:details.rate;}
    }catch(e){alertError(e);}
  }
  function sheet(content,buttons){
    sheetReturn=document.activeElement;
    const overlay=document.createElement('div');overlay.className='ll-overlay';overlay.innerHTML='<section class="ll-sheet" role="dialog" aria-modal="true" aria-label="Bestätigung">'+content+'<div class="ll-actions">'+buttons+'</div></section>';
    root.append(overlay);const close=()=>{overlay.remove();sheetReturn?.focus?.();};
    overlay.addEventListener('click',e=>{if(e.target===overlay)close();});
    const escKey=e=>{if(e.key==='Escape'){close();document.removeEventListener('keydown',escKey);}};
    document.addEventListener('keydown',escKey);overlay.querySelector('button')?.focus();
    return {overlay,close};
  }
  function calendar(){
    const selected=el('ll-date').value||today(),initial=new Date(selected+'T12:00:00');let year=initial.getFullYear(),month=initial.getMonth();
    const {overlay,close}=sheet('<h3>Datum wählen</h3><div id="ll-calendar"></div>',button('Abbrechen','cancel'));
    overlay.querySelector('[data-action="cancel"]').onclick=close;
    const render=()=>{
      const dates=new Set(lessons.filter(x=>x.student_id===fixedStudent).map(x=>x.lesson_date));
      const target=overlay.querySelector('#ll-calendar');
      target.innerHTML='<div class="ll-cal-head"><button type="button" data-shift="-1" aria-label="Vorheriger Monat">‹</button><strong>'+new Date(year,month,1).toLocaleDateString('de-DE',{month:'long',year:'numeric'})+'</strong><button type="button" data-shift="1" aria-label="Nächster Monat">›</button></div><div class="ll-calendar">'+['Mo','Di','Mi','Do','Fr','Sa','So'].map(x=>'<b>'+x+'</b>').join('')+lessonCalendarDays(year,month).map(d=>'<button type="button" data-day="'+d.date+'" class="'+(!d.inMonth?'ll-outside ':'')+(d.date===selected?'ll-selected ':'')+(d.date===today()?'ll-today ':'')+'" aria-label="'+pretty(d.date)+'" aria-pressed="'+(d.date===selected)+'">'+Number(d.date.slice(-2))+(dates.has(d.date)?'<span class="ll-dot" aria-hidden="true"></span>':'')+'</button>').join('')+'</div>';
      target.querySelectorAll('[data-shift]').forEach(b=>b.onclick=()=>{month+=Number(b.dataset.shift);const d=new Date(year,month,1);year=d.getFullYear();month=d.getMonth();render();});
      target.querySelectorAll('[data-day]').forEach(b=>b.onclick=()=>{el('ll-date').value=b.dataset.day;el('ll-date').dispatchEvent(new Event('change'));close();});
    };render();
  }
  function compare(existing,proposed,proceed){
    const rows = x => '<p>'+pretty(x.lesson_date)+' · '+esc(x.minutes)+' Min. · '+statusLabel(x)+' · '+euro(x.rate)+'</p>';
    const {overlay,close}=sheet('<h3>Stunde bereits vorhanden</h3><p>An diesem Tag ist bereits eine Stunde erfasst.</p><div class="ll-compare"><div><strong>Vorhanden</strong>'+rows(existing)+'</div><div><strong>Neu</strong>'+rows(proposed)+'</div></div>',button('Abbrechen','cancel')+button('Zweite speichern','confirm','ll-primary'));
    overlay.querySelector('[data-action="cancel"]').onclick=close;
    overlay.querySelector('[data-action="confirm"]').onclick=()=>{close();proceed();};
  }
  async function save(confirmInactive=false,confirmDuplicate=false){
    const btn=root.querySelector('[data-action="save"]');if(btn?.disabled)return;if(btn)btn.disabled=true;
    const date=el('ll-date').value,minutes=Number(el('ll-minutes').value),rate=Number(el('ll-rate').value),status=el('ll-status').value;
    if(!fixedStudent||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!['held','cancelled_billable'].includes(status)||!Number.isInteger(minutes)||minutes<5||minutes>240||!Number.isFinite(rate)||rate<0){alertError(Error('Bitte Schüler, Datum, Dauer (5–240) und einen Preis ab 0 € prüfen.'));if(btn)btn.disabled=false;return;}
    const fingerprint=lessonSaveFingerprint({studentId:fixedStudent,originalId:current?.id,date,status,minutes,rate});
    if(draftFingerprint!==fingerprint){draftKey=crypto.randomUUID();draftFingerprint=fingerprint;}
    const params={p_lesson_date:date,p_status:status,p_minutes:minutes,p_rate:rate,p_idempotency_key:draftKey,p_confirm_inactive:confirmInactive,p_confirm_duplicate:confirmDuplicate};
    const rpc=current?'replace_lesson_v2':'log_lesson_v2';
    if(current)params.p_old_lesson_id=current.id;else params.p_student_id=fixedStudent;
    try{
      const result=unwrap(await supabase.rpc(rpc,params));
      if(result?.state==='inactive'){
        const {overlay,close}=sheet('<h3>Inaktiver Schüler</h3><p>Der Schüler ist an diesem Datum nicht aktiv. Trotzdem speichern?</p>',button('Abbrechen','cancel')+button('Trotzdem speichern','confirm','ll-primary'));
        overlay.querySelector('[data-action="cancel"]').onclick=()=>{close();if(btn)btn.disabled=false;};
        overlay.querySelector('[data-action="confirm"]').onclick=()=>{close();save(true,confirmDuplicate);};return;
      }
      if(result?.state==='duplicate'){
        const existing=lessons.find(x=>x.student_id===fixedStudent&&x.lesson_date===date&&x.id!==current?.id);
        if(!existing){alertError(Error('Eine vorhandene Stunde wurde vom Server gemeldet, aber nicht geladen. Bitte Liste aktualisieren.'));return;}compare(existing,{lesson_date:date,minutes,status,rate},()=>save(confirmInactive,true));return;
      }
      if(result?.state!=='saved')throw Error('Speichern wurde nicht bestätigt.');
      await load();
    }catch(e){alertError(e);}finally{if(btn)btn.disabled=false;}
  }
  async function remove(){
    if(current?.invoice_id)return;
    const {overlay,close}=sheet('<h3>Stunde entfernen?</h3><p>Die Änderung bleibt im Verlauf nachvollziehbar.</p>',button('Abbrechen','cancel')+button('Entfernen','confirm','ll-primary'));
    overlay.querySelector('[data-action="cancel"]').onclick=close;
    overlay.querySelector('[data-action="confirm"]').onclick=async()=>{close();try{unwrap(await supabase.rpc('void_lesson',{p_lesson_id:current.id,p_reason:'remove',p_idempotency_key:crypto.randomUUID()}));await load();}catch(e){alertError(e);}};
  }
  function dispatch(action){
    if(action==='new')createLesson();
    else if(action==='reload'||action==='list')load();
    else if(action==='edit')createLesson(current.student_id,current);
    else if(action==='remove')remove();
    else if(action==='calendar')calendar();
    else if(action==='save')save();
    else if(action==='today'||action==='yesterday'){const d=new Date();if(action==='yesterday')d.setDate(d.getDate()-1);el('ll-date').value=[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');el('ll-date').dispatchEvent(new Event('change'));}
  }
  load();
  return {destroy(){disposed=true;revision++;root.replaceChildren();subpage(false);},openLesson,createLesson,refresh:load};
}
