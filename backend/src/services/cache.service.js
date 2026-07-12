const DEFAULT_TTL_MS = 5 * 60 * 1000;
const memoryCache = new Map();

let redisClientPromise;

async function getRedisClient() {
  if (!process.env.REDIS_URL) return null;
  if (!redisClientPromise) {
    redisClientPromise = import("redis")
      .then(async ({ createClient }) => {
        const client = createClient({ url: process.env.REDIS_URL });
        client.on("error", (error) => {
          console.warn(`[Cache] Redis error; using memory fallback: ${error.message}`);
        });
        await client.connect();
        return client;
      })
      .catch((error) => {
        console.warn(`[Cache] Redis unavailable; using memory fallback: ${error.message}`);
        return null;
      });
  }
  return redisClientPromise;
}

export async function getCacheValue(key) {
  const redis = await getRedisClient();
  if (redis?.isReady) {
    const value = await redis.get(key);
    return value === null ? null : JSON.parse(value);
  }
  const cached = memoryCache.get(key);
  if (!cached || cached.expiresAt <= Date.now()) {
    memoryCache.delete(key);
    return null;
  }
  return cached.value;
}

export async function setCacheValue(key, value, ttlMs = DEFAULT_TTL_MS) {
  const redis = await getRedisClient();
  if (redis?.isReady) {
    await redis.set(key, JSON.stringify(value), { PX: ttlMs });
  } else {
    memoryCache.set(key, { value, expiresAt: Date.now() + ttlMs });
  }
  return value;
}

export function clearMemoryCache() {
  memoryCache.clear();
}
