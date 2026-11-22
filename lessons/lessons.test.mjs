// Run: node --test lessons/lessons.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('./lessons.js',import.meta.url),'utf8');
const {lessonWeekGroups,lessonCalendarDays}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));

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
