const SUBSCRIPTIONS_KEY = 'push_subscriptions';

export async function getSubscriptions() {
  try {
    const blob = process.env.NETLIFY_BLOB
      ? await process.env.NETLIFY_BLOB.get(SUBSCRIPTIONS_KEY)
      : null;
    if (!blob) return [];
    const data = await blob.text();
    return JSON.parse(data);
  } catch {
    return [];
  }
}

export async function saveSubscriptions(subscriptions) {
  try {
    if (process.env.NETLIFY_BLOB) {
      await process.env.NETLIFY_BLOB.set(
        SUBSCRIPTIONS_KEY,
        JSON.stringify(subscriptions)
      );
    }
  } catch {
    // Blob store unavailable
  }
}
