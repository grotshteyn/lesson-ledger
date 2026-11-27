/** Shared E1 navigation contract. No Supabase dependencies. */
export const TAB_LABELS=Object.freeze({lessons:'Stunden',students:'Schüler',invoices:'Rechnungen'});
export const SHELL_EVENTS=Object.freeze({navigate:'lesson-ledger:navigate',settings:'lesson-ledger:settings',create:'lesson-ledger:create'});
const svg=body=>'<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">'+body+'</svg>';
const icons={lessons:svg('<path d="M8 2v4M16 2v4"/><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01"/>'),students:svg('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/><circle cx="9" cy="7" r="4"/>'),invoices:svg('<path d="M4 3l2 2 2-2 2 2 2-2 2 2 2-2 2 2 2-2v18l-2-2-2 2-2-2-2 2-2-2-2 2-2-2-2 2zM8 9h8M8 13h8M8 17h4"/>')};
export function shellMarkup({tab,title=TAB_LABELS[tab],content='',actionLabel=''}){
 if(!Object.hasOwn(TAB_LABELS,tab))throw new Error('Unknown shell tab');
 const tabs=Object.entries(TAB_LABELS).map(([key,label])=>'<button type="button" class="ll-tab" data-ll-tab="'+key+'" aria-current="'+(key===tab?'page':'false')+'"><span aria-hidden="true">'+icons[key]+'</span><span>'+label+'</span></button>').join('');
 return '<div class="ll-app"><header class="ll-header"><h1>'+title+'</h1><button type="button" class="ll-settings" data-ll-settings aria-label="Einstellungen öffnen" title="Einstellungen">Einstellungen</button></header><div class="ll-content">'+content+'</div>'+(actionLabel?'<button type="button" class="ll-floating-action" data-ll-create>'+actionLabel+'</button>':'')+'<nav class="ll-tabs" aria-label="Hauptnavigation">'+tabs+'</nav></div>';
}
export function bindShell(root,handlers){
 root.querySelectorAll('[data-ll-tab]').forEach(button=>button.addEventListener('click',()=>handlers.navigate(button.dataset.llTab)));
 root.querySelector('[data-ll-settings]')?.addEventListener('click',handlers.settings);
 root.querySelector('[data-ll-create]')?.addEventListener('click',handlers.create);
}
