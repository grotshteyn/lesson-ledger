# E1–E3 visual comparison (22 November 2026)

## Reference availability
**Original wireframes are now supplied in the integration conversation (12 mobile screenshots).** They are available to the reviewer in that conversation, but are not stored in the repository. No authenticated screenshots of the integrated frontend have been captured. Therefore **pixel/behavioral parity is NOT VERIFIED**. Dashed annotation panels in the wireframes are explanatory and must not appear in the application.

## Source-to-reference checklist (not a visual pass)

| Approved screen | Wireframe requirement | Current source observation | Verification |
|---|---|---|---|
| Lessons tab | Month then week groups, newest first, fixed black action, three equal tabs | Lessons module groups by week and renders floating action; shell has tabs | Pending browser; month hierarchy differs |
| Students tab | Search, grouped active/paused/ended rows, right-aligned price, black floating action | Students module includes search/status filters and floating action | Pending; filters differ from grouped wireframe |
| Invoices tab | Centered German coming-soon message, settings gear, three tabs | German placeholder in shell, but inside generic card | Pending; layout differs |
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
- Students list currently exposes filter pills instead of showing the three status groups simultaneously.
- Lessons list shows week headings without the wireframe's separate month heading.
- Invoices placeholder uses a generic card rather than a vertically centered empty state.
- Lesson editing uses a detail view followed by an edit form rather than the single editable view with history shown in the reference.
- The provided wireframes contain English labels as design references; shipping copy must be German.
