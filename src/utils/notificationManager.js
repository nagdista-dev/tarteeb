const API_BASE = '/.netlify/functions';

function getVapidPublicKey() {
  return import.meta.env.VITE_APP_VAPID_PUBLIC_KEY || '';
}

export async function requestPermission() {
  if (typeof Notification === 'undefined') return 'unsupported';
  const result = await Notification.requestPermission();
  localStorage.setItem('tarteeb_notif_permission', result);
  return result;
}

export function getPermission() {
  if (typeof Notification === 'undefined') return 'unsupported';
  return Notification.permission;
}

export async function getExistingSubscription() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return null;
  }
  try {
    const registration = await navigator.serviceWorker.ready;
    return await registration.pushManager.getSubscription();
  } catch {
    return null;
  }
}

export async function subscribeToPush(location = {}) {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return { success: false, error: 'Push not supported' };
  }

  const vapidKey = getVapidPublicKey();
  if (!vapidKey) {
    return { success: false, error: 'VAPID key not configured' };
  }

  try {
    const registration = await navigator.serviceWorker.ready;

    const existingSubscription = await registration.pushManager.getSubscription();
    if (existingSubscription) {
      await sendSubscriptionToServer(existingSubscription, location);
      return { success: true, subscription: existingSubscription };
    }

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: vapidKey,
    });

    await sendSubscriptionToServer(subscription, location);
    return { success: true, subscription };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function unsubscribeFromPush() {
  if (!('serviceWorker' in navigator)) {
    return { success: false, error: 'Service worker not supported' };
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();

    if (subscription) {
      const endpoint = subscription.endpoint;
      await subscription.unsubscribe();
      await removeSubscriptionFromServer(endpoint);
    }

    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function sendSubscriptionToServer(subscription, location = {}) {
  try {
    const response = await fetch(`${API_BASE}/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subscription: subscription.toJSON(),
        location,
      }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function removeSubscriptionFromServer(endpoint) {
  try {
    const response = await fetch(`${API_BASE}/subscribe`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function isPushSupported() {
  return (
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    !!getVapidPublicKey()
  );
}
