import {openSectionSheet,parseSection} from '../frontend/settings-sections.js?v=4';
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
const berlinMonth=(date=new Date())=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit'}).format(date);
export const readyInvoices=(rows,asOf=new Date())=>rows.filter(r=>['ready','in_progress'].includes(r.status)&&!(r.validationErrors||[]).length&&r.billingMonth<=berlinMonth(asOf));
const earlyWarning='Der Abrechnungsmonat läuft noch. Weitere abrechenbare Stunden werden in die nächste mögliche Monatsrechnung übernommen. Trotzdem ausstellen?';
/** Convert draft v0.1 API responses into the view model, without calculating monetary values. */
export function adaptOverview(response){
 const out=[];
 for(const month of response.months||[]){
  const billingMonth=String(month.billing_month).slice(0,7);
  for(const r of month.candidates||[])out.push({id:'draft:'+r.student_id+':'+billingMonth,studentId:r.student_id,student:r.student_name?.trim()||'Schülername wird geladen',billingMonth,status:r.status,totalCents:r.gross_amount,validationErrors:r.validation_errors||[],kind:'draft'});
  for(const r of month.issued||[])out.push({id:r.invoice_id,studentId:r.student_id,student:r.student_name||'Schülername wird geladen',billingMonth,status:r.status,totalCents:r.gross_amount,number:r.invoice_number,kind:'issued',documentKind:r.kind,originalInvoiceId:r.original_invoice_id,pdfStatus:r.pdf_status});
 }
 const originals=new Map(out.map(r=>[r.id,r]));
 const paired=new Set();
 for(const correction of out.filter(r=>r.documentKind==='cancellation')){const original=originals.get(correction.originalInvoiceId);if(!original||original.documentKind!=='standard')continue;paired.add(original.id);correction.documents=[{...original},{...correction}];correction.status='cancelled';correction.totalCents=(Number(original.totalCents)+Number(correction.totalCents)).toFixed(2);}
 return out.filter(r=>!paired.has(r.id));
}
export function adaptPreview(raw){
 return {...raw,id:'draft:'+raw.student_id+':'+String(raw.billing_month).slice(0,7),studentId:raw.student_id,billingMonth:String(raw.billing_month).slice(0,7),subject:raw.subject||raw.student?.subject||raw.student_subject||'',student:raw.student_name||raw.payer?.name||'Schülername fehlt',payer:raw.payer?.name,address:formatAddress(raw.payer?.address),status:(raw.validation_errors||[]).length?'missing_details':(raw.warnings||[]).includes('month_not_finished')?'in_progress':'ready',totalCents:raw.gross_amount,lines:raw.lines||[],excludedLessons:raw.excluded_lessons||[],vatNote:raw.vat_note||'',validationErrors:raw.validation_errors||[],warnings:raw.warnings||[],teacher:raw.teacher,invoiceDate:raw.invoice_date,dueDate:raw.due_date};
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
 const currentMonth=()=>today().slice(0,7)+'-01';
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
 const rows=adaptOverview(await rpc('list_invoice_overview',{p_through_month:currentMonth()}));
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
export function mountInvoices({root,onSubpageChange=()=>{},adapter=fixtureInvoiceAdapter(),initialInvoiceId=null,onBack=null}){
 let search='',rows=[],view='list',current=null,selected=new Set(),notice='',result=[],disposed=false,busy=false;
 const status={ready:'Bereit',missing_details:'Angaben fehlen',in_progress:'Voraussichtlich',issued:'Ausgestellt',cancelled:'Storniert'};
 const button=(label,action,extra='')=>'<button type="button" data-e4="'+action+'" '+extra+'>'+esc(label)+'</button>';
 const card=(title,body,action='')=>'<section class="e4-card"><div class="e4-card-heading"><h3>'+title+'</h3>'+action+'</div>'+body+'</section>';
 const line=(r,resultMode=false,batchMode=false)=>'<div class="e4-line '+esc(r.status)+(batchMode?' e4-selectable'+(selected.has(r.id)?' e4-selected':''):'')+'"><button type="button" '+(batchMode?'data-select="'+esc(r.id)+'" aria-pressed="'+selected.has(r.id)+'"':resultMode?'disabled':'data-open="'+esc(r.id)+'"')+'><span class="e4-line-top"><span class="e4-student-name">'+(batchMode&&selected.has(r.id)?'<span class="e4-selection-tick" aria-hidden="true">✓</span> ':'')+esc(r.student||'Schülername nicht verfügbar')+'</span><strong>'+eur(r.totalCents)+'</strong></span><span class="e4-line-bottom"><span class="e4-line-meta">'+esc((r.number?r.number+' · ':'')+monthLabel(r.billingMonth))+'</span><small>'+esc(r.resultError?'Fehler: '+r.resultError:status[r.status]||r.status)+'</small></span></button>'+(r.status==='issued'&&adapter.mode==='live'?button('PDF ↓',(resultMode?'result-pdf-':'pdf-')+r.id,(resultMode&&busy?'disabled ':'')+'class="e4-row-pdf" aria-label="PDF für '+esc(r.student||r.number||'Rechnung')+' herunterladen"'):'')+'</div>';
 const groups=(items,resultMode=false,batchMode=false)=>groupInvoices(items).map(g=>'<section class="e4-month"><h2>'+esc(monthLabel(g.month))+' <span>'+eur(g.totalCents)+'</span></h2><div class="e4-rows">'+g.items.map(r=>line(r,resultMode,batchMode)).join('')+'</div></section>').join('');
 const foot=(html,placement='bottom')=>placement==='floating'?'<div class="e4-foot">'+html+'</div>':actionBar(html,{placement,count:(html.match(/<button\b/g)||[]).length===1?1:2,context:'invoice'});
 const warning=msg=>'<p class="e4-warning" role="status">'+esc(msg)+'</p>';
 const show=(html,sub=false)=>{if(disposed)return;onSubpageChange(sub);root.innerHTML='<div class="e4">'+(adapter.mode==='fixture'?'<div class="e4-demo">Vorschau mit Beispieldaten · keine echten Rechnungen</div>':'')+(notice?warning(notice):'')+html+'</div>';};
 const matches=()=>rows.filter(r=>[r.student,r.number,...(r.documents||[]).map(d=>d.number)].some(v=>String(v||'').toLocaleLowerCase('de-DE').includes(search.trim().toLocaleLowerCase('de-DE'))));
 const searchResults=()=>matches().length?groups(matches()):'<p class="e4-empty">'+(search.trim()?'Keine passenden Rechnungen.':'Noch keine abrechenbaren Rechnungen.')+'</p>';
 const home=()=>{view='list';current=null;show('<div class="e4-search"><input type="search" aria-label="Suche" placeholder="Suche nach Name oder Rechnungsnummer" value="'+esc(search)+'"></div><div class="e4-search-results">'+searchResults()+'</div>'+(readyInvoices(rows).length?foot(button('Rechnungen ausstellen','batch'),'floating'):foot('<button disabled>Rechnungen ausstellen</button>','floating')));};
 const refresh=async()=>{rows=await adapter.list();if(!disposed)home();};
 const safeName=value=>String(value||'Rechnung').normalize('NFC').replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').replace(/[. ]+$/g,'').trim()||'Rechnung';
 const allDocs=()=>rows.flatMap(r=>r.documents?r.documents.map(d=>({...r,...d,student:r.student})):r.status==='issued'?[r]:[]);
 const filename=doc=>safeName(doc.student)+'_'+safeName(monthLabel(doc.billingMonth))+'_'+safeName(doc.number||doc.issuedId||doc.id)+'.pdf';
 const downloadPdf=async id=>{try{const doc=allDocs().find(x=>x.id===id)||{...current,id};const response=await fetch(await adapter.pdf(id));if(!response.ok)throw Error('PDF nicht verfügbar');saveBlob(await response.blob(),filename(doc));}catch(e){notice='PDF konnte nicht geladen werden: '+(e.message||'Unbekannter Fehler');if(view==='detail'&&current)await details(current.id);else home();}};
 const successfulResults=()=>result.filter(x=>x.resultStatus==='issued'&&x.issuedId);
 const drawLiveResults=()=>{view='results';show('<h2>Ergebnis der Ausstellung</h2>'+groups(result.map(x=>({...x,id:x.issuedId||x.id,status:x.resultStatus==='issued'&&x.issuedId?'issued':'failed',totalCents:x.resultStatus==='issued'?x.totalCents:0})),true)+foot(button('Fertig','refresh',busy?'disabled':'')+button('Alle herunterladen','result-all',busy||!successfulResults().length?'disabled':'')),true);};
 const saveBlob=(blob,name)=>{const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);};
 const downloadResults=async(id)=>{if(busy)return;busy=true;notice='';drawLiveResults();try{const docs=successfulResults().filter(x=>!id||x.issuedId===id),files=[],errors=[];for(const doc of docs){try{const response=await fetch(await adapter.pdf(doc.issuedId));if(!response.ok)throw Error('PDF nicht verfügbar');const blob=await response.blob();files.push({name:filename(doc),blob});}catch(e){errors.push(doc.student||doc.number);}}if(files.length){if(id)saveBlob(files[0].blob,files[0].name);else{const {zipSync}=await import('https://esm.sh/fflate@0.8.2');const entries={};for(const f of files)entries[f.name]=new Uint8Array(await f.blob.arrayBuffer());saveBlob(new Blob([zipSync(entries)],{type:'application/zip'}),'Rechnungen.zip');}}if(errors.length)notice='Download fehlgeschlagen: '+errors.join(', ')+'. Bitte erneut versuchen.';}catch(e){notice='Download fehlgeschlagen: '+e.message;}finally{busy=false;drawLiveResults();}};
 const issueLive=async(items)=>{if(busy||!items.length)return;
  if(items.some(x=>x.billingMonth===berlinMonth())&&!window.confirm(earlyWarning))return;
  if(!window.confirm(items.length+' Rechnung(en) jetzt verbindlich ausstellen? Die Rechnungen erhalten Nummern und können danach nur storniert werden.'))return;
  busy=true;const key=crypto.randomUUID();try{
   const response=await adapter.issue(items,key);
   result=(response.results||[]).map(x=>({...items.find(y=>y.studentId===x.student_id&&y.billingMonth===String(x.billing_month).slice(0,7)),resultStatus:x.status,resultError:x.error_code||'',number:x.invoice_number,issuedId:x.invoice_id}));
   drawLiveResults();
  }catch(e){notice='Ausstellung fehlgeschlagen: '+(e.message||'Unbekannter Fehler');if(view==='batch')drawBatch();else await details(current.id);}
  finally{busy=false;if(view==='results')drawLiveResults();}
 };
 const cancelLive=async()=>{if(busy||!current?.id)return;
  const originalId=current.id;busy=true;let cancelled=false;
  try{const x=await adapter.cancel(originalId,crypto.randomUUID());cancelled=true;rows=await adapter.list();const pair=rows.find(r=>r.documents?.some(d=>d.id===originalId));const id=pair?.id||x.invoice_id||x.cancellation_invoice_id;if(!id)throw Error('Stornorechnung nicht gefunden');notice='';await details(id);}
  catch(e){notice=(cancelled?'Rechnung storniert. Ansicht konnte nicht aktualisiert werden: ':'Stornierung fehlgeschlagen: ')+(e.message||'Unbekannter Fehler');if(cancelled)home();else await details(originalId);}
  finally{busy=false;}
 };
 const demoResults=()=>{view='results';result=[...selected].map((id,i)=>{const r=rows.find(x=>x.id===id);return {...r,resultStatus:i===1?'failed':'issued',resultError:i===1?'Beispiel: Angaben wurden zwischen Vorschau und Ausstellung geändert':null,number:i===1?null:'DEMO-'+String(i+1).padStart(4,'0')};});show('<h2>Ergebnis der Ausstellung (Demo)</h2>'+warning('Nur eine Vorschau des Ablaufs. Es wurden keine Rechnungen ausgestellt oder gespeichert.')+groupInvoices(result).map(g=>'<section class="e4-month"><h3>'+esc(monthLabel(g.month))+'</h3><div class="e4-rows">'+g.items.map(r=>'<div class="e4-result '+(r.resultStatus==='issued'?'e4-result-ok':'e4-result-failed')+'"><strong>'+esc(r.student)+'</strong><span>'+(r.resultStatus==='issued'?'Beispielnummer '+esc(r.number):'Fehlgeschlagen: '+esc(r.resultError))+'</span><b>'+eur(r.totalCents)+'</b></div>').join('')+'</div></section>').join('')+foot(button('Fertig','home')),true);};
 const demoCancelled=()=>{view='cancelled';show('<h2>Rechnung storniert (Demo)</h2>'+warning('Dies ist nur eine Ablaufvorschau. Die echte Rechnung bleibt unverändert.')+'<p>'+esc(current.student)+' · '+esc(monthLabel(current.billingMonth))+'</p><div class="e4-cancellation"><b>Stornorechnung</b><strong>Beispielbetrag −'+eur(current.totalCents)+'</strong><p>Die zugehörigen Stunden werden nach einer echten Stornierung wieder freigegeben. Danach können sie korrigiert und neu abgerechnet werden.</p><p>Stornorechnung und neue Rechnung müssen an den Zahler gesendet werden.</p></div>'+foot(button('Fertig','home')),true);};
 const issueAndDownload=async()=>{if(busy||!current||!['ready','in_progress'].includes(current.status)||adapter.mode!=='live')return;
  if(current.billingMonth===berlinMonth()&&!window.confirm(earlyWarning))return;
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
 const details=async id=>{const pair=rows.find(r=>r.id===id&&r.documents);try{const overview=rows.find(r=>r.id===id);current=await (overview?.kind==='issued'||(!id.startsWith('draft:')&&adapter.mode==='live')?adapter.get(pair?pair.documents[0].id:id):adapter.preview(id));if(current&&overview?.student)current.student=overview.student;if(current&&pair)current={...current,id:pair.id,number:pair.number,status:'cancelled',documents:pair.documents,pairBalance:pair.totalCents};}catch(e){notice='Rechnung konnte nicht geladen werden: '+(e.message||'Unbekannter Fehler');home();return;}if(!current)return;view='detail';
 const r=current,issued=r.kind==='standard'||r.kind==='cancellation'||r.status==='issued'||r.status==='cancelled',missing=r.status==='missing_details';
 const errors=r.validationErrors||[];
 const errorLabels={payer_address_missing:'Rechnungsadresse fehlt',payer_name_missing:'Name der zahlungspflichtigen Person fehlt',teacher_iban_missing:'IBAN fehlt',teacher_tax_number_missing:'Steuernummer fehlt',teacher_settings_missing:'Rechnungseinstellungen fehlen',teacher_vat_mode_missing:'Umsatzsteuer-Einstellung fehlt',student_details_missing:'Schülerdaten fehlen',no_billable_items:'Keine abrechenbaren Stunden',already_billed:'Bereits abgerechnet',month_not_finished:'Abrechnungsmonat ist noch nicht abgeschlossen'};
 const inlineErrors=(codes,action)=>{const matching=errors.filter(code=>codes.includes(code));return matching.length?'<div class="e4-inline-warning" role="status">'+matching.map(code=>'<p>'+esc(errorLabels[code]||code)+'</p>').join('')+(issued||action==='none'||['payer','contact-settings','payment-settings'].includes(action)?'':button('Bearbeiten',action))+'</div>':'';};
 const contactMissing=!r.teacher?.name||!formatAddress(r.teacher?.address);
 const from=card('Von','<p>'+esc(r.teacher?.name||'Rechnungssteller fehlt')+'</p><p>'+esc(formatAddress(r.teacher?.address))+'</p>'+inlineErrors(['teacher_settings_missing'],'contact-settings')+(contactMissing&&!errors.includes('teacher_settings_missing')&&!issued?'<div class="e4-inline-warning">Kontaktinformationen fehlen</div>':''),!issued?'<button type="button" class="ll-invoice-edit" data-e4="contact-settings">Bearbeiten</button>':'');
 const payer=card('An','<p>'+esc(r.payer||r.student)+'</p>'+(r.payer&&r.payer!==r.student?'<p class="e4-muted">für '+esc(r.student)+'</p>':'')+(r.address?'<p>'+esc(r.address)+'</p>':'')+inlineErrors(['payer_address_missing','payer_name_missing'],'payer')+(!r.address&&!errors.includes('payer_address_missing')&&!issued?'<div class="e4-inline-warning">Rechnungsadresse fehlt</div>':''),!issued?'<button type="button" class="ll-invoice-edit" data-e4="payer">Bearbeiten</button>':'');
 const sourceLines=r.lines?.length?r.lines.map(line=>({label:invoiceLineLabel(line.description,r.subject)+(line.lesson_date&&line.lesson_date.slice(0,7)<r.billingMonth?' · Nachtrag aus '+monthLabel(line.lesson_date):''),amount:line.gross_amount,date:line.lesson_date||''})):r.billingMode==='monthly_flat'?[{label:'Monatspauschale (Beispiel)',amount:r.totalCents}]:Array.isArray(r.lessons)?r.lessons.map((day,i)=>({label:'Unterricht Mathe, 45 Min.',date:'Mo '+day,amount:i===r.lessons.length-1?r.totalCents-(r.lessons.length-1)*Math.floor(r.totalCents/r.lessons.length):Math.floor(r.totalCents/r.lessons.length)})):[];
 const what=card('Leistungen','<div class="e4-lines">'+sourceLines.map(item=>'<div class="e4-lesson"><span class="e4-date">'+esc(/^\d{4}-\d{2}-\d{2}$/.test(item.date)?new Date(item.date+'T12:00:00').toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit'}):item.date)+'</span><span>'+esc(item.label)+'</span><strong>'+(item.amount==null?'':eur(item.amount))+'</strong></div>').join('')+'</div><div class="e4-total"><b>Gesamt</b><b>'+eur(r.totalCents)+'</b></div><p class="e4-vat-note">'+esc(r.vatNote||vatLabel(r.vat_mode))+'</p>'+inlineErrors(['student_details_missing','no_billable_items','already_billed','month_not_finished'],'none')+(r.excludedLessons?.length?'<div class="e4-excluded"><b>Nicht berechnet (nur für dich sichtbar)</b>'+r.excludedLessons.map(x=>'<p>'+esc(x.description||x.lesson_date)+'</p>').join('')+'</div>':''));
 const bank=card('Bankverbindung',(r.teacher?.bank_name?'<p>'+esc(r.teacher.bank_name)+'</p>':'')+(r.teacher?.iban?'<p>IBAN '+esc(r.teacher.iban)+'</p>':'')+(r.teacher?.payment_terms?'<p>'+esc(r.teacher.payment_terms)+'</p>':r.dueDate?'<p>Fällig am '+esc(r.dueDate)+'</p>':'')+(r.teacher?.tax_number?'<p>Steuernummer '+esc(r.teacher.tax_number)+'</p>':'')+inlineErrors(['teacher_iban_missing','teacher_tax_number_missing','teacher_vat_mode_missing'],'payment-settings'),!issued?'<button type="button" class="ll-invoice-edit" data-e4="payment-settings">Bearbeiten</button>':'');
 const unassigned=errors.filter(code=>!['teacher_settings_missing','teacher_tax_number_missing','teacher_vat_mode_missing','payer_address_missing','payer_name_missing','student_details_missing','no_billable_items','already_billed','month_not_finished','teacher_iban_missing'].includes(code));
 const stateLabel=issued?(r.status==='cancelled'?'Storniert':'Ausgestellt'):r.status==='in_progress'?'Voraussichtlich':missing?'Angaben fehlen':r.status==='ready'?'Bereit':status[r.status]||r.status;
 const primary=pair?button('Original-PDF','pdf-'+pair.documents[0].id)+button('Storno-PDF','pdf-'+pair.documents[1].id):issued?button('PDF herunterladen','pdf-'+r.id,adapter.mode==='live'?'':'disabled'):button('Ausstellen & herunterladen',adapter.mode==='live'?'issue-download':'single-issue',missing||!['ready','in_progress'].includes(r.status)||busy||adapter.mode!=='live'?'disabled':'');
 show('<div class="e4-detail"><header class="e4-subhead"><h2>'+(issued?'Rechnung '+esc(r.number||''):'Rechnungsentwurf')+'</h2><p>'+esc(r.student)+' · '+esc(monthLabel(r.billingMonth))+'</p><span class="e4-status e4-status--'+esc(r.status)+'">'+esc(stateLabel)+'</span></header>'+(pair?'<p class="e4-muted">Originalrechnung '+esc(pair.documents[0].number)+' · Stornorechnung '+esc(pair.documents[1].number)+'</p>':'')+from+payer+what+bank+(pair?card('Stornierung','<div class="e4-total"><b>Stornobetrag</b><b>'+eur(pair.documents[1].totalCents)+'</b></div><div class="e4-total"><b>Saldo</b><b>'+eur(pair.totalCents)+'</b></div>'):'')+(unassigned.length?'<div class="e4-inline-warning" role="status">'+unassigned.map(code=>'<p>'+esc(errorLabels[code]||code)+'</p>').join('')+'</div>':'')+(issued&&r.status!=='cancelled'&&r.kind!=='cancellation'?'<a href="#" class="e4-cancel-link" data-e4="correct">Rechnung stornieren</a>':'')+(pair?'<div class="e4-foot">'+primary+'</div>'+foot(button('Schließen','home')):foot(button(issued?'Schließen':'Abbrechen','home')+primary))+'</div>',true);
 };
 const batch=()=>{view='batch';selected=new Set(readyInvoices(rows).filter(r=>r.billingMonth<berlinMonth()).map(r=>r.id));drawBatch();};
 const drawBatch=()=>{const eligible=readyInvoices(rows);show('<h2>Rechnungen ausstellen</h2>'+groups(eligible,false,true)+'<p class="e4-selection-count">'+selected.size+' von '+eligible.length+' ausgewählt</p>'+(adapter.mode==='live'?'':warning('Nur Demo. Es werden keine Rechnungen erstellt.'))+foot(button('Abbrechen','home')+button((adapter.mode==='live'?'':'Demo: ')+selected.size+' Rechnungen ausstellen',adapter.mode==='live'?'live-issue':'demo-results',selected.size?'':'disabled')),true);};
 const correction=()=>{if(busy)return;const overlay=document.createElement('div');overlay.className='ll-settings-overlay e4-cancel-overlay';overlay.innerHTML='<div class="ll-settings-sheet e4-cancel-sheet" role="dialog" aria-modal="true" aria-label="Wirklich stornieren?"><h2>Wirklich stornieren?</h2><div class="ll-setting-actions"><button type="button" class="ll-setting-save ll-setting-secondary" data-dismiss>Abbrechen</button><button type="button" class="ll-setting-save e4-cancel-confirm" data-confirm>Stornieren</button></div></div>';const close=()=>overlay.remove();overlay.addEventListener('click',e=>{if(e.target===overlay||e.target.closest('[data-dismiss]'))close();else if(e.target.closest('[data-confirm]')){close();if(adapter.mode==='live')void cancelLive();else demoCancelled();}});document.body.append(overlay);overlay.querySelector('[data-dismiss]').focus();};

 const openSettingsSheet=async(section='payment')=>{
  if(adapter.mode!=='live')return;
  let ledger,data;
  try{const result=await adapter.loadSettings();ledger=result.ledger;data=result.settings||{};}
  catch(ex){notice='Einstellungen konnten nicht geladen werden: '+ex.message;return;}
  openSectionSheet({section,data,onSave:form=>adapter.saveSettings(ledger,parseSection(form,section,data)),onSaved:async()=>{notice='Angaben gespeichert.';if(current?.id){const id=current.id;await refresh();await details(id);}else await refresh();}});
 };
 const form=async kind=>{
  if(kind!=='payer')return openSettingsSheet('contact');
  if(adapter.mode!=='live')return;
  const studentId=current.studentId,returnId=current.id;
  let data;
  try{data=await adapter.loadPayer(studentId);}catch(ex){notice='Angaben konnten nicht geladen werden: '+ex.message;await details(returnId);return;}
  openSectionSheet({section:'payer',data:data||{},onSave:async f=>{
   const v=n=>f.elements.namedItem(n)?.value.trim()||'';
   const address={street:v('street'),postcode:v('postcode'),city:v('city'),country:data?.payer_address?.country||'Deutschland'};
   if(!v('name')||!address.street||!/^\d{5}$/.test(address.postcode)||!address.city)throw Error('Bitte Name, Straße, fünfstellige Postleitzahl und Ort eingeben.');
   if(v('email')&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v('email')))throw Error('Bitte eine gültige E-Mail-Adresse eingeben.');
   await adapter.savePayer(studentId,{payer_name:v('name'),payer_address:address,payer_email:v('email')});
  },onSaved:async()=>{notice='Angaben gespeichert.';await refresh();await details(returnId);}});
 };
 const click=async e=>{const choice=e.target.closest('[data-select]');if(choice){selected.has(choice.dataset.select)?selected.delete(choice.dataset.select):selected.add(choice.dataset.select);drawBatch();return;}const open=e.target.closest('[data-open]');if(open){await details(open.dataset.open);return;}const act=e.target.closest('[data-e4]')?.dataset.e4;if(!act)return;if(act==='clear-search'){search='';home();root.querySelector('.e4-search input')?.focus();}else if(act==='home'){if(onBack&&view==='detail')onBack();else home();}else if(act==='back'){if(current?.id)await details(current.id);else home();}else if(act==='batch')batch();else if(act==='refresh'){try{notice='';await refresh();}catch(e){notice='Aktualisierung fehlgeschlagen: '+e.message;home();}}else if(act==='result-all')await downloadResults();else if(act.startsWith('result-pdf-'))await downloadResults(act.slice(11));else if(act==='live-issue')await issueLive([...selected].map(id=>rows.find(r=>r.id===id)).filter(Boolean));else if(act==='issue-download')await issueAndDownload();else if(act==='live-single')await issueLive([rows.find(r=>r.id===current.id)].filter(Boolean));else if(act==='live-cancel')await cancelLive();else if(act==='demo-results')demoResults();else if(act==='single-issue'){selected=new Set([current.id]);demoResults();}else if(act==='demo-cancel')demoCancelled();else if(act==='correct')correction();else if(act==='payer')await form(act);else if(act==='contact-settings')await openSettingsSheet('contact');else if(act==='payment-settings'||act==='settings')await openSettingsSheet('payment');else if(act.startsWith('pdf-')&&adapter.mode==='live')await downloadPdf(act.slice(4));else if(act.startsWith('pdf-')||act==='share'||act==='email'){notice='Diese Aktion benötigt die echte PDF-Schnittstelle. Im Demomodus wurde nichts heruntergeladen oder versendet.';if(view==='detail')await details(current.id);else home();}};
 const handleClick=e=>{if(e.target.closest('a[data-e4]'))e.preventDefault();void click(e);};
 const handleSearch=e=>{if(!e.target.matches('.e4-search input'))return;search=e.target.value;root.querySelector('.e4-search-results').innerHTML=searchResults();};
 root.addEventListener('input',handleSearch);
 root.addEventListener('click',handleClick);
 adapter.list().then(data=>{if(disposed)return;rows=data;if(initialInvoiceId){const pair=rows.find(r=>r.documents?.some(d=>d.id===initialInvoiceId));void details(pair?.id||initialInvoiceId);}else home();}).catch(e=>{if(disposed)return;notice='Rechnungen konnten nicht geladen werden: '+(e.message||'Unbekannter Fehler');home();});
 return {destroy(){disposed=true;root.removeEventListener('input',handleSearch);root.removeEventListener('click',handleClick);onSubpageChange(false);},create(){batch();},settings(){openSettingsSheet('contact');}};
}
