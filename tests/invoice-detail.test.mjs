import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../invoices/invoices.js',import.meta.url),'utf8');
test('invoice detail follows document section order',()=>{
 const detail=source.slice(source.indexOf(' const details=async id=>'),source.indexOf(' const batch=()=>'));
 const sections=['const from=card(\'Von\'','const payer=card(\'An\'','const what=card(\'Leistungen\'','const bank=card(\'Bankverbindung\''];
 let last=-1;for(const section of sections){const pos=detail.indexOf(section);assert.ok(pos>last,section);last=pos;}
 assert.match(detail,/\+from\+payer\+what\+bank\+/);
});
test('status shown once in detail header, missing fields inline',()=>{
 const detail=source.slice(source.indexOf(' const details=async id=>'),source.indexOf(' const batch=()=>'));
 assert.match(detail,/e4-status--/);
 assert.match(detail,/inlineErrors\(/);
 assert.doesNotMatch(detail,/Bereit zur Ausstellung|Ausgestellt · unveränderlich/);
});
test('contextual footer issues/downloads and closes',()=>{
 assert.match(source,/button\('PDF herunterladen','pdf-'\+r\.id/);
 assert.match(source,/button\('Ausstellen & herunterladen'/);
 assert.match(source,/foot\(button\(issued\?'Schließen':'Abbrechen','home'\)\+primary\)/);
 assert.match(source,/else if\(act==='issue-download'\)await issueAndDownload\(\)/);
});
test('one click issues once then resolves PDF from issued invoice',()=>{
 const action=source.slice(source.indexOf(' const issueAndDownload='),source.indexOf(' const details=async id=>'));
 assert.match(action,/adapter\.issue\(/);
 assert.match(action,/rows=await adapter\.list\(\)/);
 assert.match(action,/await details\(issuedId\)/);
 assert.match(action,/await downloadPdf\(issuedId\)/);
 assert.match(action,/if\(busy\|\|/);
});
