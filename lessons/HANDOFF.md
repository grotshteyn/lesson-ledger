# Lessons E3 handoff for issue #23

Branch: `agent/lessons` → `design/three-tab-german-refactor`. No merge or deployment.

## Integration
Import `mountLessons` from `./lessons/lessons.js` and load `./lessons/lessons.css` in the shell. Call `mountLessons({root,supabase,onBack,onSubpageChange,today,initialLessonId,initialStudentId})`. The returned object exposes `destroy()`, `refresh()`, `openLesson(lessonId,studentId)`, and `createLesson(studentId)`. Student page callbacks from #22 should invoke the latter two methods. Shell must hide tabs when `onSubpageChange(true)` fires and restore them on false. Do not mount multiple concurrent instances. No changes were made to `app.js`, `style.css`, `index.html`, or SQL.

## User-story coverage
| Story | UI behavior | Status |
| --- | --- | --- |
| LE-7 | German weekly lessons, newest week first, date/name/status/amount | Implemented in isolated module; integration pending |
| LE-1 | New lesson, initially no student, bounded independently scrolling search, fixed-student entry | Implemented; backend verification pending |
| LE-3 | Heute/Gestern/date picker, Monday-first grid, today/selected indicators, lesson dots, historical defaults | Implemented; needs 360px/browser validation |
| LE-4 | Duplicate bottom sheet, side-by-side existing/new, cancel default, explicit second save | Implemented UI; requires backend response confirmation |
| LE-5 | Held/cancelled_billable and zero-priced waiver, inactive confirmation | Implemented UI; requires backend RPC compatibility |
| LE-6 | Edit with preserved stored minutes/rate, history, remove, invoiced read-only | Implemented UI; requires backend RPC compatibility |
| ST-6.5 | Students integration via openLesson/createLesson callbacks | Contract proposed; integration pending |

## RPC assumptions and open contracts
- `student_details_at({p_student_id,p_at})` returns a list with `minutes`, `rate`, `billing_mode`.
- `log_lesson` takes `p_student_id,p_lesson_date,p_status,p_minutes,p_rate,p_idempotency_key,p_confirm_inactive,p_confirm_duplicate`.
- `replace_lesson` substitutes `p_old_lesson_id` for `p_student_id` and accepts the other fields.
- `void_lesson` takes `p_lesson_id,p_reason,p_idempotency_key`.
- Save response states: `saved`, `duplicate`, `inactive`. Backend agent must verify status values and zero-rate constraints. No direct table writes are used for lessons.
- Existing `active_lessons`, `lessons`, and `student_versions` reads rely on RLS.
- Confirm contracts in issue #25 before integration. Do not bypass RPC validation.

## Tests and limitations
- Syntax parsed successfully and pure-function assertions passed for Monday-first leap-year calendar, Sunday-month padding and newest-first weekly grouping.
- Added `lessons/lessons.test.mjs` for Node's built-in test runner (`node --test lessons/lessons.test.mjs`); full command has not been executed in a checked-out repository.
- Not run: browser UI tests at 360px and wide viewport, keyboard/safe-area checks, real Supabase RPC tests, RLS tenant tests, invoiced lock and idempotency tests.
- Original wireframe screenshots were not accessible in the repository. Fidelity must be reviewed against the supplied wireframes.
- Backend changes, integration, invoice issuance, authentication and production deployment are out of scope.

## Risks
- The existing backend may reject `cancelled_billable`, future held dates, zero prices or confirmation flags until backend #24 lands.
- Duplicate sheet compares the local matching lesson; if the server reports a duplicate absent from the currently loaded list, the existing row is not available for an accurate comparison. Resolve with backend-provided duplicate details or a targeted query.
- UI mount contract is proposed, not yet accepted by shell #21.
- A real browser smoke test is required before marking stories accepted.
