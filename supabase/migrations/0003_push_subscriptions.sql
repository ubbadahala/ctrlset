-- Push subscriptions: stores the browser-issued Web Push endpoint + keys
-- for each device a user has enabled Workout Reminders on. A user can have
-- multiple rows (e.g. phone + laptop both subscribed).
--
-- Referenced by: js/push.js (subscribeToPush/unsubscribeFromPush)
--
-- Note: the Edge Function that sends pushes using this table
-- (send-workout-reminders) is deployed and maintained outside this repo,
-- since its deployment involves VAPID secrets. This migration only covers
-- the schema the client and that function both depend on.

create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  unique (user_id, endpoint)
);

alter table push_subscriptions enable row level security;

drop policy if exists "Users manage their own push subscriptions" on push_subscriptions;
create policy "Users manage their own push subscriptions"
  on push_subscriptions
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
