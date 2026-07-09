// supabase/functions/send-workout-reminders/index.ts
//
// Deploy with: supabase functions deploy send-workout-reminders
// Trigger on a schedule (see README "Manual Setup Required" for the
// pg_cron SQL) — this function does not schedule itself.
//
// What it does, each time it's invoked:
//   1. Finds every user with reminders_enabled = '1' in user_settings.
//   2. Of those, keeps only users whose training_days includes today's
//      day-of-week (0=Sun..6=Sat, computed in UTC — see the timezone
//      note in the README).
//   3. Drops any of those users who already have a workout logged for
//      today's date.
//   4. Sends a Web Push notification to every subscription on file for
//      each remaining user, using the VAPID keys in this function's secrets.
//   5. Removes any subscription the push service reports as gone (410/404),
//      so dead subscriptions don't pile up.

import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!;
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") || "mailto:admin@example.com";

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function todayUtcDateString(): string {
  return new Date().toISOString().split("T")[0]; // 'YYYY-MM-DD'
}

Deno.serve(async () => {
  const todayStr = todayUtcDateString();
  const todayDow = new Date().getUTCDay(); // 0=Sun..6=Sat

  // 1. Users with reminders enabled
  const { data: settingsRows, error: settingsErr } = await supabase
    .from("user_settings")
    .select("user_id, training_days")
    .eq("reminders_enabled", "1");

  if (settingsErr) {
    return new Response(JSON.stringify({ error: settingsErr.message }), { status: 500 });
  }

  // 2. Keep only users whose training_days includes today
  const dueUserIds = (settingsRows || [])
    .filter(row => (row.training_days || "").split(",").filter(Boolean).map(Number).includes(todayDow))
    .map(row => row.user_id);

  if (!dueUserIds.length) {
    return new Response(JSON.stringify({ sent: 0, reason: "no users due today" }), { status: 200 });
  }

  // 3. Drop users who already logged a workout today
  const { data: loggedToday } = await supabase
    .from("workouts")
    .select("user_id")
    .eq("workout_date", todayStr)
    .in("user_id", dueUserIds);

  const alreadyLogged = new Set((loggedToday || []).map(w => w.user_id));
  const usersToNotify = dueUserIds.filter(id => !alreadyLogged.has(id));

  if (!usersToNotify.length) {
    return new Response(JSON.stringify({ sent: 0, reason: "all due users already logged today" }), { status: 200 });
  }

  // 4. Fetch subscriptions for the remaining users
  const { data: subscriptions, error: subErr } = await supabase
    .from("push_subscriptions")
    .select("id, user_id, endpoint, p256dh, auth")
    .in("user_id", usersToNotify);

  if (subErr) {
    return new Response(JSON.stringify({ error: subErr.message }), { status: 500 });
  }

  const payload = JSON.stringify({
    title: "Time to train 💪",
    body: "It's one of your usual training days — log today's workout on CtrlSet."
  });

  let sent = 0;
  const staleSubscriptionIds: string[] = [];

  await Promise.all((subscriptions || []).map(async (sub) => {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload
      );
      sent++;
    } catch (err) {
      // 404/410 means the browser/OS push service says this subscription
      // is gone for good (uninstalled, permission revoked, etc.) — clean it up.
      const statusCode = err?.statusCode || err?.status;
      if (statusCode === 404 || statusCode === 410) {
        staleSubscriptionIds.push(sub.id);
      } else {
        console.error(`Push failed for subscription ${sub.id}:`, err);
      }
    }
  }));

  if (staleSubscriptionIds.length) {
    await supabase.from("push_subscriptions").delete().in("id", staleSubscriptionIds);
  }

  return new Response(JSON.stringify({
    sent,
    usersDue: usersToNotify.length,
    staleRemoved: staleSubscriptionIds.length
  }), { status: 200 });
});
