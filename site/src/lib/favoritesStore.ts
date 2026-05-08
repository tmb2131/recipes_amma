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
 * - When neither set is configured **and** we're on a writable local dev
 *   machine, we fall back to a JSON file at `site/.favorites-dev.json`
 *   (gitignored). This is never used on Vercel (read-only filesystem) or in
 *   `NODE_ENV=production` unless `FAVORITES_USE_LOCAL_FILE=1` (e.g. local
 *   `astro preview` without Redis).
 *
 * The store is intentionally tiny and dependency-light: only `@upstash/redis`
 * (which uses fetch) is imported, and only when cloud creds are present.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const KEY = 'ammas-favorites:v1';

export class FavoritesStorageUnavailableError extends Error {
  constructor() {
    super(
      'Favorites storage is not configured. Set Upstash/Vercel env vars: UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN, or KV_REST_API_URL + KV_REST_API_TOKEN, or the Vercel Storage quickstart names (e.g. UPSTASH_REDIS_REST_REDIS_URL + UPSTASH_REDIS_REST_KV_REST_API_TOKEN).',
    );
    this.name = 'FavoritesStorageUnavailableError';
  }
}

/** Writable JSON file fallback — never on Vercel or production except when opted in. */
function allowLocalFileStore(): boolean {
  if (process.env.VERCEL) return false;
  if (process.env.NODE_ENV === 'production') {
    return process.env.FAVORITES_USE_LOCAL_FILE === '1';
  }
  return true;
}

type RedisLike = {
  smembers: (key: string) => Promise<string[]>;
  sadd: (key: string, ...members: string[]) => Promise<number>;
  srem: (key: string, ...members: string[]) => Promise<number>;
  sismember: (key: string, member: string) => Promise<0 | 1>;
};

let cachedRedis: RedisLike | null | undefined;

function firstEnv(...keys: string[]): string {
  for (const k of keys) {
    const v = process.env[k];
    if (v && v.trim()) return v.trim();
  }
  return '';
}

function readCreds(): { url: string; token: string } | null {
  // Standard Upstash: UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN.
  // Vercel KV marketplace: KV_REST_API_*.
  // Vercel "Storage" linked Upstash DB often injects longer names (see Upstash quickstart in dashboard).
  const url = firstEnv(
    'UPSTASH_REDIS_REST_URL',
    'KV_REST_API_URL',
    'UPSTASH_REDIS_REST_REDIS_URL',
    'UPSTASH_REDIS_REST_KV_REST_API_URL',
    'UPSTASH_REDIS_REST_KV_URL',
  );
  // Use a read-write token only (not *READ_ONLY*).
  const token = firstEnv(
    'UPSTASH_REDIS_REST_TOKEN',
    'KV_REST_API_TOKEN',
    'UPSTASH_REDIS_REST_KV_REST_API_TOKEN',
  );
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

export type StorageBackend = 'redis' | 'file' | 'none';

export async function getBackend(): Promise<StorageBackend> {
  if (await getRedis()) return 'redis';
  if (allowLocalFileStore()) return 'file';
  return 'none';
}

export async function listFavorites(): Promise<string[]> {
  const redis = await getRedis();
  if (redis) {
    const slugs = await redis.smembers(KEY);
    return slugs.sort();
  }
  if (!allowLocalFileStore()) return [];
  return [...readDevFile()].sort();
}

export async function isFavorite(slug: string): Promise<boolean> {
  const redis = await getRedis();
  if (redis) {
    return (await redis.sismember(KEY, slug)) === 1;
  }
  if (!allowLocalFileStore()) return false;
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
  if (!allowLocalFileStore()) {
    throw new FavoritesStorageUnavailableError();
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
  if (!allowLocalFileStore()) {
    throw new FavoritesStorageUnavailableError();
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
