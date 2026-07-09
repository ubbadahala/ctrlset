// ── WEB PUSH SUBSCRIPTION ──
// This is what lets Workout Reminders wake the app even when it's fully
// closed — unlike the plain Notification API (used as a same-tab fallback
// elsewhere), a Push subscription is delivered by the browser vendor's own
// push service, triggered by a server-side send (see
// supabase/functions/send-workout-reminders).

// Public VAPID key — safe to expose client-side (this is the whole point of
// the public half of a VAPID key pair). The matching private key lives only
// in the Edge Function's secrets, never in this repo.
const VAPID_PUBLIC_KEY = 'BPTyVkF-DSv-nRAbDztRjBVsOWYXznRaW-_JvEoKh1hRaQS2U1ptSdwYYXaF4yyhOrl4s8DRQ9wgXTgxRRFM4O4';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

async function subscribeToPush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    toast("This browser doesn't support push notifications.");
    return false;
  }
  if (!currentUser) return false;

  try {
    const registration = await navigator.serviceWorker.ready;

    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
      });
    }

    const json = subscription.toJSON();
    const { error } = await supabaseClient.from('push_subscriptions').upsert({
      user_id: currentUser.id,
      endpoint: json.endpoint,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth
    }, { onConflict: 'user_id, endpoint' });

    if (error) throw error;
    return true;
  } catch (err) {
    console.error('Push subscription failed:', err);
    toast('Could not enable push notifications.');
    return false;
  }
}

async function unsubscribeFromPush() {
  if (!('serviceWorker' in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return;

    const endpoint = subscription.endpoint;
    await subscription.unsubscribe();

    if (currentUser) {
      await supabaseClient.from('push_subscriptions')
        .delete()
        .match({ user_id: currentUser.id, endpoint });
    }
  } catch (err) {
    console.error('Push unsubscribe failed:', err);
  }
}
