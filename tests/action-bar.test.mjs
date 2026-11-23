import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {actionBar} from '../frontend/action-bar.js';

test('shared bar: two actions stay inside one configured bottom bar',()=>{
 const html=actionBar('<button type="button">Abbrechen</button><button type="submit">Fertig</button>',{context:'student-edit'});
 assert.match(html,/ll-action-bar--bottom ll-action-bar--2/);
 assert.match(html,/data-action-context="student-edit"/);
 assert.match(html,/type="submit"/);
});
test('shared bar: single detail action and inline placement',()=>{
 assert.match(actionBar('<button>Fertig</button>',{count:1,placement:'inline'}),/ll-action-bar--inline ll-action-bar--1/);
});
test('shared bar: invalid configurations fail explicitly',()=>{
 assert.throws(()=>actionBar('',{placement:'left'}),/placement/);
 assert.throws(()=>actionBar('',{count:3}),/one or two/);
});
test('all subview modules import shared action bar',async()=>{
 for(const path of ['students/students.js','lessons/lessons.js','invoices/invoices.js']){
  const source=await readFile(new URL('../'+path,import.meta.url),'utf8');
  assert.match(source,/import \{actionBar\} from '\.\.\/frontend\/action-bar\.js'/);
  assert.match(source,/actionBar\(/);
 }
});
test('invoice overview alone keeps floating action',async()=>{
 const source=await readFile(new URL('../invoices/invoices.js',import.meta.url),'utf8');
 assert.match(source,/placement==='floating'/);
 assert.match(source,/Rechnungen ausstellen','batch'\),'floating'/);
});
