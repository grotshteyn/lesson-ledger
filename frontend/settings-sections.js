// Shared editable billing sections for Settings and invoice bottom sheets.
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
export const sectionFields=(section,s={})=>{
 const a=s.teacher_address||{};
 const input=(key,label,value='',type='text')=>'<label class="ll-setting-field"><span>'+label+'</span><input name="'+key+'" type="'+type+'" value="'+esc(value)+'"></label>';
 if(section==='account')return input('email','Anmelde-E-Mail',s.email,'email')+'<label class="ll-setting-field"><span>Neues Passwort (optional)</span><input name="password" type="password" autocomplete="new-password" minlength="12"></label><label class="ll-setting-field"><span>Passwort bestätigen</span><input name="confirm_password" type="password" autocomplete="new-password"></label><p class="ll-settings-hint">Mindestens 12 Zeichen. Lass die Passwortfelder leer, wenn du dein Passwort nicht ändern möchtest.</p>';
 if(section==='payer'){const a=s.payer_address||{};return input('name','Name',s.payer_name)+input('street','Straße und Hausnummer',a.street)+input('postcode','Postleitzahl',a.postcode)+input('city','Ort',a.city)+input('email','E-Mail',s.payer_email,'email');}
 if(section==='contact')return input('teacher_name','Name auf Rechnungen',s.teacher_name)+input('street','Straße und Hausnummer',a.street)+input('postcode','Postleitzahl',a.postcode)+input('city','Ort',a.city)+input('country','Land',a.country||'Deutschland')+input('teacher_email','Kontakt-E-Mail',s.teacher_email,'email')+input('phone','Telefon (optional)',s.phone,'tel');
 if(section==='payment')return input('iban','IBAN',s.iban)+input('bank_name','Bankname',s.bank_name)+input('tax_number','Steuernummer',s.tax_number)+
 '<label class="ll-setting-field"><span>Umsatzsteuer</span><select name="vat_mode">'+[['small_business','Kleinunternehmer (§ 19 UStG)'],['exempt_teaching','Steuerfreier Unterricht (§ 4 Nr. 21 UStG)'],['regular_19','Regulär 19 %'],['unsure','Noch nicht festgelegt']].map(([v,l])=>'<option value="'+v+'" '+(s.vat_mode===v?'selected':'')+'>'+l+'</option>').join('')+'</select></label>'+
 input('payment_days','Zahlungsfrist (Tage)',s.payment_days??14,'number')+'<p class="ll-settings-hint">Stornoregel: Bis 24 Stunden vorher kostenlos, danach kostenpflichtig.</p>'+(s.invoiceNumbering?.editable&&!s.invoiceNumbering.exhausted?input('invoice_start','Nächste Rechnungsnummer',s.invoiceNumbering.next_invoice_number):'');
 return '';
};
export const sectionTitle=section=>section==='account'?'Konto':section==='payer'?'Zahlungspflichtige Person':section==='contact'?'Kontaktinformationen':'Zahlungsinformationen';
export const sectionForm=(section,s)=>'<form class="ll-setting-section" data-section="'+section+'"><h2>'+sectionTitle(section)+'</h2>'+sectionFields(section,s)+'<p class="ll-setting-error" role="alert"></p><div class="ll-setting-actions"><button class="ll-setting-save ll-setting-secondary" type="button" data-sheet-cancel>Abbrechen</button><button class="ll-setting-save" type="submit">Speichern</button></div></form>';
export const parseSection=(form,section,previous={})=>{
 const value=name=>form.elements.namedItem(name)?.value.trim()||'';
 const changes={};
 if(section==='contact'){
  const address={street:value('street'),postcode:value('postcode'),city:value('city'),country:value('country')||'Deutschland'};
  if(!value('teacher_name')||!address.street||!/^\d{5}$/.test(address.postcode)||!address.city)throw Error('Bitte Name und vollständige Anschrift mit fünfstelliger PLZ eingeben.');
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value('teacher_email')))throw Error('Bitte eine gültige Kontakt-E-Mail eingeben.');
  Object.assign(changes,{teacher_name:value('teacher_name'),teacher_address:address,teacher_email:value('teacher_email'),phone:value('phone')});
 }else{
  const iban=value('iban').replace(/\s/g,'').toUpperCase();
  if(iban&&!validIban(iban))throw Error('Die IBAN ist ungültig.');
  const days=Number(value('payment_days'));
  if(!Number.isInteger(days)||days<1||days>365)throw Error('Die Zahlungsfrist muss zwischen 1 und 365 Tagen liegen.');
  Object.assign(changes,{iban,bank_name:value('bank_name'),tax_number:value('tax_number'),vat_mode:value('vat_mode'),payment_days:days});
 }
 const allowed=['teacher_name','teacher_address','teacher_email','phone','tax_number','vat_mode','iban','bank_name','payment_days','cancellation_rule','invoice_prefix'];
 const merged={};for(const key of allowed)if(previous[key]!==undefined)merged[key]=previous[key];
 return {...merged,...changes,cancellation_rule:previous.cancellation_rule||'24h'};
};
function validIban(v){if(!/^[A-Z]{2}[0-9A-Z]{13,32}$/.test(v))return false;const reordered=v.slice(4)+v.slice(0,4);let rem=0;for(const c of reordered){const digits=/[A-Z]/.test(c)?String(c.charCodeAt(0)-55):c;for(const d of digits)rem=(rem*10+Number(d))%97;}return rem===1;}
export async function saveBillingSection(supabase,ledger,section,form,previous){
 const changes=parseSection(form,section,previous);
 const {error}=await supabase.from('billing_settings_versions').insert({...changes,ledger_id:ledger,effective_from:new Date().toLocaleDateString('sv-SE')});
 if(error)throw error;
 return changes;
}

