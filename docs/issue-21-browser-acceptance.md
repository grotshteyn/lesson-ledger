# Issue #21: browser acceptance and integration contract (22 November 2026)

**State:** source integrated on `design/three-tab-german-refactor`; browser and database acceptance **NOT RUN**. This checklist is a test plan, not evidence of passing tests. Do not merge to `main` or deploy migrations.

## Verified from source

- `frontend/shell.js`: `shellMarkup({tab,title,content,actionLabel})`, `bindShell(root,{navigate,settings,create})`; supported tabs `lessons`, `students`, `invoices`. `SHELL_EVENTS` names are reserved; actual navigation uses callbacks.
- `mountStudents({root,supabase,onBack,onLessonCreate,onLessonOpen,onSubpageChange,today})`; `onLessonCreate(studentId)` and `onLessonOpen(lessonId,studentId)` are called by Students; shell routes to Lessons. Students exposes `create()` and `open(studentId,'lessons')`.
- `mountLessons({root,supabase,onBack,onSubpageChange,today,initialLessonId,initialStudentId})`; shell invokes `openLesson(lessonId,studentId)` or `createLesson(studentId)`.
- `onSubpageChange(true)` hides shell header and bottom tabs. `onBack` exists in both module signatures, but is **not passed** in the current `app.js` wiring; verify desired cross-module return behavior with #22/#23 before changing it.
- Existing integration audit says proposed `log_lesson_v2` and `replace_lesson_v2` are absent from production. **Do not use production for save acceptance.**

## Browser acceptance matrix

Record for each row: viewport, browser, test account, screenshot or video, pass/fail, issue link. Compare with the 12-page wireframe PDF and HTML reference from the integration conversation; these assets are not committed to the repository. Ignore dashed annotation boxes.

| Journey / state | Expected acceptance | Reference |
| --- | --- | --- |
| Sign in, complete setup, reload | German entry; authenticated default is Stunden, no Home/To-do tab; settings gear accessible | ON-9, PDF 1 |
| Switch all three tabs | Exactly three equal tabs; active tab announced; scroll and back navigation remain usable | ON-9, PDF 1,2,7 |
| Stunden initial loading, empty, query failure | Visible German progress, meaningful empty copy, accessible retry/error without blank page | LE-7 |
| Stunden with multiple months/weeks | Current month heading, week groups newest first, long names and price do not collide | LE-7, PDF 1 |
| Schüler search/status | Active, paused and ended sections visible together and alphabetical; search matches name/nickname and inactive students | ST-3, PDF 2 |
| Schüler loading, empty, error | German states; no silent failure, stale rows or duplicate action | ST-3 |
| Add student | Three cards, required-field validation, duplicate-name confirmation, sticky Abbrechen/Speichern | ST-1, PDF 5 |
| Student details | Stunden/Details switch; independent card edits; effective date and price history; pause/restart/end | ST-4, ST-6, PDF 4,6 |
| Student lessons | Month grouping, invoice badge, student-specific add action; Fertig returns to student | ST-6.5, PDF 3 |
| Global new lesson | No student selected; bounded independently scrolling picker; search for inactive student | LE-1, PDF 8 |
| Student-specific new lesson | Student fixed; save/cancel returns to correct student context; no global tab bar | LE-1, PDF 11 |
| Date selection | Heute/Gestern/Datum wählen; Monday-first grid, dots, today outline, selected fill | LE-3, PDF 12 |
| Date-dependent defaults | New lesson reads historical rate/length for selected date; editing date preserves stored values | LE-3, LE-6 |
| Cancellation and zero rate | Gehalten or Spät abgesagt oder nicht erschienen; 0 EUR allowed when permitted by tested DB | LE-5 |
| Duplicate confirmation | Compare existing/new; default Abbrechen; explicit Zweite speichern; no duplicate on retry | LE-4, PDF 10 |
| Lesson edit/void/history | History visible, invoiced read-only, removal confirmation; no accidental historical mutation | LE-6, PDF 9 |
| Rechnungen | Centered German E4 placeholder, no unfinished invoice creation UI | IN-1, PDF 7 |
| Settings and return | Gear accessible from each main tab; return to prior tab without stale module or overlay | ON-9 |
| Offline/expired auth/server error | German actionable error, no false success or lost unsaved input | NF-6 |
| Keyboard and accessibility | 44px targets, visible focus, correct labels/alerts, logical tab order, Escape/back behavior | ON-9 |
| 360px, 390px, 768px, >=1280px | No horizontal overflow; long text wraps; safe-area and keyboard do not cover action bar or final row | ON-9 |

## Database-backed gate (disposable environment only)

1. Obtain approval and provision a **disposable** database with representative synthetic users and existing schema. Do not migrate production.
2. Apply proposed additive migration there and record migration SHA and rollback.
3. Exercise `student_details_at`, `change_student_with_repricing`, `log_lesson_v2`, `replace_lesson_v2`, `void_lesson`; check exact named payloads and return shapes.
4. Assert zero-rate and future-date behavior, inactive-student confirmation, duplicate/idempotent retry, immutable history, invoiced locks and cross-tenant RLS.
5. Run `node --test tests/frontend-shell.test.mjs tests/students.test.mjs lessons/lessons.test.mjs` and authenticated browser journey. Record outputs; **none are claimed run here**.

## Unresolved owner-coordination requests

- **#22 Students:** confirm `onLessonCreate` / `onLessonOpen` callback argument order, return-to-student route after lesson save/cancel, and grouped statuses replacing filter pills.
- **#23 / #25 Lessons:** confirm `onBack` semantics and callback invocation for student-fixed mode, month heading, edit-history layout, and failure handling if RPC unavailable.
- **#24 Backend:** publish tested v2 RPC argument/result schema and migration compatibility; never silently substitute old RPCs.
- **#21 Shell:** decide shared back-stack contract, empty/error/loading copy ownership and centered invoices placeholder; no breaking interface edits before agreement.

## Integration decision

Keep existing source assembled on integration branch, but **do not merge additional agent PRs or claim acceptance** until contracts and disposable DB/browser gates pass. No production data, migration or `main` changes are authorized.
