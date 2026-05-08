/**
 * Shared favorites store.
 *
 * Single source of truth for which recipe slugs belong to "Amma's Favorites".
 * Used by `GET /api/favorites`, `POST /api/favorites/toggle`, and the
 * one-shot `scripts/seed-favorites.mjs`.
 *
 * Storage strategy:
 * - In production / preview deploys with `UPSTASH_REDIS_REST_URL` and
 *   `UPSTASH_REDIS_REST_TOKEN` (or `KV_REST_API_URL` / `KV_REST_API_TOKEN`
 *   from a Vercel marketplace Redis integration) we use Upstash Redis as
 *   the source of truth. Slugs are held in a single Redis Set under
 *   `KEY`.
 * - When neither set is configured (e.g. `astro dev` on a fresh clone) we
 *   transparently fall back to a JSON file at `site/.favorites-dev.json`.
 *   The file is gitignored; restarting the dev server preserves the state.
 *
 * The store is intentionally tiny and dependency-light: only `@upstash/redis`
 * (which uses fetch) is imported, and only when cloud creds are present.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const KEY = 'ammas-favorites:v1';

type RedisLike = {
  smembers: (key: string) => Promise<string[]>;
  sadd: (key: string, ...members: string[]) => Promise<number>;
  srem: (key: string, ...members: string[]) => Promise<number>;
  sismember: (key: string, member: string) => Promise<0 | 1>;
};

let cachedRedis: RedisLike | null | undefined;

function readCreds(): { url: string; token: string } | null {
  // Vercel's marketplace Redis integration injects KV_*; Upstash's direct
  // Vercel integration injects UPSTASH_REDIS_REST_*. We accept either.
  const url =
    process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL ?? '';
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN ?? '';
  if (!url || !token) return null;
  return { url, token };
}

async function getRedis(): Promise<RedisLike | null> {
  if (cachedRedis !== undefined) return cachedRedis;
  const creds = readCreds();
  if (!creds) {
    cachedRedis = null;
    return null;
  }
  const mod = await import('@upstash/redis');
  cachedRedis = new mod.Redis({ url: creds.url, token: creds.token }) as unknown as RedisLike;
  return cachedRedis;
}

function devFilePath(): string {
  // src/lib/favoritesStore.ts -> ../../ (site root) -> .favorites-dev.json
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, '..', '..', '.favorites-dev.json');
}

function readDevFile(): Set<string> {
  try {
    const raw = fs.readFileSync(devFilePath(), 'utf8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return new Set(parsed.filter((s) => typeof s === 'string'));
  } catch {
    /* missing or unreadable — treat as empty */
  }
  return new Set();
}

function writeDevFile(set: Set<string>): void {
  const data = JSON.stringify([...set].sort(), null, 2) + '\n';
  fs.writeFileSync(devFilePath(), data, 'utf8');
}

export type StorageBackend = 'redis' | 'file';

export async function getBackend(): Promise<StorageBackend> {
  return (await getRedis()) ? 'redis' : 'file';
}

export async function listFavorites(): Promise<string[]> {
  const redis = await getRedis();
  if (redis) {
    const slugs = await redis.smembers(KEY);
    return slugs.sort();
  }
  return [...readDevFile()].sort();
}

export async function isFavorite(slug: string): Promise<boolean> {
  const redis = await getRedis();
  if (redis) {
    return (await redis.sismember(KEY, slug)) === 1;
  }
  return readDevFile().has(slug);
}

/** Toggle membership; returns the new state for the slug. */
export async function toggleFavorite(slug: string): Promise<boolean> {
  const redis = await getRedis();
  if (redis) {
    if ((await redis.sismember(KEY, slug)) === 1) {
      await redis.srem(KEY, slug);
      return false;
    }
    await redis.sadd(KEY, slug);
    return true;
  }
  const set = readDevFile();
  if (set.has(slug)) {
    set.delete(slug);
    writeDevFile(set);
    return false;
  }
  set.add(slug);
  writeDevFile(set);
  return true;
}

/** Bulk insert (idempotent). Used by the seed script. */
export async function addFavorites(slugs: string[]): Promise<number> {
  if (slugs.length === 0) return 0;
  const redis = await getRedis();
  if (redis) {
    return await redis.sadd(KEY, ...slugs);
  }
  const set = readDevFile();
  let added = 0;
  for (const s of slugs) {
    if (!set.has(s)) {
      set.add(s);
      added++;
    }
  }
  if (added > 0) writeDevFile(set);
  return added;
}
