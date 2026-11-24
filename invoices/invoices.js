import {openSectionSheet,parseSection} from '../frontend/settings-sections.js?v=3';
import {actionBar} from '../frontend/action-bar.js';
// E4 invoice UI. All fixture amounts are display-only backend-shaped values.
// Never call provisional invoice RPCs until issue #55 defines their contracts.
export const E4_STORIES = ['IN-1','IN-2','IN-4','IN-5'];
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const eur=value=>new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR'}).format(typeof value==='string'?Number(value):Number(value)/100); // decimal strings from E4 API; legacy fixture cents accepted
const invoiceLineLabel=(description,subject='')=>{
 const raw=String(description??'');
 const named=subject?raw.replace(/Unterrichtsstunde/gi,subject):raw;
 return named.replace(/\s+\d{2}\.\d{2}\.\d{4}\s*$/,'').trim();
};
const monthLabel=m=>new Date(String(m).slice(0,7)+'-01T12:00:00').toLocaleDateString('de-DE',{month:'long',year:'numeric'});
export const groupInvoices=rows=>Object.entries(rows.reduce((a,r)=>{(a[r.billingMonth]??=[]).push(r);return a;},{})).sort(([a],[b])=>b.localeCompare(a)).map(([month,items])=>({month,items:items.sort((a,b)=>({ready:0,missing_details:1,in_progress:2,issued:3,cancelled:4}[a.status]??5)-({ready:0,missing_details:1,in_progress:2,issued:3,cancelled:4}[b.status]??5)),totalCents:items.reduce((sum,x)=>sum+Math.round((typeof x.totalCents==='string'?Number(x.totalCents):Number(x.totalCents)/100)*100),0)}));
export const readyInvoices=(rows,asOf=new Date())=>rows.filter(r=>r.status==='ready'&&r.billingMonth< [asOf.getFullYear(),String(asOf.getMonth()+1).padStart(2,'0')].join('-'));
/** Convert draft v0.1 API responses into the view model, without calculating monetary values. */
export function adaptOverview(response){
 const out=[];
 for(const month of response.months||[]){
  const billingMonth=String(month.billing_month).slice(0,7);
  for(const r of month.candidates||[])out.push({id:'draft:'+r.student_id+':'+billingMonth,studentId:r.student_id,student:r.student_name?.trim()||'Schülername wird geladen',billingMonth,status:r.status,totalCents:r.gross_amount,validationErrors:r.validation_errors||[],kind:'draft'});
  for(const r of month.issued||[])out.push({id:r.invoice_id,studentId:r.student_id,student:r.student_name||'Schülername wird geladen',billingMonth,status:r.status,totalCents:r.gross_amount,number:r.invoice_number,kind:'issued',pdfStatus:r.pdf_status});
 }
 return out;
}
export function adaptPreview(raw){
 return {...raw,id:'draft:'+raw.student_id+':'+String(raw.billing_month).slice(0,7),studentId:raw.student_id,billingMonth:String(raw.billing_month).slice(0,7),subject:raw.subject||raw.student?.subject||raw.student_subject||'',student:raw.student_name||raw.payer?.name||'Schülername fehlt',payer:raw.payer?.name,address:formatAddress(raw.payer?.address),status:(raw.validation_errors||[]).length?'missing_details':'ready',totalCents:raw.gross_amount,lines:raw.lines||[],excludedLessons:raw.excluded_lessons||[],vatNote:raw.vat_note||'',validationErrors:raw.validation_errors||[],warnings:raw.warnings||[],teacher:raw.teacher,invoiceDate:raw.invoice_date,dueDate:raw.due_date};
}
const demoTeacher={name:'Maria Keller',address:'Seestr. 4, 78462 Konstanz',tax_number:'09/123/45678',iban:'DE12 3456 7890 1234 5678 90',payment_terms:'Zahlbar innerhalb von 14 Tagen'};
const demo=[
 {id:'d1',student:'Anna Becker',billingMonth:'2026-11',status:'ready',totalCents:10500,lessons:[3,17,24],teacher:demoTeacher,vatNote:'Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.',excludedLessons:[{description:'10. November · spät abgesagt, nicht berechnet'}],payer:'Anna Becker',address:'Lindenweg 7, 78464 Konstanz'},
 {id:'d2',student:'Anna Schulz',billingMonth:'2026-11',status:'ready',totalCents:12500,lessons:[4,11,18,25]},
 {id:'d3',student:'Clara Hoffmann',billingMonth:'2026-11',status:'ready',totalCents:14000,lessons:[5,12,19,26],billingMode:'monthly_flat'},
 {id:'d4',student:'David Klein',billingMonth:'2026-11',status:'missing_details',totalCents:7000,lessons:[9,23],teacher:demoTeacher,vatNote:'Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.',payer:'Petra Klein',missing:['payer_address']},
 {id:'i1',student:'Ben Wagner',billingMonth:'2026-11',status:'issued',totalCents:16000,number:'2026-0007',teacher:demoTeacher,vatNote:'Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.',lessons:[6,13,20,27]},
 {id:'d5',student:'Clara Hoffmann',billingMonth:'2026-10',status:'ready',totalCents:3500,lessons:[8]},
 {id:'i2',student:'Ben Wagner',billingMonth:'2026-10',status:'issued',totalCents:16000,number:'2026-0006',lessons:[2,9,16,23]},
 {id:'i3',student:'Anna Schulz',billingMonth:'2026-10',status:'issued',totalCents:10000,number:'2026-0005',lessons:[1,8,15,22]},
 {id:'p1',student:'Anna Schulz',billingMonth:'2026-12',status:'in_progress',totalCents:2500,lessons:[2]}
];
const formatAddress=value=>typeof value==='string'?value:[value?.street,value?.postcode&&value?.city?[value.postcode,value.city].join(' '):value?.postcode||value?.city,value?.country].filter(Boolean).join(', ');
const vatLabel=mode=>mode==='small_business'?'Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.':mode==='exempt_teaching'?'Steuerbefreiter Unterricht gemäß § 4 Nr. 21 UStG.':mode==='regular_19'?'Enthält 19 % Umsatzsteuer.':'Umsatzsteuer gemäß Rechnungseinstellungen.';
export function adaptIssued(raw,overview={}){
 const snapshot=raw.snapshot||{};
 return {...adaptPreview({...snapshot,student_id:raw.student_id||snapshot.student_id,billing_month:raw.billing_month||snapshot.billing_month,student_name:snapshot.student_name||overview.student,payer:snapshot.payer||{},teacher:snapshot.teacher||{},gross_amount:raw.gross_amount,lines:raw.lines||snapshot.lines||[],validation_errors:[]}),
 id:raw.invoice_id,status:raw.status||'issued',number:raw.invoice_number,kind:raw.kind,
 invoiceDate:raw.issued_on,dueDate:raw.due_on,pdfStatus:raw.pdf_status,
 vatNote:vatLabel(raw.vat_mode||snapshot.vat_mode),totalCents:raw.gross_amount};
}
/** Authenticated live RPC adapter. No anonymous or service-role credentials. */
export function supabaseInvoiceAdapter(supabase){
 const rpc=async(name,args)=>{const {data,error}=await supabase.rpc(name,args);if(error)throw error;return data;};
 const today=()=>new Date().toLocaleDateString('sv-SE',{year:'numeric',month:'2-digit',day:'2-digit'});
 const previousMonth=()=>{const d=new Date();return new Date(d.getFullYear(),d.getMonth()-1,1).toLocaleDateString('sv-SE',{year:'numeric',month:'2-digit',day:'2-digit'});};
 const enrichSubject=async row=>{
   if(row.subject||!row.studentId)return row;
   try{
     const {data}=await supabase.from('student_versions').select('subject')
       .eq('student_id',row.studentId).order('effective_from',{ascending:true}).limit(1).maybeSingle();
     if(data?.subject)row.subject=data.subject;
   }catch(e){console.warn('Invoice subject lookup failed',e);}
   return row;
 };
 return {mode:'live',
 async list(){
 const rows=adaptOverview(await rpc('list_invoice_overview',{p_through_month:previousMonth()}));
 const missing=rows.filter(r=>!r.student||r.student==='Schülername wird geladen'||r.student==='Schülername fehlt');
 if(missing.length){
  try{
   // Existing owner-scoped RPC includes paused students; direct student_versions access can be RLS-filtered.
   const students=await rpc('find_students',{p_query:'',p_status:null,p_at:today()});
   const names=new Map((students||[]).map(x=>[x.student_id,x.student_name]));
   for(const row of rows)if(names.get(row.studentId))row.student=names.get(row.studentId);
  }catch(e){console.warn('E4 student-name lookup failed',e);}
 }
 for(const row of rows)if(!row.student||row.student.startsWith('Schülername wird'))row.student='Schülername nicht verfügbar';

 return rows;
},
 async preview(id){const parts=id.split(':');const result=adaptPreview(await rpc('get_invoice_preview',{p_student_id:parts[1],p_billing_month:parts[2]+'-01'}));return enrichSubject(result);},
 async get(id){return enrichSubject(adaptIssued(await rpc('get_invoice',{p_invoice_id:id})));},
 async issue(items,key){return rpc('issue_invoices',{p_selections:items.map(x=>({student_id:x.studentId,billing_month:x.billingMonth+'-01'})),p_idempotency_key:key});},
 async cancel(id,key){return rpc('cancel_invoice',{p_invoice_id:id,p_idempotency_key:key});},
 async pdf(id){const {data,error}=await supabase.functions.invoke('invoice-pdf',{body:{invoice_id:id}});if(error)throw error;if(data?.status!=='ready'||!/^https:\/\//.test(data.url||''))throw new Error('Kein gültiger PDF-Link vom Backend.');return data.url;},
 async loadPayer(id){const {data,error}=await supabase.from('student_versions').select('payer_name,payer_address,payer_email').eq('student_id',id).lte('effective_from',today()).order('effective_from',{ascending:false}).order('created_at',{ascending:false}).limit(1);if(error)throw error;return data?.[0]||{};},
 async savePayer(id,changes){return rpc('change_student',{p_student_id:id,p_effective_from:today(),p_changes:changes});},
 async loadSettings(){const ledger=await rpc('ensure_my_ledger',{});const {data,error}=await supabase.from('billing_settings_versions').select('*').eq('ledger_id',ledger).lte('effective_from',today()).order('effective_from',{ascending:false}).order('created_at',{ascending:false}).limit(1);if(error)throw error;return {ledger,settings:data?.[0]||null};},
 async saveSettings(ledger,changes){const {data,error}=await supabase.from('billing_settings_versions').insert({...changes,ledger_id:ledger,effective_from:today()}).select('id').single();if(error)throw error;return data;}
 };
}
export function fixtureInvoiceAdapter(){
 const rows=demo.map(r=>({...r,lessons:[...r.lessons]}));
 return {mode:'fixture',async list(){return rows.map(r=>({...r}));},async preview(id){return rows.find(r=>r.id===id)||null;},async get(id){return rows.find(r=>r.id===id)||null;}};
}
export function mountInvoices({root,onSubpageChange=()=>{},adapter=fixtureInvoiceAdapter()}){
 let rows=[],view='list',current=null,selected=new Set(),notice='',result=[],disposed=false,busy=false;
 const status={ready:'Bereit',missing_details:'Angaben fehlen',in_progress:'Geplant',issued:'Ausgestellt',cancelled:'Storniert'};
 const button=(label,action,extra='')=>'<button type="button" data-e4="'+action+'" '+extra+'>'+esc(label)+'</button>';
 const card=(title,body,action='')=>'<section class="e4-card"><div class="e4-card-heading"><h3>'+title+'</h3>'+action+'</div>'+body+'</section>';
 const line=r=>'<div class="e4-line '+esc(r.status)+'"><button type="button" data-open="'+esc(r.id)+'"><span class="e4-line-top"><span class="e4-student-name">'+esc(r.student||'Schülername nicht verfügbar')+'</span><strong>'+eur(r.totalCents)+'</strong></span><span class="e4-line-bottom"><span class="e4-line-meta">'+esc((r.number?r.number+' · ':'')+monthLabel(r.billingMonth))+'</span><small>'+esc(status[r.status]||r.status)+'</small></span></button>'+(r.status==='issued'&&adapter.mode==='live'?button('PDF ↓','pdf-'+r.id,'class="e4-row-pdf" aria-label="PDF für '+esc(r.student||r.number||'Rechnung')+' herunterladen"'):'')+'</div>';
 const groups=items=>groupInvoices(items).map(g=>'<section class="e4-month"><h2>'+esc(monthLabel(g.month))+' <span>'+eur(g.totalCents)+'</span></h2><div class="e4-rows">'+g.items.map(line).join('')+'</div></section>').join('');
 const foot=(html,placement='bottom')=>placement==='floating'?'<div class="e4-foot">'+html+'</div>':actionBar(html,{placement,count:(html.match(/<button\b/g)||[]).length===1?1:2,context:'invoice'});
 const warning=msg=>'<p class="e4-warning" role="status">'+esc(msg)+'</p>';
 const show=(html,sub=false)=>{if(disposed)return;onSubpageChange(sub);root.innerHTML='<div class="e4">'+(adapter.mode==='fixture'?'<div class="e4-demo">Vorschau mit Beispieldaten · keine echten Rechnungen</div>':'')+(notice?warning(notice):'')+html+'</div>';};
 const home=()=>{view='list';current=null;show((rows.length?groups(rows):'<p class="e4-empty">Noch keine abrechenbaren Rechnungen für abgeschlossene Monate.</p>')+(readyInvoices(rows).length?foot(button('Rechnungen ausstellen','batch'),'floating'):foot('<button disabled>Rechnungen ausstellen</button>','floating')));};
 const refresh=async()=>{rows=await adapter.list();if(!disposed)home();};
 const downloadPdf=async id=>{try{const url=await adapter.pdf(id);const a=document.createElement('a');a.href=url;a.target='_blank';a.rel='noopener noreferrer';a.click();}catch(e){notice='PDF konnte nicht geladen werden: '+(e.message||'Unbekannter Fehler');await details(id);}};
 const issueLive=async(items)=>{if(busy||!items.length)return;
  if(!window.confirm(items.length+' Rechnung(en) jetzt verbindlich ausstellen? Die Rechnungen erhalten Nummern und können danach nur storniert werden.'))return;
  busy=true;const key=crypto.randomUUID();try{
   const response=await adapter.issue(items,key);
   result=(response.results||[]).map(x=>({...items.find(y=>y.studentId===x.student_id&&y.billingMonth===String(x.billing_month).slice(0,7)),resultStatus:x.status,resultError:x.error_code||'',number:x.invoice_number}));
   view='results';show('<h2>Ergebnis der Ausstellung</h2>'+result.map(x=>'<div class="e4-result '+(x.resultStatus==='issued'?'e4-result-ok':'e4-result-failed')+'"><strong>'+esc(x.student||'Rechnung')+'</strong><span>'+esc(x.resultStatus==='issued'?'Rechnung '+x.number:'Fehler: '+x.resultError)+'</span></div>').join('')+foot(button('Fertig','refresh')),true);
  }catch(e){notice='Ausstellung fehlgeschlagen: '+(e.message||'Unbekannter Fehler');if(view==='batch')drawBatch();else await details(current.id);}
  finally{busy=false;}
 };
 const cancelLive=async()=>{if(busy||!current?.id)return;
  if(!window.confirm('Rechnung '+current.number+' verbindlich stornieren? Es wird eine nummerierte Stornorechnung erstellt und die Unterrichtsstunden werden freigegeben.'))return;
  busy=true;try{const x=await adapter.cancel(current.id,crypto.randomUUID());view='cancelled';show('<h2>Rechnung storniert</h2><div class="e4-cancellation"><p>Stornorechnung '+esc(x.invoice_number)+'</p><p>Die Stunden sind wieder für eine korrigierte Abrechnung verfügbar.</p></div>'+foot(button('Fertig','refresh')),true);}
  catch(e){notice='Stornierung fehlgeschlagen: '+(e.message||'Unbekannter Fehler');correction();}
  finally{busy=false;}
 };
 const demoResults=()=>{view='results';result=[...selected].map((id,i)=>{const r=rows.find(x=>x.id===id);return {...r,resultStatus:i===1?'failed':'issued',resultError:i===1?'Beispiel: Angaben wurden zwischen Vorschau und Ausstellung geändert':null,number:i===1?null:'DEMO-'+String(i+1).padStart(4,'0')};});show('<h2>Ergebnis der Ausstellung (Demo)</h2>'+warning('Nur eine Vorschau des Ablaufs. Es wurden keine Rechnungen ausgestellt oder gespeichert.')+groupInvoices(result).map(g=>'<section class="e4-month"><h3>'+esc(monthLabel(g.month))+'</h3><div class="e4-rows">'+g.items.map(r=>'<div class="e4-result '+(r.resultStatus==='issued'?'e4-result-ok':'e4-result-failed')+'"><strong>'+esc(r.student)+'</strong><span>'+(r.resultStatus==='issued'?'Beispielnummer '+esc(r.number):'Fehlgeschlagen: '+esc(r.resultError))+'</span><b>'+eur(r.totalCents)+'</b></div>').join('')+'</div></section>').join('')+foot(button('Fertig','home')),true);};
 const demoCancelled=()=>{view='cancelled';show('<h2>Rechnung storniert (Demo)</h2>'+warning('Dies ist nur eine Ablaufvorschau. Die echte Rechnung bleibt unverändert.')+'<p>'+esc(current.student)+' · '+esc(monthLabel(current.billingMonth))+'</p><div class="e4-cancellation"><b>Stornorechnung</b><strong>Beispielbetrag −'+eur(current.totalCents)+'</strong><p>Die zugehörigen Stunden werden nach einer echten Stornierung wieder freigegeben. Danach können sie korrigiert und neu abgerechnet werden.</p><p>Stornorechnung und neue Rechnung müssen an den Zahler gesendet werden.</p></div>'+foot(button('Fertig','home')),true);};
 const issueAndDownload=async()=>{if(busy||!current||current.status!=='ready'||adapter.mode!=='live')return;
  if(!window.confirm('Rechnung verbindlich ausstellen und PDF herunterladen? Die Rechnungsnummer wird endgültig vergeben.'))return;
  const draft=current;busy=true;notice='';
  const action=root.querySelector('[data-e4="issue-download"]');if(action){action.disabled=true;action.textContent='Wird ausgestellt…';}
  try{
   const response=await adapter.issue([{studentId:draft.studentId,billingMonth:draft.billingMonth}],crypto.randomUUID());
   const outcome=(response.results||[]).find(x=>x.student_id===draft.studentId&&String(x.billing_month).slice(0,7)===draft.billingMonth);
   if(!outcome||outcome.error_code||['failed','error','rejected'].includes(outcome.status))throw new Error(outcome?.error_code||'Rechnung konnte nicht ausgestellt werden.');
   // Refresh from the authoritative overview. Never reissue when PDF retrieval fails.
   rows=await adapter.list();
   const issued=rows.find(x=>x.studentId===draft.studentId&&x.billingMonth===draft.billingMonth&&x.status==='issued');
   const issuedId=outcome.invoice_id||issued?.id;
   if(!issuedId)throw new Error('Rechnung ausgestellt. Bitte die Übersicht aktualisieren, um das PDF herunterzuladen.');
   await details(issuedId);
   try{await downloadPdf(issuedId);}catch(e){notice='PDF-Download fehlgeschlagen. Die Rechnung ist bereits ausgestellt.';await details(issuedId);}
  }catch(e){
   notice='Ausstellung konnte nicht abgeschlossen werden: '+(e.message||'Unbekannter Fehler');
   // A lost response may follow successful issuance; refresh before allowing another attempt.
   try{rows=await adapter.list();const issued=rows.find(x=>x.studentId===draft.studentId&&x.billingMonth===draft.billingMonth&&x.status==='issued');if(issued){await details(issued.id);return;}}catch(_){}
   await details(draft.id);
  }finally{busy=false;}
 };
 const details=async id=>{try{const overview=rows.find(r=>r.id===id);current=await (overview?.kind==='issued'||(!id.startsWith('draft:')&&adapter.mode==='live')?adapter.get(id):adapter.preview(id));if(current&&overview?.student)current.student=overview.student;}catch(e){notice='Rechnung konnte nicht geladen werden: '+(e.message||'Unbekannter Fehler');home();return;}if(!current)return;view='detail';
 const r=current,issued=r.kind==='standard'||r.kind==='cancellation'||r.status==='issued'||r.status==='cancelled',missing=r.status==='missing_details';
 const errors=r.validationErrors||[];
 const errorLabels={payer_address_missing:'Rechnungsadresse fehlt',payer_name_missing:'Name der zahlungspflichtigen Person fehlt',teacher_iban_missing:'IBAN fehlt',teacher_tax_number_missing:'Steuernummer fehlt',teacher_settings_missing:'Rechnungseinstellungen fehlen',teacher_vat_mode_missing:'Umsatzsteuer-Einstellung fehlt',student_details_missing:'Schülerdaten fehlen',no_billable_items:'Keine abrechenbaren Stunden',already_billed:'Bereits abgerechnet',month_not_finished:'Abrechnungsmonat ist noch nicht abgeschlossen'};
 const inlineErrors=(codes,action)=>{const matching=errors.filter(code=>codes.includes(code));return matching.length?'<div class="e4-inline-warning" role="status">'+matching.map(code=>'<p>'+esc(errorLabels[code]||code)+'</p>').join('')+(issued?'':button(action==='payer'?'Angaben ergänzen':'Rechnungseinstellungen bearbeiten',action))+'</div>':'';};
 const from=card('Von','<p>'+esc(r.teacher?.name||'Rechnungssteller laut gültigen Einstellungen')+'</p><p>'+esc(formatAddress(r.teacher?.address))+'</p>'+(r.teacher?.tax_number?'<p>Steuernummer '+esc(r.teacher.tax_number)+'</p>':'')+inlineErrors(['teacher_settings_missing'],'settings')+inlineErrors(['teacher_tax_number_missing','teacher_vat_mode_missing'],'payment-settings'),!issued?'<a href="#" data-e4="settings">Rechnungseinstellungen</a>':'');
 const payer=card('An','<p>'+esc(r.payer||r.student)+'</p>'+(r.payer&&r.payer!==r.student?'<p class="e4-muted">für '+esc(r.student)+'</p>':'')+(r.address?'<p>'+esc(r.address)+'</p>':'')+inlineErrors(['payer_address_missing','payer_name_missing'],'payer')+(!r.address&&!errors.includes('payer_address_missing')&&!issued?'<div class="e4-inline-warning">Rechnungsadresse fehlt '+button('Ergänzen','payer')+'</div>':''));
 const sourceLines=r.lines?.length?r.lines.map(line=>({label:invoiceLineLabel(line.description,r.subject),amount:line.gross_amount,date:line.lesson_date||''})):r.billingMode==='monthly_flat'?[{label:'Monatspauschale (Beispiel)',amount:r.totalCents}]:Array.isArray(r.lessons)?r.lessons.map((day,i)=>({label:'Unterricht Mathe, 45 Min.',date:'Mo '+day,amount:i===r.lessons.length-1?r.totalCents-(r.lessons.length-1)*Math.floor(r.totalCents/r.lessons.length):Math.floor(r.totalCents/r.lessons.length)})):[];
 const what=card('Leistungen','<div class="e4-lines">'+sourceLines.map(item=>'<div class="e4-lesson"><span class="e4-date">'+esc(/^\d{4}-\d{2}-\d{2}$/.test(item.date)?new Date(item.date+'T12:00:00').toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit'}):item.date)+'</span><span>'+esc(item.label)+'</span><strong>'+(item.amount==null?'':eur(item.amount))+'</strong></div>').join('')+'</div><div class="e4-total"><b>Gesamt</b><b>'+eur(r.totalCents)+'</b></div><p class="e4-vat-note">'+esc(r.vatNote||vatLabel(r.vat_mode))+'</p>'+inlineErrors(['student_details_missing','no_billable_items','already_billed','month_not_finished'],'settings')+(r.excludedLessons?.length?'<div class="e4-excluded"><b>Nicht berechnet (nur für dich sichtbar)</b>'+r.excludedLessons.map(x=>'<p>'+esc(x.description||x.lesson_date)+'</p>').join('')+'</div>':''));
 const bank=card('Bankverbindung',(r.teacher?.bank_name?'<p>'+esc(r.teacher.bank_name)+'</p>':'')+(r.teacher?.iban?'<p>IBAN '+esc(r.teacher.iban)+'</p>':'')+(r.teacher?.payment_terms?'<p>'+esc(r.teacher.payment_terms)+'</p>':r.dueDate?'<p>Fällig am '+esc(r.dueDate)+'</p>':'')+inlineErrors(['teacher_iban_missing'],'settings'),!issued?'<a href="#" data-e4="settings">Rechnungseinstellungen</a>':'');
 const unassigned=errors.filter(code=>!['teacher_settings_missing','teacher_tax_number_missing','teacher_vat_mode_missing','payer_address_missing','payer_name_missing','student_details_missing','no_billable_items','already_billed','month_not_finished','teacher_iban_missing'].includes(code));
 const stateLabel=issued?(r.status==='cancelled'?'Storniert':'Ausgestellt'):missing?'Angaben fehlen':r.status==='ready'?'Bereit':status[r.status]||r.status;
 const primary=issued?button('PDF herunterladen','pdf-'+r.id,adapter.mode==='live'?'':'disabled'):button('Ausstellen & herunterladen',adapter.mode==='live'?'issue-download':'single-issue',missing||r.status!=='ready'||busy||adapter.mode!=='live'?'disabled':'');
 show('<div class="e4-detail"><header class="e4-subhead"><h2>'+(issued?'Rechnung '+esc(r.number||''):'Rechnungsentwurf')+'</h2><p>'+esc(r.student)+' · '+esc(monthLabel(r.billingMonth))+'</p><span class="e4-status e4-status--'+esc(r.status)+'">'+esc(stateLabel)+'</span></header>'+from+payer+what+bank+(unassigned.length?'<div class="e4-inline-warning" role="status">'+unassigned.map(code=>'<p>'+esc(errorLabels[code]||code)+'</p>').join('')+'</div>':'')+(issued?button('Diese Rechnung korrigieren','correct'):'')+foot(button(issued?'Schließen':'Abbrechen','home')+primary)+'</div>',true);
 };
 const batch=()=>{view='batch';selected=new Set(readyInvoices(rows).map(r=>r.id));drawBatch();};
 const drawBatch=()=>{const eligible=readyInvoices(rows);show('<h2>Rechnungen ausstellen</h2>'+groupInvoices(eligible).map(g=>'<section class="e4-month"><h3>'+esc(monthLabel(g.month))+'</h3><div class="e4-rows">'+g.items.map(r=>'<button class="e4-choice '+(selected.has(r.id)?'chosen':'')+'" data-select="'+esc(r.id)+'" aria-pressed="'+selected.has(r.id)+'"><span>'+(selected.has(r.id)?'✓ ':'')+esc(r.student)+'</span><strong>'+eur(r.totalCents)+'</strong></button>').join('')+'</div></section>').join('')+'<p class="e4-selection-count">'+selected.size+' von '+eligible.length+' ausgewählt</p>'+warning(adapter.mode==='live'?'Die Ausstellung ist verbindlich. Einzelne Rechnungen können bei erneuter Prüfung fehlschlagen.':'Nur Demo. Es werden keine Rechnungen erstellt.')+foot(button('Abbrechen','home')+button((adapter.mode==='live'?'':'Demo: ')+selected.size+' Rechnungen ausstellen',adapter.mode==='live'?'live-issue':'demo-results',selected.size?'':'disabled')),true);};
 const correction=()=>{view='correct';show('<h2>Rechnung korrigieren</h2>'+warning('Eine ausgestellte Rechnung kann nicht geändert werden. Nach der Stornierung können die Stunden korrigiert und neu abgerechnet werden.')+'<p>'+esc(current.number)+' · '+esc(current.student)+'</p>'+(adapter.mode==='live'?'':warning('Stornierung ist im Demomodus deaktiviert.'))+foot(button('Zurück','back')+button(adapter.mode==='live'?'Rechnung stornieren':'Demo: Stornierung ansehen',adapter.mode==='live'?'live-cancel':'demo-cancel','')),true);};
 const openSettingsSheet=async(section='payment')=>{
  if(adapter.mode!=='live')return;
  let ledger,data;
  try{const result=await adapter.loadSettings();ledger=result.ledger;data=result.settings||{};}
  catch(ex){notice='Einstellungen konnten nicht geladen werden: '+ex.message;return;}
  openSectionSheet({section,data,onSave:form=>adapter.saveSettings(ledger,parseSection(form,section,data)),onSaved:async()=>{notice='Angaben gespeichert.';if(current?.id){const id=current.id;await refresh();await details(id);}else await refresh();}});
 };
 const form=async kind=>{
  if(kind==='settings')return openSettingsSheet();
  view=kind;const payer=kind==='payer';let data={},ledger=null;
  try{
   if(adapter.mode==='live'){
    if(payer){data=await adapter.loadPayer(current.studentId);}
    else{const x=await adapter.loadSettings();ledger=x.ledger;data=x.settings||{};}
   }
  }catch(e){notice='Angaben konnten nicht geladen werden: '+(e.message||'Unbekannter Fehler');}
  const addr=payer?data.payer_address:data.teacher_address;
  const field=(name,label,value='',type='text',placeholder='')=>'<label>'+label+'<input name="'+name+'" type="'+type+'" value="'+esc(value)+'" placeholder="'+esc(placeholder)+'"></label>';
  const heading=payer?'Zahlungspflichtige Person':'Rechnungseinstellungen';
  const html='<h2>'+heading+'</h2>'+(adapter.mode==='fixture'?warning('Nur Vorschau. Speichern ist im Demomodus deaktiviert.'):'')+
   '<form id="e4-data-form" data-kind="'+kind+'">'+
   '<div class="e4-section-title">'+(payer?'Zahlungspflichtige Person':'Auf deinen Rechnungen')+'</div>'+
   field('name','Name *',payer?data.payer_name:data.teacher_name)+
   field('street','Straße und Hausnummer *',addr?.street||'')+
   field('postcode','Postleitzahl *',addr?.postcode||'')+
   field('city','Ort *',addr?.city||'')+
   (!payer?field('country','Land',addr?.country||'Deutschland'):'')+
   field('email','E-Mail',payer?data.payer_email:data.teacher_email,'email')+
   (!payer?field('phone','Telefon (optional)',data.phone,'tel')+
   '<div class="e4-section-title">Steuern</div>'+field('tax','Steuernummer',data.tax_number)+
   '<fieldset class="e4-vat"><legend>Umsatzsteuer</legend>'+
   [['small_business','Kleinunternehmer (§ 19 UStG)'],['exempt_teaching','Steuerbefreiter Unterricht (§ 4 Nr. 21 UStG)'],['regular_19','19 % Umsatzsteuer'],['unsure','Noch nicht festgelegt']].map(([v,l])=>'<label><input type="radio" name="vat" value="'+v+'" '+(data.vat_mode===v?'checked':'')+'>'+l+'</label>').join('')+'</fieldset>'+
   '<div class="e4-section-title">Zahlung</div>'+field('iban','IBAN',data.iban)+field('bank','Bankname (optional)',data.bank_name)+field('payment_days','Zahlungsfrist in Tagen',data.payment_days??14,'number'):'')+
   '<p class="e4-form-error" role="alert"></p>'+foot(button('Abbrechen','back')+'<button type="submit" '+(adapter.mode==='fixture'?'disabled':'')+'>Fertig</button>')+'</form>';
  show(html,true);
  const el=root.querySelector('#e4-data-form');
  el?.addEventListener('submit',async e=>{
   e.preventDefault();if(adapter.mode!=='live')return;
   const f=e.currentTarget,v=n=>f.elements.namedItem(n)?.value.trim()||'',address={street:v('street'),postcode:v('postcode'),city:v('city'),country:payer?'Deutschland':v('country')||'Deutschland'};
   const error=f.querySelector('.e4-form-error');
   if(!v('name')||!address.street||!/^\d{5}$/.test(address.postcode)||!address.city){error.textContent='Bitte Name, Straße, fünfstellige Postleitzahl und Ort eingeben.';return;}
   if(v('email')&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v('email'))){error.textContent='Bitte eine gültige E-Mail-Adresse eingeben.';return;}
   const submit=f.querySelector('[type="submit"]');submit.disabled=true;
   try{
    if(payer){await adapter.savePayer(current.studentId,{payer_name:v('name'),payer_address:address,payer_email:v('email')});}
    else{
     const days=Number(v('payment_days'));if(!Number.isInteger(days)||days<1||days>365)throw new Error('Zahlungsfrist muss zwischen 1 und 365 Tagen liegen.');
     await adapter.saveSettings(ledger,{teacher_name:v('name'),teacher_address:address,teacher_email:v('email'),phone:v('phone'),tax_number:v('tax'),vat_mode:f.querySelector('input[name="vat"]:checked')?.value||'unsure',iban:v('iban').replace(/\s/g,'').toUpperCase(),bank_name:v('bank'),payment_days:days,cancellation_rule:data.cancellation_rule||'24h',invoice_prefix:data.invoice_prefix||null});
    }
    const returnId=payer&&current?'draft:'+current.studentId+':'+current.billingMonth:null;notice='Angaben gespeichert.';await refresh();if(returnId)await details(returnId);
   }catch(ex){error.textContent='Speichern fehlgeschlagen: '+(ex.message||'Unbekannter Fehler');submit.disabled=false;}
  });
 };
 const click=async e=>{const choice=e.target.closest('[data-select]');if(choice){selected.has(choice.dataset.select)?selected.delete(choice.dataset.select):selected.add(choice.dataset.select);drawBatch();return;}const open=e.target.closest('[data-open]');if(open){await details(open.dataset.open);return;}const act=e.target.closest('[data-e4]')?.dataset.e4;if(!act)return;if(act==='home')home();else if(act==='back'){if(current?.id)await details(current.id);else home();}else if(act==='batch')batch();else if(act==='refresh'){try{notice='';await refresh();}catch(e){notice='Aktualisierung fehlgeschlagen: '+e.message;home();}}else if(act==='live-issue')await issueLive([...selected].map(id=>rows.find(r=>r.id===id)).filter(Boolean));else if(act==='issue-download')await issueAndDownload();else if(act==='live-single')await issueLive([rows.find(r=>r.id===current.id)].filter(Boolean));else if(act==='live-cancel')await cancelLive();else if(act==='demo-results')demoResults();else if(act==='single-issue'){selected=new Set([current.id]);demoResults();}else if(act==='demo-cancel')demoCancelled();else if(act==='correct')correction();else if(act==='payer')await form(act);else if(act==='settings'||act==='payment-settings')await openSettingsSheet(act==='payment-settings'?'payment':e.target.closest('.e4-card')?.querySelector('h3')?.textContent==='Von'?'contact':'payment');else if(act.startsWith('pdf-')&&adapter.mode==='live')await downloadPdf(act.slice(4));else if(act.startsWith('pdf-')||act==='share'||act==='email'){notice='Diese Aktion benötigt die echte PDF-Schnittstelle. Im Demomodus wurde nichts heruntergeladen oder versendet.';if(view==='detail')await details(current.id);else home();}};
 const handleClick=e=>{if(e.target.closest('a[data-e4]'))e.preventDefault();void click(e);};
 root.addEventListener('click',handleClick);
 adapter.list().then(data=>{if(disposed)return;rows=data;home();}).catch(e=>{if(disposed)return;notice='Rechnungen konnten nicht geladen werden: '+(e.message||'Unbekannter Fehler');home();});
 return {destroy(){disposed=true;root.removeEventListener('click',handleClick);onSubpageChange(false);},create(){batch();},settings(){openSettingsSheet('contact');}};
}
