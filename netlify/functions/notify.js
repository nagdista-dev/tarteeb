import webpush from 'web-push';
import { getSubscriptions, saveSubscriptions } from './utils/blob-store.js';

const PUBLIC_KEY = process.env.VITE_APP_VAPID_PUBLIC_KEY || '';
const PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';
const SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@tarteeb.app';

webpush.setVapidDetails(SUBJECT, PUBLIC_KEY, PRIVATE_KEY);

const PRAYER_NAMES = {
  fajr: 'Fajr',
  dhuhr: 'Dhuhr',
  asr: 'Asr',
  maghrib: 'Maghrib',
  isha: 'Isha',
};

function parseTimeToMinutes(timeStr) {
  if (!timeStr) return 0;
  const [h, m] = timeStr.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function getMinutesUntil(targetMinutes) {
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  let diff = targetMinutes - currentMinutes;
  if (diff < 0) diff += 24 * 60;
  return diff;
}

async function fetchPrayerTimes(city, country) {
  try {
    const today = new Date();
    const dateStr = `${today.getDate()}-${today.getMonth() + 1}-${today.getFullYear()}`;
    const url = `https://api.aladhan.com/v1/timingsByCity/${dateStr}?city=${encodeURIComponent(city)}&country=${encodeURIComponent(country)}&method=3`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.code === 200) {
      const timings = data.data.timings;
      return {
        fajr: timings.Fajr,
        dhuhr: timings.Dhuhr,
        asr: timings.Asr,
        maghrib: timings.Maghrib,
        isha: timings.Isha,
      };
    }
  } catch {
    // Fall through to default
  }
  return null;
}

const DEFAULT_TIMES = {
  fajr: '04:30',
  dhuhr: '12:30',
  asr: '15:45',
  maghrib: '19:00',
  isha: '20:30',
};

function getNotificationPayload(prayerKey, prayerTime) {
  return {
    title: `🕌 ${PRAYER_NAMES[prayerKey]} Prayer Time`,
    body: `It's time for ${PRAYER_NAMES[prayerKey]} prayer (${prayerTime})`,
    tag: `prayer-${prayerKey}-${new Date().toISOString().slice(0, 10)}`,
    url: '/',
    vibrate: [200, 100, 200],
  };
}

function checkNotificationTimes(prayerTimes, notifiedToday) {
  const notifications = [];
  const now = new Date();
  const todayKey = now.toISOString().slice(0, 10);

  for (const [key, timeStr] of Object.entries(prayerTimes)) {
    if (!timeStr) continue;
    const minutes = parseTimeToMinutes(timeStr);
    const minsUntil = getMinutesUntil(minutes);
    const notifKey = `${todayKey}-${key}`;

    if (minsUntil <= 5 && !notifiedToday.includes(notifKey)) {
      notifications.push({ key, time: timeStr, notifKey });
    }
  }

  return notifications;
}

export default async (req) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };

  try {
    if (req.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
      });
    }

    const authToken = req.headers.get('authorization') || '';
    const expectedToken = process.env.CRON_SECRET || '';

    if (expectedToken && authToken !== `Bearer ${expectedToken}`) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers });
    }

    let subscriptions = await getSubscriptions();
    if (!subscriptions || subscriptions.length === 0) {
      return new Response(JSON.stringify({ sent: 0, reason: 'No subscribers' }), { status: 200, headers });
    }

    const notifiedToday = [];
    const results = [];

    for (const sub of subscriptions) {
      const { subscription, location } = sub;
      const city = location?.city || 'Cairo';
      const country = location?.country || 'Egypt';

      const prayerTimes = await fetchPrayerTimes(city, country) || DEFAULT_TIMES;

      if (!prayerTimes) continue;

      const pending = checkNotificationTimes(prayerTimes, notifiedToday);

      for (const notif of pending) {
        try {
          const payload = getNotificationPayload(notif.key, notif.time);
          await webpush.sendNotification(subscription, JSON.stringify(payload));
          notifiedToday.push(notif.notifKey);
          results.push({ endpoint: subscription.endpoint.slice(0, 30), prayer: notif.key, status: 'sent' });
        } catch (err) {
          if (err.statusCode === 410 || err.statusCode === 404) {
            subscriptions = subscriptions.filter(
              (s) => s.subscription.endpoint !== subscription.endpoint
            );
          }
          results.push({ endpoint: subscription.endpoint.slice(0, 30), prayer: notif.key, status: 'failed', error: err.message });
        }
      }
    }

    await saveSubscriptions(subscriptions);

    return new Response(JSON.stringify({ sent: results.filter(r => r.status === 'sent').length, results }), { status: 200, headers });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers });
  }
};
