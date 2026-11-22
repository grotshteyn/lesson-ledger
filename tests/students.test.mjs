// Run: node --test tests/students.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../students/students.js',import.meta.url),'utf8');
const {normalize,studentPrice,groupStudents,groupLessons,matchingStudents,duplicateNames,basicsChanges,STUDENT_STORIES}=await import('../students/students.js');

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

test('ST-3: all three groups remain visible after a search',()=>{
 const groups=groupStudents(matchingStudents([{student_name:'Anna',status:'active'},{student_name:'Anton',status:'paused'},{student_name:'Anja',status:'ended'}],'an'));
 assert.deepEqual(groups.map(g=>g.status),['active','paused','ended']);
 assert.deepEqual(groups.map(g=>g.items.length),[1,1,1]);
});
test('ST-3: no filter UI is present in Students list',()=>{
 assert.doesNotMatch(source,/data-filter|Statusfilter|filter==='all'/);
});
test('ST-4: Basics edits do not send unsupported student_name',()=>{
 assert.doesNotMatch(source,/changes\.student_name|\['student_name','nickname','subject'\]/);
 assert.match(source,/nicht bearbeitbar/);
});
test('ST-4: pricing uses versioned RPC without repricing existing lessons',()=>{
 assert.match(source,/change_student_with_repricing/);
 assert.match(source,/p_reprice:false/);
 assert.match(source,/p_idempotency_key:crypto\.randomUUID\(\)/);
});

test('ST-4: Basics payload allowlist excludes student_name and arbitrary fields',()=>{
 const changes=basicsChanges({student_name:'Unauthorized rename',nickname:'  Niki  ',subject:'  Physik ',payer_name:'Unexpected',price:0});
 assert.deepEqual(changes,{nickname:'Niki',subject:'Physik'});
 assert.equal(Object.hasOwn(changes,'student_name'),false);
 assert.equal(Object.hasOwn(changes,'payer_name'),false);
 assert.equal(Object.hasOwn(changes,'price'),false);
});
test('ST-4: Basics form uses the payload allowlist, keeping name read-only',()=>{
 assert.match(source,/Object\.assign\(changes,basicsChanges\(/);
 assert.match(source,/Name: \$\{escape\(v\.student_name\)\} \(nicht bearbeitbar\)/);
 assert.doesNotMatch(source,/input\('student_name','Name',v\.student_name/);
});
