// Run: node --test tests/students.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../students/students.js',import.meta.url),'utf8');
const {normalize,studentPrice,groupStudents,groupLessons,matchingStudents,duplicateNames,STUDENT_STORIES}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));

test('ST-3: name and nickname search normalization handles accents and case',()=>{
 assert.equal(normalize('  JÖRG Müller  '),'jorg muller');
 assert.equal(normalize('Émile'),'emile');
});
test('ST-3: student groups preserve active, paused, ended ordering and sort by name',()=>{
 const students=[{student_name:'Zoe',status:'active'},{student_name:'Anna',status:'active'},{student_name:'Bert',status:'paused'},{student_name:'Clara',status:'ended'}];
 const groups=groupStudents(students);
 assert.deepEqual(groups.map(g=>g.status),['active','paused','ended']);
 assert.deepEqual(groups[0].items.map(s=>s.student_name),['Anna','Zoe']);
 assert.equal(groups[1].items[0].student_name,'Bert');
});
test('ST-6: display rates distinguish per-lesson and monthly billing',()=>{
 assert.match(studentPrice({billing_mode:'per_lesson',rate:45}),/45,00/);
 assert.match(studentPrice({billing_mode:'monthly_flat',monthly_fee:150}),/Monat/);
});
test('ST-6.5: student lessons group newest month first and date descending',()=>{
 const groups=groupLessons([{lesson_date:'2026-09-01'},{lesson_date:'2026-11-03'},{lesson_date:'2026-11-20'},{lesson_date:'2026-10-05'}]);
 assert.deepEqual(groups.map(g=>g.month),['2026-11','2026-10','2026-09']);
 assert.equal(groups[0].items[0].lesson_date,'2026-11-20');
});
test('ST-1/ST-4/ST-6: story IDs are declared for traceability',()=>{
 for(const id of ['ST-1','ST-3','ST-4','ST-6','ST-6.5'])assert.ok(STUDENT_STORIES.includes(id));
});

test('ST-3: local filtering matches nickname and names, including diacritics',()=>{
 const rows=[{student_name:'Jörg',nickname:'Jo'},{student_name:'Clara',nickname:'Maus'}];
 assert.deepEqual(matchingStudents(rows,'JORG').map(s=>s.student_name),['Jörg']);
 assert.deepEqual(matchingStudents(rows,'maus').map(s=>s.student_name),['Clara']);
 assert.equal(matchingStudents(rows,'unbekannt').length,0);
});
test('ST-1: duplicate detection normalizes case and accents across statuses',()=>{
 assert.equal(duplicateNames([{student_name:'Émile',status:'ended'}],'emile'),true);
 assert.equal(duplicateNames([{student_name:'Anna',status:'paused'}],'Berta'),false);
});
test('ST-3: unknown statuses do not leak into defined groups',()=>{
 assert.equal(groupStudents([{student_name:'X',status:'pending'}]).reduce((n,g)=>n+g.items.length,0),0);
});
test('ST-6.5: empty lesson history produces no month groups',()=>{
 assert.deepEqual(groupLessons([]),[]);
});
