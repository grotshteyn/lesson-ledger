// Run with: node --test tests/frontend-shell.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../frontend/shell.js',import.meta.url),'utf8');
const {shellMarkup,TAB_LABELS,SHELL_EVENTS}=await import('data:text/javascript,'+encodeURIComponent(source));
test('three German navigation destinations and active state',()=>{
 assert.deepEqual(Object.values(TAB_LABELS),['Stunden','Schüler','Rechnungen']);
 for(const key of Object.keys(TAB_LABELS)){
  const html=shellMarkup({tab:key,content:'Test'});
  assert.equal((html.match(/class="ll-tab"/g)||[]).length,3);
  assert.match(html,new RegExp('data-ll-tab="'+key+'" aria-current="page"'));
  assert.match(html,/aria-label="Einstellungen öffnen"/);
  assert.doesNotMatch(html,/data-ll-tab="home"|data-ll-tab="todo"/);
 }
});
test('floating action is optional and unknown tabs fail closed',()=>{
 assert.doesNotMatch(shellMarkup({tab:'invoices'}),/data-ll-create/);
 assert.match(shellMarkup({tab:'students',actionLabel:'+ Schüler hinzufügen'}),/data-ll-create/);
 assert.throws(()=>shellMarkup({tab:'home'}),/Unknown shell tab/);
 assert.equal(SHELL_EVENTS.navigate,'lesson-ledger:navigate');
});

// Source-level regression checks for the shell-owned invoices route and CSS.
test('IN-1 uses centered semantic empty state without a generic card',async()=>{
 const app=await readFile(new URL('../app.js',import.meta.url),'utf8');
 const css=await readFile(new URL('../style.css',import.meta.url),'utf8');
 assert.match(app,/renderTab\('invoices','<section class="ll-invoices-empty" role="status"/);
 assert.doesNotMatch(app,/renderTab\('invoices','<section class="card ll-empty"/);
 assert.match(app,/Noch keine Rechnungen/);
 assert.match(css,/\.ll-invoices-empty\{[^}]*align-items:center;justify-content:center/);
 assert.match(css,/\.ll-app:has\(\.ll-invoices-empty\)>\.ll-content\{[^}]*flex:1/);
});
test('responsive navigation retains equal tabs, focus and safe area',async()=>{
 const css=await readFile(new URL('../style.css',import.meta.url),'utf8');
 assert.match(css,/grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
 assert.match(css,/\.ll-tab:focus-visible/);
 assert.match(css,/safe-area-inset-bottom/);
 assert.match(css,/@media\(max-width:380px\)/);
 assert.match(css,/\.ll-tab\{[^}]*overflow-wrap:anywhere/);
});


test('settings control has a visible text label and keeps settings event',()=>{
 const markup=shellMarkup({tab:'lessons'});
 assert.match(markup,/>Settings<\/button>/);
 assert.match(markup,/data-ll-settings/);
 assert.match(markup,/aria-label="Settings"/);
});
