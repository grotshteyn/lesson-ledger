# E1–E3 visual comparison (22 November 2026)

## Reference availability
**Original wireframes are now supplied as a 12-page PDF and a self-contained HTML export in the integration conversation, in addition to the earlier screenshots.** They are available to the reviewer in that conversation, but are not stored in the repository. No authenticated screenshots of the integrated frontend have been captured. Therefore **pixel/behavioral parity is NOT VERIFIED**. Dashed annotation panels in the wireframes are explanatory and must not appear in the application.

## Source-to-reference checklist (not a visual pass)

| Approved screen | Wireframe requirement | Current source observation | Verification |
|---|---|---|---|
| Lessons tab | Month then week groups, newest first, fixed black action, three equal tabs | Lessons module renders current-month heading above newest-first week groups and floating action; shell has tabs | SOURCE IMPLEMENTED at c94f5d7; browser parity pending |
| Students tab | Search, grouped active/paused/ended rows, right-aligned price, black floating action | Students module shows search plus simultaneous active/paused/ended groups and floating action | SOURCE IMPLEMENTED; browser parity pending |
| Invoices tab | Centered German coming-soon message, settings gear, three tabs | Centered German empty state in shell | SOURCE IMPLEMENTED; browser parity pending |
| Student create | Three stacked Basics / Lessons and price / Payer cards, sticky Abbrechen/Speichern | Students module implements E2 create | Pending rendered comparison |
| Student detail | Stunden/Details segmented control, card-level edits, history, Pause/Ende | Students module has detail tabs and editing | Pending |
| Student lessons | Month groups, invoiced marker, + Stunde erfassen, Fertig | Students module groups by month and invokes lesson callbacks | Pending |
| Lesson create from global | Searchable independently scrolling students, no default selection | Lessons module renders scrollable selector | Pending |
| Lesson create from student | Fixed student, date shortcuts, held/cancelled, price and duration | Lessons module accepts fixed student | Pending |
| Lesson edit | Same fields, stored price/length retained on date change, history, read-only invoiced | Lessons module uses stored fields, history and invoiced guard | Pending; form and history split across screens |
| Pricing edit | Effective date, old lessons retain recorded prices | Students calls combined RPC with p_reprice=false | Pending browser/DB |
| Calendar | Monday-first bottom sheet, selected filled, today outline, existing lesson dots | Lessons module implements grid and dot marker | Pending |
| Duplicate | Side-by-side old/new rows in bottom sheet, default cancel | Lessons module renders comparison sheet | Pending |

## Required visual test evidence
Capture at 360px mobile and a wide desktop viewport after logging into a disposable test account, with screenshots for every row above. Include long names, scroll bottom, keyboard-open, safe-area insets, selected calendar date, duplicate confirmation, invoiced lesson, zero-priced lesson, and monthly pricing. Compare against the conversation wireframes and document deviations without redesigning the approved layout.

## Known deviations from wireframe by source inspection
- Students PR #27 now shows active, paused and ended groups simultaneously, including during search; source integrated, browser parity pending.
- Lessons month heading and newest-first week grouping are source implemented since c94f5d7; browser spacing/typography and timezone behavior remain unaccepted. PR #34 proposes a timezone-safe week calculation.
- Shell PR #32 now uses a centered German invoices empty state; source integrated, browser parity pending.
- Lesson editing uses a detail view followed by an edit form rather than the single editable view with history shown in the reference.
- The provided wireframes contain English labels as design references; shipping copy must be German.

## Full export page-indexed acceptance reference (uploaded 22 November 2026)

The supplied PDF contains **12 pages**. These are approved *draft* layouts with English copy and dashed explanatory notes. Translate visible app copy to German, but **do not render the dashed draft notes**.

| PDF page | Screen | Specific behavior to preserve |
|---|---|---|
| 1 | Lessons tab | Current month, week groups newest first, floating log button, bottom tabs; scroll clearance |
| 2 | Students tab | Search across active/paused/ended; show all three status groups simultaneously, alphabetically ordered; floating add button |
| 3 | Student lesson list | Monthly groups, invoiced indicator, student-specific log button, Done; hide global tab bar |
| 4 | Student details | Basics, Lessons and price, Payer with independent Edit actions; price/payer history; Pause/End |
| 5 | New student | Basics, Lessons and price, Payer sections; optional short name, payer/contact fields |
| 6 | Edit lessons and price | Effective date shortcuts and explicit date; old logged lesson amounts unchanged; preview of upcoming price |
| 7 | Invoices placeholder | Centered empty state until E4, settings button and bottom tabs |
| 8 | Global new lesson | No student preselected; active students in independent scrolling picker, search for inactive; price/duration defaults based on selected date |
| 9 | Edit lesson | Student fixed, saved values persist when date changes; edit history on same screen; invoiced record read-only |
| 10 | Duplicate confirmation | Bottom sheet compares existing/new lesson; Cancel default; voided lessons excluded |
| 11 | Student-specific new lesson | Student fixed, no picker; save returns to student page with confirmation |
| 12 | Date picker | Monday-first bottom sheet; today outlined, selected filled, dots for existing lessons; selecting date updates defaults only in new-lesson mode |

**Newly unblocked reference availability:** visual-reference assets are supplied, so the previous 'wireframes unavailable' limitation no longer applies. **Still blocked:** there are no authenticated screenshots of the actual integrated application for a side-by-side comparison, so neither pixel parity nor interactive behavior has been verified. The HTML export is an additional reference, not evidence that the integrated application matches it.
