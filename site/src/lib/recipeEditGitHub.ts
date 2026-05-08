/**
 * Push recipe markdown changes to GitHub via the Contents API.
 *
 * Env (optional — when unset, saves stay local-only):
 * - `GITHUB_TOKEN` — classic PAT with `repo`, or fine-grained token with
 *   Contents read/write on the target repo.
 * - `GITHUB_REPO` — `owner/name` (e.g. `acme/recipes`).
 * - `GITHUB_BRANCH` — optional branch to read/write (default: see `getGithubBranchRef`).
 *
 * Branch resolution (first match wins):
 * 1. `GITHUB_BRANCH`
 * 2. `VERCEL_GIT_COMMIT_REF` (Vercel: the branch this deployment was built from — keeps saves on the same branch the site uses)
 * 3. `GITHUB_REF` with `refs/heads/…` stripped
 * 4. GitHub API `default_branch` for `GITHUB_REPO`
 * 5. `main`
 */

import path from 'node:path';

const GH_API = 'https://api.github.com';

function encodePathForUrl(repoPath: string): string {
  return repoPath
    .split('/')
    .map((seg) => encodeURIComponent(seg))
    .join('/');
}

export function isGitHubRecipeSyncEnabled(): boolean {
  const t = process.env.GITHUB_TOKEN?.trim();
  const r = process.env.GITHUB_REPO?.trim();
  return !!(t && r);
}

/**
 * True on Vercel's hosted runtime (preview or production).
 * `vercel dev` also sets `VERCEL=1`, but sets `VERCEL_ENV=development` — there the
 * real recipe tree on disk is writable, so we must not force GitHub-only mode.
 */
export function isVercelCloudRuntime(): boolean {
  return Boolean(process.env.VERCEL) && process.env.VERCEL_ENV !== 'development';
}

/** @deprecated Use `isVercelCloudRuntime()` for edit/save gating. */
export function isVercelDeployment(): boolean {
  return Boolean(process.env.VERCEL);
}

/** Skip `fs` writes for recipes: use GitHub API only (required on Vercel cloud when sync is on). */
export function shouldSkipLocalRecipeWrites(): boolean {
  return isVercelCloudRuntime() && isGitHubRecipeSyncEnabled();
}

/** On Vercel cloud without GitHub env, recipe files cannot be edited via this API. */
export function vercelRecipeEditRequiresGitHub(): boolean {
  return isVercelCloudRuntime() && !isGitHubRecipeSyncEnabled();
}

export function parseGitHubRepo(): { owner: string; repo: string } | null {
  let raw = process.env.GITHUB_REPO?.trim();
  if (!raw) return null;
  raw = raw.replace(/\.git$/i, '').replace(/\/+$/, '');

  // Accept "https://github.com/owner/repo" or "github.com/owner/repo"
  const fromUrl = raw.match(/github\.com[/:]([^/]+)\/([^/]+)$/i);
  if (fromUrl) {
    return { owner: fromUrl[1], repo: fromUrl[2] };
  }

  const i = raw.indexOf('/');
  if (i <= 0 || i === raw.length - 1) return null;
  return { owner: raw.slice(0, i), repo: raw.slice(i + 1) };
}

async function ghFetch(repoPath: string, init: RequestInit): Promise<Response> {
  const token = process.env.GITHUB_TOKEN?.trim();
  if (!token) throw new Error('GITHUB_TOKEN is not set');
  const url = `${GH_API}${repoPath.startsWith('/') ? '' : '/'}${repoPath}`;
  return fetch(url, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'ammas-kitchen-recipe-edit',
      ...(init.headers as Record<string, string>),
    },
  });
}

let githubBranchRefCache: string | null = null;

function githubBranchFromEnv(): string | null {
  const explicit = process.env.GITHUB_BRANCH?.trim();
  if (explicit) return explicit;
  const vercelRef = process.env.VERCEL_GIT_COMMIT_REF?.trim();
  if (vercelRef) return vercelRef;
  const ghRef = process.env.GITHUB_REF?.trim();
  if (ghRef) return ghRef.replace(/^refs\/heads\//i, '');
  return null;
}

/**
 * Git branch used for Contents API reads/writes. Cached per serverless instance.
 */
export async function getGithubBranchRef(): Promise<string> {
  if (githubBranchRefCache) return githubBranchRefCache;
  const fromEnv = githubBranchFromEnv();
  if (fromEnv) {
    githubBranchRefCache = fromEnv;
    return fromEnv;
  }
  const gh = parseGitHubRepo();
  if (!gh) {
    githubBranchRefCache = 'main';
    return 'main';
  }
  try {
    const res = await ghFetch(`/repos/${gh.owner}/${gh.repo}`, { method: 'GET' });
    if (res.ok) {
      const data = (await res.json()) as { default_branch?: string };
      if (data.default_branch && typeof data.default_branch === 'string') {
        githubBranchRefCache = data.default_branch;
        return githubBranchRefCache;
      }
    }
  } catch {
    /* use fallback */
  }
  githubBranchRefCache = 'main';
  return githubBranchRefCache;
}

/** Latest blob SHA for a file on the resolved GitHub branch, or `null` if missing / is a directory listing. */
export async function getFileShaOnMain(
  owner: string,
  repo: string,
  filePath: string,
): Promise<string | null> {
  const ref = await getGithubBranchRef();
  const enc = encodePathForUrl(filePath);
  const res = await ghFetch(
    `/repos/${owner}/${repo}/contents/${enc}?ref=${encodeURIComponent(ref)}`,
    {
      method: 'GET',
    },
  );
  if (res.status === 404) return null;
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`GitHub GET ${filePath}: ${res.status} ${text.slice(0, 500)}`);
  }
  let data: unknown;
  try {
    data = JSON.parse(text) as unknown;
  } catch {
    throw new Error(`GitHub GET ${filePath}: non-JSON response (${text.slice(0, 200)})`);
  }
  if (Array.isArray(data)) return null;
  if (!data || typeof data !== 'object') return null;
  const o = data as { sha?: string; type?: string };
  if (o.type !== 'file' || !o.sha) return null;
  return o.sha;
}

