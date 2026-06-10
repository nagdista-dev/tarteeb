import { getSubscriptions, saveSubscriptions } from './utils/blob-store.js';

export default async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  const headers = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };

  try {
    const body = await req.json();

    if (req.method === 'POST') {
      const subscription = body.subscription;
      const location = body.location || {};

      if (!subscription || !subscription.endpoint) {
        return new Response(JSON.stringify({ error: 'Invalid subscription' }), { status: 400, headers });
      }

      let subs = await getSubscriptions();

      const existing = subs.findIndex(
        (s) => s.subscription.endpoint === subscription.endpoint
      );

      const entry = {
        subscription,
        location,
        createdAt: new Date().toISOString(),
        userAgent: req.headers.get('user-agent') || '',
      };

      if (existing >= 0) {
        subs[existing] = entry;
      } else {
        subs.push(entry);
      }

      await saveSubscriptions(subs);

      return new Response(JSON.stringify({ success: true, total: subs.length }), { status: 200, headers });
    }

    if (req.method === 'DELETE') {
      const endpoint = body.endpoint;

      if (!endpoint) {
        return new Response(JSON.stringify({ error: 'Missing endpoint' }), { status: 400, headers });
      }

      let subs = await getSubscriptions();
      subs = subs.filter((s) => s.subscription.endpoint !== endpoint);
      await saveSubscriptions(subs);

      return new Response(JSON.stringify({ success: true, total: subs.length }), { status: 200, headers });
    }

    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers });
  }
};