export function sectionSummary(section,s={}){
 const a=s.teacher_address||{};
 const vat={small_business:'Kleinunternehmer (§ 19 UStG)',exempt_teaching:'Steuerfreier Unterricht (§ 4 Nr. 21 UStG)',regular_19:'Regulär 19 %',unsure:'Noch nicht festgelegt'};
 const rows=section==='contact'?[['Name auf Rechnungen',s.teacher_name],['Postanschrift',[a.street,[a.postcode,a.city].filter(Boolean).join(' '),a.country].filter(Boolean).join(', ')],['Kontakt-E-Mail',s.teacher_email],['Telefon',s.phone]]:[['IBAN',s.iban],['Bankname',s.bank_name],['Steuernummer',s.tax_number],['Umsatzsteuer',vat[s.vat_mode]],['Zahlungsfrist',(s.payment_days??14)+' Tage'],['Stornoregel','24 Stunden']];
 if(section==='payment'&&s.invoiceNumbering)rows.push(['Nächste Rechnungsnummer',s.invoiceNumbering.exhausted?'Nummernkreis ausgeschöpft':s.invoiceNumbering.next_invoice_number]);
 return '<section class="ll-setting-section"><div class="ll-setting-heading"><h2>'+sectionTitle(section)+'</h2><button type="button" data-edit-section="'+section+'">Bearbeiten</button></div>'+rows.map(([label,value])=>'<div class="ll-setting-summary"><span>'+esc(label)+'</span><strong>'+esc(value||'Nicht angegeben')+'</strong></div>').join('')+'</section>';
}
export function openSectionSheet({section,data,onSave,onSaved=()=>{}}){
 const overlay=document.createElement('div');overlay.className='ll-settings-overlay';
 overlay.innerHTML='<div class="ll-settings-sheet" role="dialog" aria-modal="true" aria-label="'+sectionTitle(section)+'">'+sectionForm(section,data)+'</div>';
 const prior=document.activeElement,overflow=document.body.style.overflow;
 document.body.append(overlay);document.body.style.overflow='hidden';
 const close=()=>{overlay.remove();document.body.style.overflow=overflow;prior?.focus();};
 const form=overlay.querySelector('form'),cancel=form.querySelector('[data-sheet-cancel]'),submit=form.querySelector('[type=submit]'),error=form.querySelector('.ll-setting-error');
 cancel.onclick=close;
 form.onsubmit=async e=>{e.preventDefault();error.textContent='';submit.disabled=cancel.disabled=true;try{const result=await onSave(form);close();await onSaved(result);}catch(ex){error.textContent=ex.message||'Speichern fehlgeschlagen.';submit.disabled=cancel.disabled=false;}};
}