/** UTF-8 file body from the resolved GitHub branch, or `null` if missing. */
export async function getFileContentFromMain(
  owner: string,
  repo: string,
  filePath: string,
): Promise<string | null> {
  const ref = await getGithubBranchRef();
  const enc = encodePathForUrl(filePath);
  const res = await ghFetch(
    `/repos/${owner}/${repo}/contents/${enc}?ref=${encodeURIComponent(ref)}`,
    {
      method: 'GET',
    },
  );
  if (res.status === 404) return null;
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`GitHub GET content ${filePath}: ${res.status} ${text.slice(0, 500)}`);
  }
  let data: unknown;
  try {
    data = JSON.parse(text) as unknown;
  } catch {
    throw new Error(`GitHub GET content ${filePath}: non-JSON (${text.slice(0, 200)})`);
  }
  if (Array.isArray(data)) return null;
  if (!data || typeof data !== 'object') return null;
  const o = data as { type?: string; encoding?: string; content?: string };
  if (o.type !== 'file' || typeof o.content !== 'string') {
    return null;
  }
  if (o.encoding && o.encoding !== 'base64') {
    return null;
  }
  const b64 = o.content.replace(/\s/g, '');
  try {
    return Buffer.from(b64, 'base64').toString('utf8');
  } catch {
    return null;
  }
}

export async function putFileOnMain(
  owner: string,
  repo: string,
  filePath: string,
  contentUtf8: string,
  message: string,
): Promise<void> {
  const ref = await getGithubBranchRef();
  const enc = encodePathForUrl(filePath);
  const b64 = Buffer.from(contentUtf8, 'utf8').toString('base64');

  for (let attempt = 0; attempt < 2; attempt++) {
    const sha = await getFileShaOnMain(owner, repo, filePath);
    const body: Record<string, string> = {
      message,
      content: b64,
      branch: ref,
    };
    if (sha) body.sha = sha;

    const res = await ghFetch(`/repos/${owner}/${repo}/contents/${enc}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const errText = await res.text();
    if (res.ok) return;
    if (res.status === 409 && attempt === 0) continue;
    throw new Error(`GitHub PUT ${filePath}: ${res.status} ${errText.slice(0, 500)}`);
  }
}

export async function deleteFileOnMain(
  owner: string,
  repo: string,
  filePath: string,
  message: string,
): Promise<void> {
  const ref = await getGithubBranchRef();
  const sha = await getFileShaOnMain(owner, repo, filePath);
  if (!sha) return;

  const enc = encodePathForUrl(filePath);
  const res = await ghFetch(`/repos/${owner}/${repo}/contents/${enc}`, {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ message, sha, branch: ref }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`GitHub DELETE ${filePath}: ${res.status} ${t.slice(0, 500)}`);
  }
}

/** Normalize repo-relative path for GitHub (always `/`). */
export function toGitHubPath(repoRoot: string, absolutePath: string): string {
  return path.relative(repoRoot, absolutePath).split(path.sep).join('/');
}

export async function syncSaveToGitHubMain(args: {
  repoRoot: string;
  sourceAbsolutePath: string;
  targetAbsolutePath: string;
  content: string;
  renamed: boolean;
}): Promise<void> {
  const gh = parseGitHubRepo();
  if (!gh) throw new Error('GITHUB_REPO must be owner/name');

  const oldRel = toGitHubPath(args.repoRoot, args.sourceAbsolutePath);
  const newRel = toGitHubPath(args.repoRoot, args.targetAbsolutePath);

  if (args.renamed && oldRel !== newRel) {
    await deleteFileOnMain(gh.owner, gh.repo, oldRel, `Recipe editor: remove ${oldRel} (renamed)`);
    await putFileOnMain(
      gh.owner,
      gh.repo,
      newRel,
      args.content,
      `Recipe editor: rename ${oldRel} → ${newRel}`,
    );
  } else {
    await putFileOnMain(gh.owner, gh.repo, newRel, args.content, `Recipe editor: update ${newRel}`);
  }
}

export async function syncDeleteToGitHubMain(repoRoot: string, absolutePath: string): Promise<void> {
  const gh = parseGitHubRepo();
  if (!gh) throw new Error('GITHUB_REPO must be owner/name');
  const rel = toGitHubPath(repoRoot, absolutePath);
  await deleteFileOnMain(gh.owner, gh.repo, rel, `Recipe editor: delete ${rel}`);
}
