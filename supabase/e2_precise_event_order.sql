-- Each append in one transaction needs distinct timestamps for as-of ordering.
alter table public.student_versions alter column created_at set default clock_timestamp();
alter table public.student_status_events alter column created_at set default clock_timestamp();
