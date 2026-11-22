# Frontend shell handoff (issue #21)

## Scope and story coverage
| Story | Behavior | Status |
| --- | --- | --- |
| ON-9 | German Stunden / Schüler / Rechnungen tabs; settings gear; dashboard removed from authenticated entry | Implemented |
| LE-7 | Lessons tab loads existing grouped lesson rows | Existing behavior retained |
| ST-3 | Students tab retains existing search and status filters | Existing behavior retained |
| IN-1 | Non-operational German invoices placeholder | Implemented |
| LE-1 | Floating action offers lesson entry via student selection | Partial: navigates to students list, pending Lessons agent integration |
| ST-1 | Floating action opens existing student form | Existing behavior retained |

## Module contract
`frontend/shell.js` exports `TAB_LABELS`, `SHELL_EVENTS`, `shellMarkup({tab,title,content,actionLabel})`, and `bindShell(root,{navigate,settings,create})`.
`tab` is one of `lessons`, `students`, `invoices`. `content` is trusted application-produced HTML (escape user values before interpolating). `navigate(key)` receives the selected tab. `settings()` and `create()` are callback functions. No Supabase client or database access is owned by the shell. The event-name constants are reserved for future integration; current implementation uses direct callbacks.

Shell styling is scoped to `.ll-*` selectors in `style.css`. The only shared `app.js` changes are wiring authenticated entry, tab rendering and legacy back navigation. Feature agents should continue building isolated modules and ask the integrator to wire their entry points, rather than editing `app.js` concurrently.

## Tests and verification
Added `tests/frontend-shell.test.mjs` (run with `node --test tests/frontend-shell.test.mjs`). Tests cover German labels, three tabs, active state, settings access, optional floating action and invalid tab rejection.
**Not executed in this connector session:** Node tests, browser rendering, 360px and wide viewport screenshots, keyboard/safe-area tests, Supabase integration and end-to-end regression. No browser or local repository execution was available in this session.

## Risks and next actions
- Lesson creation currently routes to the Students list; Lessons agent must provide a dedicated new-lesson entry callback.
- Existing student and lesson subpages remain on legacy styles until their owning agents integrate them.
- Shell event constants document names but are not dispatched as DOM CustomEvents; callbacks are authoritative.
- No RPC changes, migrations or rollback steps. Revert the shell commits if the integration fails.
- No screenshots available; do not claim wireframe visual fidelity without browser verification.
