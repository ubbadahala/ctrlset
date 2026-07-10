# Database Migrations

Dated/numbered SQL files tracking schema changes applied to the Supabase project, in order. These are **not auto-applied** — run each one manually (Supabase SQL editor, or `supabase db push` if linked via the CLI) against your project when adopting the corresponding app version.

This folder intentionally does **not** include the original v4.0 base schema (`workouts`, `workout_sets`, `recovery_logs`, `rest_days`, `exercises`, `user_settings`, RLS policies, the `auth.users` mirror trigger) — that predates this tracked folder and lives only in the live database. Everything from `0001` onward is tracked here going forward.

| File | Adds | Used by |
|---|---|---|
| `0001_rest_type.sql` | `rest_days.rest_type` | Active/Complete rest day logging |
| `0002_reminder_settings.sql` | `user_settings.training_days`, `user_settings.reminders_enabled` | Workout Reminders settings |
| `0003_push_subscriptions.sql` | `push_subscriptions` table + RLS | Web Push subscriptions |
| `0004_exercise_injury_notes.sql` | `exercises.injury_note` | Injury flag warnings when logging |

Note: the Edge Function that actually sends push notifications (`send-workout-reminders`) and its VAPID secrets are deployed and managed outside this repo, since checking in an Edge Function alongside its secrets risks leaking them into version control.
