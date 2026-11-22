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
