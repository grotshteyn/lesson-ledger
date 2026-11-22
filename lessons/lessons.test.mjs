// Run: node --test lessons/lessons.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('./lessons.js',import.meta.url),'utf8');
const {lessonWeekGroups,lessonCalendarDays,lessonSaveFingerprint}=await import('./lessons.js');

test('LE-7: groups are Monday-first and newest first, without mutating input',()=>{
  const input=[{lesson_date:'2026-11-15'},{lesson_date:'2026-11-16'},{lesson_date:'2026-11-22'},{lesson_date:'2026-11-09'}];
  const original=[...input];
  const groups=lessonWeekGroups(input);
  assert.deepEqual(groups.map(g=>g.week),['2026-11-16','2026-11-09']);
  assert.deepEqual(groups.map(g=>g.items.length),[2,2]);
  assert.deepEqual(input,original);
});
test('LE-3: Monday-first calendar has correct padding and leap day',()=>{
  const days=lessonCalendarDays(2024,1);
  assert.equal(days[0].date,'2024-01-29');
  assert.equal(days.find(d=>d.date==='2024-02-29').inMonth,true);
  assert.equal(days.length%7,0);
});
test('LE-3: Sunday-first native getDay is normalized to Monday',()=>{
  assert.equal(lessonCalendarDays(2026,10)[0].date,'2026-10-26');
});

test('LE-4: retries reuse identity only for the same intended payload',()=>{
  const base={studentId:'student-1',originalId:null,date:'2026-11-22',status:'held',minutes:60,rate:0};
  assert.equal(lessonSaveFingerprint(base),lessonSaveFingerprint({...base}));
  for(const change of [{date:'2026-11-23'},{rate:25},{minutes:45},{status:'cancelled_billable'},{studentId:'student-2'},{originalId:'lesson-1'}]){
    assert.notEqual(lessonSaveFingerprint(base),lessonSaveFingerprint({...base,...change}));
  }
});
test('LE-7: Monday grouping is timezone independent across year boundary',()=>{
  const groups=lessonWeekGroups([{lesson_date:'2027-01-01'},{lesson_date:'2026-12-28'}]);
  assert.deepEqual(groups.map(g=>g.week),['2026-12-28']);
});
