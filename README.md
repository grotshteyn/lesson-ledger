# Lesson Ledger · Epic E1

First deployed mobile-first German-language application for private teachers, built on GitHub Pages and a separate Supabase project in Frankfurt.

## Live application

https://grotshteyn.github.io/lesson-ledger/

## Implemented

- Passwordless email link and six-digit OTP only. Google OAuth is intentionally excluded from E1.
- Per-user private ledger and RLS-protected settings.
- Nine-step setup, including VAT mode and IBAN checksum.
- Per-account local browser draft recovery and setup completion.
- Home screen with missing billing details, Students and Invoices placeholders.
- Settings changes stored as append-only effective-dated records, optional phone, and sign-out.
- Sign-in email change request through Supabase Auth (requires appropriate email template/configuration).
- SQL tenant-isolation regression test in `tests/tenant-isolation.sql`.

## Infrastructure

Supabase project `zcszskoegwgcjgqsfmfx`. Only a **publishable** key is in the browser; never commit service-role or secret keys. The migrations `e1_ledger_and_settings` and `e1_settings_integrity_and_effective_date` are applied.

## Required Supabase configuration

1. Authentication → URL Configuration: site and redirect URL `https://grotshteyn.github.io/lesson-ledger/`.
2. Authentication → Providers: enable email OTP. Google OAuth is intentionally not required.
3. Configure German authentication email templates, token expiry of 15 minutes, and email request rate limits appropriate for the pilot.
4. Confirm Supabase session policy meets the desired 30-day inactivity rule; browser persistence alone does not enforce it.
5. Test sign-in email change, including old-address notification, against actual Supabase Auth settings.

## Testing

GitHub Actions validates JavaScript syntax and checks that obvious private Supabase key prefixes are not committed. Tenant isolation was manually exercised against the live database using a rolled-back SQL transaction. The SQL regression test is provided for future CI execution with a dedicated test database.

## Not yet production-complete

Email templates and authentication safeguards still need dashboard configuration and verification. Automatic identity linking, login throttling, 30-day inactivity, and multi-device sign-out need acceptance testing. Effective-dated settings selection is supported by the SQL function `ledger_settings_at`; actual invoice-based restrictions will be integrated when E4 exists. E2-E10 features are intentionally absent.

## E1 delivery notes (November 2026)

Google login is intentionally out of scope. The frontend includes a one-minute OTP resend cooldown, but this is only a user-interface guard, not a substitute for server-side Supabase rate limits. A 30-day inactivity check is implemented using local browser storage, but this does not enforce a cross-device session lifetime or invalidate an existing server-side session. Confirm and configure both in Supabase Auth before claiming full compliance. Future-dated settings are stored and become active on their effective date; issued-invoice restrictions are deferred to the invoice epic because invoices do not yet exist.

## E1–E3 integration branch status (22 November 2026)

**Development branch only; not deployed and not accepted.** Draft PR [#20](https://github.com/grotshteyn/lesson-ledger/pull/20) integrates source files from draft PRs #26 (shell), #27 (Students), #28 (Lessons), and #30 (backend). The deployed site and `main` are not evidence of this branch's behavior.

- Shared shell: German Stunden / Schüler / Rechnungen tabs, settings entry, invoices placeholder; shell routes to mounted feature modules. Student detail and lesson subpages hide the main tab bar.
- Students: isolated E2 list, create, details, section edit, effective-date pricing and lesson callbacks imported into the shell. The existing `change_student_with_repricing` signature has been checked against live database metadata; `p_reprice:false` does not replace logged lessons.
- Lessons: isolated E3 list, form, calendar and duplicate confirmation imported into the shell. Client now calls proposed `log_lesson_v2` and `replace_lesson_v2`. **These functions are absent from production**. The additive SQL migration is committed for isolated-database review only, including the zero-rate constraint adjustment.
- The older E1 and lesson UI remains in `app.js` as legacy code and requires further cleanup and parity verification.
- Original wireframes were supplied in the integration conversation. They are **not committed** to this repository. Side-by-side browser verification is still pending.

### Test status

Source integration and live schema inspection have been performed. Node unit tests, browser E2E and disposable Supabase migration/RLS tests **have not been executed by the integrator**. No test is reported as passing without execution. See `docs/e1-e3-integration-audit.md` and `docs/e1-e3-visual-comparison.md` for the acceptance matrix and remaining blockers.

### Safe local validation before review

Run `node --test tests/frontend-shell.test.mjs tests/students.test.mjs lessons/lessons.test.mjs`, syntax checks for `app.js`, `students/students.js` and `lessons/lessons.js`, and the SQL contract fixture in an isolated Supabase database. Apply `supabase/20261122_e3_compatible_lesson_rpcs.sql` **only to a disposable test project after review**. Then perform authenticated mobile and desktop browser checks. Do not deploy the migration or merge into `main` without explicit approval.
