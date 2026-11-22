/** Shared E1 navigation contract. No Supabase dependencies. */
export const TAB_LABELS=Object.freeze({lessons:'Stunden',students:'Schüler',invoices:'Rechnungen'});
export const SHELL_EVENTS=Object.freeze({navigate:'lesson-ledger:navigate',settings:'lesson-ledger:settings',create:'lesson-ledger:create'});
const icons={lessons:'▦',students:'♙',invoices:'▤'};
export function shellMarkup({tab,title=TAB_LABELS[tab],content='',actionLabel=''}){
 if(!Object.hasOwn(TAB_LABELS,tab))throw new Error('Unknown shell tab');
 const tabs=Object.entries(TAB_LABELS).map(([key,label])=>'<button type="button" class="ll-tab" data-ll-tab="'+key+'" aria-current="'+(key===tab?'page':'false')+'"><span aria-hidden="true">'+icons[key]+'</span><span>'+label+'</span></button>').join('');
 return '<div class="ll-app"><header class="ll-header"><h1>'+title+'</h1><button type="button" class="ll-settings" data-ll-settings aria-label="Einstellungen öffnen" title="Settings">Settings</button></header><div class="ll-content">'+content+'</div>'+(actionLabel?'<button type="button" class="ll-floating-action" data-ll-create>'+actionLabel+'</button>':'')+'<nav class="ll-tabs" aria-label="Hauptnavigation">'+tabs+'</nav></div>';
}
export function bindShell(root,handlers){
 root.querySelectorAll('[data-ll-tab]').forEach(button=>button.addEventListener('click',()=>handlers.navigate(button.dataset.llTab)));
 root.querySelector('[data-ll-settings]')?.addEventListener('click',handlers.settings);
 root.querySelector('[data-ll-create]')?.addEventListener('click',handlers.create);
}
