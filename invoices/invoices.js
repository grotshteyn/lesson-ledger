// E4 invoice UI. All fixture amounts are display-only backend-shaped values.
// Never call provisional invoice RPCs until issue #55 defines their contracts.
export const E4_STORIES = ['IN-1','IN-2','IN-4','IN-5'];
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const eur=c=>new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR'}).format(Number(c)/100);
const monthLabel=m=>new Date(m+'-01T12:00:00').toLocaleDateString('de-DE',{month:'long',year:'numeric'});
export const groupInvoices=rows=>Object.entries(rows.reduce((a,r)=>{(a[r.billingMonth]??=[]).push(r);return a;},{})).sort(([a],[b])=>b.localeCompare(a)).map(([month,items])=>({month,items:items.sort((a,b)=>({ready:0,missing_details:1,in_progress:2,issued:3,cancelled:4}[a.status]??5)-({ready:0,missing_details:1,in_progress:2,issued:3,cancelled:4}[b.status]??5)),totalCents:items.reduce((sum,x)=>sum+x.totalCents,0)}));
export const readyInvoices=rows=>rows.filter(r=>r.status==='ready');
const demo=[
 {id:'d1',student:'Anna Becker',billingMonth:'2026-11',status:'ready',totalCents:10500,lessons:[3,17,24],payer:'Anna Becker',address:'Lindenweg 7, 78464 Konstanz'},
 {id:'d2',student:'Anna Schulz',billingMonth:'2026-11',status:'ready',totalCents:12500,lessons:[4,11,18,25]},
 {id:'d3',student:'Clara Hoffmann',billingMonth:'2026-11',status:'ready',totalCents:14000,lessons:[5,12,19,26]},
 {id:'d4',student:'David Klein',billingMonth:'2026-11',status:'missing_details',totalCents:7000,lessons:[9,23],payer:'Petra Klein',missing:['payer_address']},
 {id:'i1',student:'Ben Wagner',billingMonth:'2026-11',status:'issued',totalCents:16000,number:'2026-0007',lessons:[6,13,20,27]},
 {id:'d5',student:'Clara Hoffmann',billingMonth:'2026-10',status:'ready',totalCents:3500,lessons:[8]},
 {id:'i2',student:'Ben Wagner',billingMonth:'2026-10',status:'issued',totalCents:16000,number:'2026-0006',lessons:[2,9,16,23]},
 {id:'i3',student:'Anna Schulz',billingMonth:'2026-10',status:'issued',totalCents:10000,number:'2026-0005',lessons:[1,8,15,22]},
 {id:'p1',student:'Anna Schulz',billingMonth:'2026-12',status:'in_progress',totalCents:2500,lessons:[2]}
];
export function fixtureInvoiceAdapter(){
 const rows=demo.map(r=>({...r,lessons:[...r.lessons]}));
 return {mode:'fixture',async list(){return rows.map(r=>({...r}));},async preview(id){return rows.find(r=>r.id===id)||null;},async get(id){return rows.find(r=>r.id===id)||null;}};
}
export function mountInvoices({root,onSubpageChange=()=>{},adapter=fixtureInvoiceAdapter()}){
 let rows=[],view='list',current=null,selected=new Set(),notice='',result=[];
 const status={ready:'Bereit',missing_details:'Angaben fehlen',in_progress:'In Bearbeitung',issued:'Ausgestellt',cancelled:'Storniert'};
 const button=(label,action,extra='')=>'<button type="button" data-e4="'+action+'" '+extra+'>'+esc(label)+'</button>';
 const card=(title,body)=>'<section class="e4-card"><h3>'+title+'</h3>'+body+'</section>';
 const line=r=>'<div class="e4-line '+esc(r.status)+'"><button type="button" data-open="'+esc(r.id)+'"><span>'+esc(r.student)+'</span><small>'+esc(r.number||status[r.status]||r.status)+'</small><strong>'+eur(r.totalCents)+'</strong></button>'+(r.status==='issued'?button('↓','pdf-'+r.id,'aria-label="PDF herunterladen"'):'')+'</div>';
 const groups=items=>groupInvoices(items).map(g=>'<section class="e4-month"><h2>'+esc(monthLabel(g.month))+' <span>'+eur(g.totalCents)+'</span></h2><div class="e4-rows">'+g.items.map(line).join('')+'</div></section>').join('');
 const foot=html=>'<div class="e4-foot">'+html+'</div>';
 const warning=msg=>'<p class="e4-warning" role="status">'+esc(msg)+'</p>';
 const show=(html,sub=false)=>{onSubpageChange(sub);root.innerHTML='<div class="e4">'+(adapter.mode==='fixture'?'<div class="e4-demo">Vorschau mit Beispieldaten · keine echten Rechnungen</div>':'')+(notice?warning(notice):'')+html+'</div>';};
 const home=()=>{view='list';current=null;notice='';show(groups(rows)+(readyInvoices(rows).length?foot(button('Rechnungen ausstellen','batch')):foot('<button disabled>Rechnungen ausstellen</button>')));};
 const details=async id=>{current=await (rows.find(r=>r.id===id)?.status==='issued'?adapter.get(id):adapter.preview(id));if(!current)return;view='detail';const r=current,issued=r.status==='issued',missing=r.status==='missing_details';
 const payer=card('An', '<p>'+esc(r.payer||r.student)+'</p>'+(r.payer&&r.payer!==r.student?'<p>für '+esc(r.student)+'</p>':'')+(r.address?'<p>'+esc(r.address)+'</p>':warning('Rechnungsadresse fehlt')+(issued?'':button('Ergänzen','payer'))));
 const lessons=card('Stunden','<div class="e4-lines">'+r.lessons.map(day=>'<div><span>'+day+'. · Unterricht, 45 Min.</span><span>Beispielposition</span></div>').join('')+'</div><div class="e4-total"><b>Gesamt</b><b>'+eur(r.totalCents)+'</b></div><small>Umsatzsteuertext wird vom Backend geliefert.</small>');
 const from=card('Von','<p>Rechnungssteller und Zahlungsbedingungen werden aus dem gültigen Einstellungsstand übernommen.</p>'+(!issued?button('Rechnungseinstellungen','settings'):''));
 show('<header class="e4-subhead"><h2>'+(issued?'Rechnung '+esc(r.number):'Rechnungsentwurf')+'</h2><p>'+esc(r.student)+' · '+esc(monthLabel(r.billingMonth))+'</p></header>'+(missing?warning('Angaben fehlen · noch nicht ausstellbar'):issued?'<p class="e4-success">Ausgestellt · unveränderlich</p>':'<p class="e4-ready">Bereit zur Ausstellung</p>')+(issued?'<div class="e4-actions">'+button('PDF herunterladen','pdf-'+r.id)+button('Teilen','share')+button('E-Mail vorbereiten','email')+'</div>':'')+payer+lessons+from+(issued?button('Diese Rechnung korrigieren','correct'):'')+foot(button('Fertig','home')),true);
 };
 const batch=()=>{view='batch';selected=new Set(readyInvoices(rows).map(r=>r.id));drawBatch();};
 const drawBatch=()=>{const eligible=readyInvoices(rows);show('<h2>Rechnungen ausstellen</h2>'+groupInvoices(eligible).map(g=>'<section class="e4-month"><h3>'+esc(monthLabel(g.month))+'</h3><div class="e4-rows">'+g.items.map(r=>'<button class="e4-choice '+(selected.has(r.id)?'chosen':'')+'" data-select="'+esc(r.id)+'" aria-pressed="'+selected.has(r.id)+'"><span>'+(selected.has(r.id)?'✓ ':'')+esc(r.student)+'</span><strong>'+eur(r.totalCents)+'</strong></button>').join('')+'</div></section>').join('')+'<p>'+selected.size+' von '+eligible.length+' ausgewählt</p>'+warning('Demomodus: Ausstellen ist deaktiviert, bis der Backend-Vertrag bestätigt ist.')+foot('<button disabled>'+selected.size+' Rechnungen ausstellen</button>'+button('Fertig','home')),true);};
 const correction=()=>{view='correct';show('<h2>Rechnung korrigieren</h2>'+warning('Eine ausgestellte Rechnung kann nicht geändert werden. Nach der Stornierung können die Stunden korrigiert und neu abgerechnet werden.')+'<p>'+esc(current.number)+' · '+esc(current.student)+'</p>'+warning('Stornierung ist bis zur Freigabe der Backend-Schnittstelle deaktiviert.')+foot('<button disabled>Stornierung bestätigen</button>'+button('Zurück','back')),true);};
 const form=kind=>{view=kind;const payer=kind==='payer';show('<h2>'+(payer?'Zahlungspflichtige Person':'Rechnungseinstellungen')+'</h2>'+warning('Nur Vorschau. Speichern wird nach Festlegung der API angebunden.')+'<label>Name<input name="name" value="'+esc(payer?current.payer||current.student:'')+'"></label><label>Adresse<input name="address" placeholder="Straße und Hausnummer"></label><label>Postleitzahl<input name="postcode"></label><label>Ort<input name="city"></label>'+(!payer?'<label>Steuernummer<input name="tax"></label><label>IBAN<input name="iban"></label><label>Umsatzsteuer<select><option>Bitte wählen</option><option>Kleinunternehmer (§ 19 UStG)</option><option>Steuerbefreiter Unterricht (§ 4 Nr. 21 UStG)</option><option>19 % Umsatzsteuer</option></select></label>':'')+foot('<button disabled>Speichern</button>'+button('Zurück','back')),true);};
 const click=async e=>{const choice=e.target.closest('[data-select]');if(choice){selected.has(choice.dataset.select)?selected.delete(choice.dataset.select):selected.add(choice.dataset.select);drawBatch();return;}const open=e.target.closest('[data-open]');if(open){await details(open.dataset.open);return;}const act=e.target.closest('[data-e4]')?.dataset.e4;if(!act)return;if(act==='home')home();else if(act==='back')await details(current.id);else if(act==='batch')batch();else if(act==='correct')correction();else if(act==='payer'||act==='settings')form(act);else if(act.startsWith('pdf-')||act==='share'||act==='email'){notice='Diese Aktion benötigt die echte PDF-Schnittstelle. Im Demomodus wurde nichts heruntergeladen oder versendet.';if(view==='detail')await details(current.id);else home();}};
 root.addEventListener('click',click);
 adapter.list().then(data=>{rows=data;home();}).catch(()=>{notice='Rechnungen konnten nicht geladen werden.';home();});
 return {destroy(){root.removeEventListener('click',click);onSubpageChange(false);},create(){batch();}};
}
