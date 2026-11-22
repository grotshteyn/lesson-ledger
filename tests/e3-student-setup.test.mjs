import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../style.css',import.meta.url),'utf8');
const page=app.slice(app.indexOf('async function studentPage('),app.indexOf('function studentStatusForm('));

test('E3 lessons view and student setup subpage both remain available',()=>{
 assert.match(page,/const isSetup=view==='setup'/);
 assert.match(page,/studentPage\(id,isSetup\?'lessons':'setup'\)/);
 assert.match(page,/loadLessonHistory\(id\)/);
 assert.match(page,/logLessonSheet\(id\)/);
});
test('student Setup uses settings-style rows and one combined billing editor',()=>{
 assert.match(page,/card student-details-card/);
 assert.match(page,/\['billing_mode','Kosten und Abrechnung',moneyLabel\(v\)\]/);
 assert.doesNotMatch(page,/\['price','Preis',moneyLabel\(v\)\]/);
 assert.match(page,/editStudentButton\(key,value\)/);
 assert.match(page,/changes\.billing_mode=g\('billing_mode'\);changes\.price=g\('newBillingPrice'\)/);
});
test('change dialog retains E3 repricing and no-show handling',()=>{
 assert.match(page,/change_student_with_repricing/);
 assert.match(page,/repriceLessons/);
 assert.match(page,/no_show_billable/);
 assert.match(page,/studentPage\(id,'setup'\)/);
 assert.doesNotMatch(page,/field\(k,'Neu'/);
 assert.match(css,/grid-template-columns:minmax\(0,1fr\) minmax\(0,1fr\)/);
});
