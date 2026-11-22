import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const start=source.indexOf('const normalizeStudentText=');
const end=source.indexOf('async function studentsPage(',start);
assert.ok(start>=0&&end>start,'Search helper declarations must exist');
const helpers=source.slice(start,end);
const context=vm.createContext({});
const api=vm.runInContext(helpers+'; ({normalizeStudentText,editDistance,studentSearchRank})',context);
const rank=(student,query)=>api.studentSearchRank(student,api.normalizeStudentText(query));
test('search ignores case and accents',()=>{
 assert.equal(rank({student_name:'José Müller'},'jose'),0);
 assert.equal(rank({student_name:'José Müller'},'MULLER'),0);
});
test('search matches nickname and typos',()=>{
 assert.equal(rank({student_name:'Anna Schmidt',nickname:'Anni'},'anni'),0);
 assert.ok(Number.isFinite(rank({student_name:'Anna Schmidt'},'Ana')));
 assert.equal(rank({student_name:'Anna Schmidt'},'zzzzzz'),Infinity);
});
test('exact matches rank ahead of fuzzy matches',()=>{
 assert.ok(rank({student_name:'Anna'},'Anna')<rank({student_name:'Anja'},'Anna'));
});

test('password sign-in and recovery keep the existing Supabase account',()=>{
 assert.match(source,/auth\.signInWithPassword\(\{email,password\}\)/);
 assert.match(source,/auth\.resetPasswordForEmail\(email,/);
 assert.match(source,/auth\.updateUser\(\{password\}\)/);
 assert.match(source,/event==='PASSWORD_RECOVERY'/);
 assert.match(source,/shouldCreateUser:false/);
});
test('new user registration is separate from existing-account password recovery',()=>{
 assert.match(source,/auth\.signUp\(\{email:/);
 assert.match(source,/Du hast bereits ein Konto\?/);
});
