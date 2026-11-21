# Lesson Ledger · Epic E1

First deployed mobile-first German-language application for private teachers, built on GitHub Pages and a separate Supabase project in Frankfurt.

## Live application

https://grotshteyn.github.io/lesson-ledger/

## Implemented

- Passwordless email link and six-digit OTP, with optional Google OAuth button (Google provider must be configured in Supabase).
- Per-user private ledger and RLS-protected settings.
- Nine-step setup, including VAT mode and IBAN checksum.
- Browser session draft recovery and setup completion.
- Home screen with missing billing details, Students and Invoices placeholders.
- Settings changes stored as append-only effective-dated records, optional phone, and sign-out.
- Sign-in email change request through Supabase Auth (requires appropriate email template/configuration).
- SQL tenant-isolation regression test in `tests/tenant-isolation.sql`.

## Infrastructure

Supabase project `zcszskoegwgcjgqsfmfx`. Only a **publishable** key is in the browser; never commit service-role or secret keys. The migrations `e1_ledger_and_settings` and `e1_settings_integrity_and_effective_date` are applied.

## Required Supabase configuration

1. Authentication → URL Configuration: site and redirect URL `https://grotshteyn.github.io/lesson-ledger/`.
2. Authentication → Providers: enable email OTP. Configure Google OAuth client credentials to enable Google sign-in.
3. Configure German authentication email templates, token expiry of 15 minutes, and email request rate limits appropriate for the pilot.
4. Confirm Supabase session policy meets the desired 30-day inactivity rule; browser persistence alone does not enforce it.
5. Test sign-in email change, including old-address notification, against actual Supabase Auth settings.

## Testing

GitHub Actions validates JavaScript syntax and checks that obvious private Supabase key prefixes are not committed. Tenant isolation was manually exercised against the live database using a rolled-back SQL transaction. The SQL regression test is provided for future CI execution with a dedicated test database.

## Not yet production-complete

The Google provider and mail templates need dashboard configuration. Automatic identity linking, login throttling, 30-day inactivity, and multi-device sign-out need acceptance testing. Effective-dated settings selection is supported by the SQL function `ledger_settings_at`; actual invoice-based restrictions will be integrated when E4 exists. E2-E10 features are intentionally absent.
