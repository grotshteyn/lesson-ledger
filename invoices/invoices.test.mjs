// Run: node --experimental-default-type=module --test invoices/invoices.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {adaptOverview,adaptPreview,groupInvoices,readyInvoices,fixtureInvoiceAdapter} from './invoices.js';

test('overview adapter keeps decimal strings and separates draft/issued rows',()=>{
 const rows=adaptOverview({months:[{billing_month:'2026-10-01',candidates:[{student_id:'s1',student_name:'A',status:'ready',gross_amount:'120.00',validation_errors:[]}],issued:[{invoice_id:'i1',student_id:'s2',student_name:'B',status:'issued',gross_amount:'45.50',invoice_number:'2026-0001',pdf_status:'pending'}]}]});
 assert.equal(rows.length,2);assert.equal(rows[0].totalCents,'120.00');assert.equal(rows[1].number,'2026-0001');assert.equal(rows[1].pdfStatus,'pending');
});
test('grouping orders months descending and displays backend values',()=>{
 const groups=groupInvoices([{id:'a',billingMonth:'2026-09',status:'ready',totalCents:'10.50'},{id:'b',billingMonth:'2026-10',status:'issued',totalCents:'12.20'}]);
 assert.deepEqual(groups.map(g=>g.month),['2026-10','2026-09']);assert.equal(groups[0].totalCents,1220);
});
test('only completed months can be selected',()=>{
 const rows=[{billingMonth:'2026-10',status:'ready'},{billingMonth:'2026-11',status:'ready'},{billingMonth:'2026-09',status:'missing_details'}];
 assert.equal(readyInvoices(rows,new Date(2026,10,22)).length,1);
});
test('preview preserves authoritative line amounts and validation',()=>{
 const preview=adaptPreview({student_id:'s1',billing_month:'2026-10-01',gross_amount:'120.00',payer:{name:'A'},lines:[{description:'Pauschale',gross_amount:'120.00'}],validation_errors:['missing_iban'],excluded_lessons:[{description:'Gratis'}]});
 assert.equal(preview.status,'missing_details');assert.equal(preview.lines[0].gross_amount,'120.00');assert.equal(preview.excludedLessons.length,1);
});
test('fixture adapter does not expose invoice mutations',async()=>{
 const api=fixtureInvoiceAdapter();assert.equal(api.mode,'fixture');assert.equal(typeof api.issue,'undefined');assert.equal(typeof api.cancel,'undefined');assert.ok((await api.list()).length>0);
});
