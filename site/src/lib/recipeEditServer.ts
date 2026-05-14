import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cleanTitle } from './cleanMarkdown';
import { getRecipeRepoRoot, SECTION_ORDER, type Section } from './loadRecipes';
import {
  getFileContentFromMain,
  getFileShaOnMain,
  getGithubBranchRef,
  isGitHubRecipeSyncEnabled,
  parseGitHubRepo,
  putFileOnMain,
  shouldSkipLocalRecipeWrites,
  syncDeleteToGitHubMain,
  syncSaveToGitHubMain,
  toGitHubPath,
  vercelRecipeEditRequiresGitHub,
} from './recipeEditGitHub';
import { slugify } from './slug';

/**
 * Optional absolute path to the repo that holds section folders (Indian/, …).
 * Use when the auto-detection from `getRecipeRepoRoot()` fails (e.g. custom deploy layout).
 */
export function resolvedRecipeRepoRoot(): string {
  const override = process.env.RECIPE_REPO_ROOT;
  if (override && override.length > 0) {
    return path.resolve(override);
  }
  return getRecipeRepoRoot();
}

/** `site/` directory (for `.trash`), when present next to the recipe repo. */
export function resolvedSiteRoot(): string {
  const repo = resolvedRecipeRepoRoot();
  const atRepo = path.join(repo, 'site');
  if (fs.existsSync(atRepo)) return atRepo;
  // Bundled serverless layout: no sibling `site/` — use repo root for `.trash`.
  return repo;
}

export function resolveSafeMdPath(repoRoot: string, relativePath: unknown): string | null {
  if (!relativePath || typeof relativePath !== 'string') return null;
  const resolved = path.resolve(repoRoot, relativePath);
  if (!resolved.startsWith(repoRoot + path.sep)) return null;
  if (!resolved.toLowerCase().endsWith('.md')) return null;
  return resolved;
}

export async function handleEditLoad(
  repoRoot: string,
  relativePath: string | null,
): Promise<Response> {
  const resolved = resolveSafeMdPath(repoRoot, relativePath);
  if (!resolved) return text(400, 'invalid path');

  if (shouldSkipLocalRecipeWrites()) {
    const gh = parseGitHubRepo();
    if (!gh) {
      return text(
        500,
        'GITHUB_REPO must be owner/repo (e.g. tmb2131/recipes_amma) or a github.com URL when GITHUB_TOKEN is set',
      );
    }
    const rel = toGitHubPath(repoRoot, resolved);
    try {
      const content = await getFileContentFromMain(gh.owner, gh.repo, rel);
      if (content === null) return text(404, 'file not found');
      return new Response(content, {
        status: 200,
        headers: { 'content-type': 'text/markdown; charset=utf-8' },
      });
    } catch (err) {
      return text(502, `GitHub: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (!fs.existsSync(resolved)) return text(404, 'file not found');
  const content = fs.readFileSync(resolved, 'utf8');
  return new Response(content, {
    status: 200,
    headers: { 'content-type': 'text/markdown; charset=utf-8' },
  });
}

export async function handleEditDelete(
  repoRoot: string,
  relativePath: string | undefined,
): Promise<Response> {
  const resolved = resolveSafeMdPath(repoRoot, relativePath);
  if (!resolved) return text(400, 'invalid path');

  if (vercelRecipeEditRequiresGitHub()) {
    return text(
      503,
      'On Vercel the recipe tree is read-only. Set GITHUB_TOKEN and GITHUB_REPO to delete via GitHub.',
    );
  }

  if (shouldSkipLocalRecipeWrites()) {
    const gh = parseGitHubRepo();
    if (!gh) {
      return text(
        500,
        'GITHUB_REPO must be owner/repo (e.g. tmb2131/recipes_amma) or a github.com URL when GITHUB_TOKEN is set',
      );
    }
    const rel = toGitHubPath(repoRoot, resolved);
    if (!(await getFileShaOnMain(gh.owner, gh.repo, rel))) {
      return text(404, 'file not found');
    }
    try {
      await syncDeleteToGitHubMain(repoRoot, resolved);
    } catch (err) {
      return text(502, `GitHub sync failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    return json(200, { ok: true, trashed: '(GitHub only)' });
  }

  if (!fs.existsSync(resolved)) return text(404, 'file not found');

  if (isGitHubRecipeSyncEnabled()) {
    if (!parseGitHubRepo()) {
      return text(
        500,
        'GITHUB_REPO must be owner/repo (e.g. tmb2131/recipes_amma) or a github.com URL when GITHUB_TOKEN is set',
      );
    }
    try {
      await syncDeleteToGitHubMain(repoRoot, resolved);
    } catch (err) {
      return text(502, `GitHub sync failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const siteRoot = resolvedSiteRoot();
  const trashDir = path.join(siteRoot, '.trash');
  fs.mkdirSync(trashDir, { recursive: true });
  const stamp = new Date()
    .toISOString()
    .replace(/[:.]/g, '-')
    .replace('T', '_')
    .slice(0, 19);
  const trashName = `${stamp}__${path.basename(resolved)}`;
  fs.renameSync(resolved, path.join(trashDir, trashName));
  return json(200, { ok: true, trashed: trashName });
}

function relativeRecipePath(repoRoot: string, absolutePath: string): string {
  return path.relative(repoRoot, absolutePath).split(path.sep).join('/');
}

export async function handleEditSave(
  repoRoot: string,
  bodyText: string,
): Promise<Response> {
  let payload: {
    relativePath?: string;
    content?: string;
    newBaseName?: string;
    newSection?: string;
  };
  try {
    payload = JSON.parse(bodyText) as typeof payload;
  } catch {
    return text(400, 'invalid JSON');
  }
  if (typeof payload.content !== 'string') return text(400, 'missing content');

  if (vercelRecipeEditRequiresGitHub()) {
    return text(
      503,
      'On Vercel the recipe tree is read-only. Set GITHUB_TOKEN and GITHUB_REPO to save edits to GitHub.',
    );
  }

  const sourcePath = resolveSafeMdPath(repoRoot, payload.relativePath);
  if (!sourcePath) return text(400, 'invalid path');

  if (shouldSkipLocalRecipeWrites()) {
    const gh = parseGitHubRepo();
    if (!gh) {
      return text(
        500,
        'GITHUB_REPO must be owner/repo (e.g. tmb2131/recipes_amma) or a github.com URL when GITHUB_TOKEN is set',
      );
    }
    const oldRel = toGitHubPath(repoRoot, sourcePath);
    if (!(await getFileShaOnMain(gh.owner, gh.repo, oldRel))) {
      return text(404, 'file not found on GitHub');
    }
  } else if (!fs.existsSync(sourcePath)) {
    return text(404, 'file not found');
  }

  const currentSection = path.basename(path.dirname(sourcePath));
  let targetSection: Section = isValidSection(currentSection) ? currentSection : 'Other';
  if (payload.newSection !== undefined) {
    if (!isValidSection(payload.newSection)) {
      return text(400, 'invalid newSection');
    }
    targetSection = payload.newSection;
  }

  let targetBaseName = path.basename(sourcePath);
  if (payload.newBaseName !== undefined && payload.newBaseName !== path.basename(sourcePath)) {
    const candidate = payload.newBaseName;
    if (
      candidate.includes('/') ||
      candidate.includes('\\') ||
      candidate.includes('\0') ||
      !candidate.toLowerCase().endsWith('.md') ||
      candidate.startsWith('.')
    ) {
      return text(400, 'invalid newBaseName');
    }
    targetBaseName = candidate;
  }

  const targetSectionDir = path.resolve(repoRoot, targetSection);
  if (path.dirname(targetSectionDir) !== repoRoot) {
    return text(400, 'invalid newSection');
  }
  const targetPath = path.resolve(targetSectionDir, targetBaseName);
  if (path.dirname(targetPath) !== targetSectionDir) {
    return text(400, 'newBaseName escapes section dir');
  }
  const renamed = targetPath !== sourcePath;

  if (renamed) {
    if (shouldSkipLocalRecipeWrites()) {
      const gh = parseGitHubRepo()!;
      const newRel = toGitHubPath(repoRoot, targetPath);
      if (await getFileShaOnMain(gh.owner, gh.repo, newRel)) {
        return text(409, 'a recipe with that filename already exists');
      }
    } else if (fs.existsSync(targetPath)) {
      return text(409, 'a recipe with that filename already exists');
    }
  }

  if (shouldSkipLocalRecipeWrites()) {
    try {
      await syncSaveToGitHubMain({
        repoRoot,
        sourceAbsolutePath: sourcePath,
        targetAbsolutePath: targetPath,
        content: payload.content,
        renamed,
      });
    } catch (err) {
      return text(502, `GitHub sync failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    return json(200, {
      ok: true,
      renamed,
      relativePath: relativeRecipePath(repoRoot, targetPath),
      baseName: path.basename(targetPath),
      section: targetSection,
      sectionSlug: slugify(targetSection),
      githubBranch: await getGithubBranchRef(),
    });
  }

  try {
    if (renamed) {
      fs.mkdirSync(targetSectionDir, { recursive: true });
      fs.renameSync(sourcePath, targetPath);
    }
    fs.writeFileSync(targetPath, payload.content, 'utf8');
  } catch (err) {
    return text(
      500,
      `Local save failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (isGitHubRecipeSyncEnabled()) {
    if (!parseGitHubRepo()) {
      return text(
        500,
        'GITHUB_REPO must be owner/repo (e.g. tmb2131/recipes_amma) or a github.com URL when GITHUB_TOKEN is set',
      );
    }
    try {
      await syncSaveToGitHubMain({
        repoRoot,
        sourceAbsolutePath: sourcePath,
        targetAbsolutePath: targetPath,
        content: payload.content,
        renamed,
      });
    } catch (err) {
      return text(502, `GitHub sync failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const githubBranch = isGitHubRecipeSyncEnabled() ? await getGithubBranchRef() : undefined;
  return json(200, {
    ok: true,
    renamed,
    relativePath: relativeRecipePath(repoRoot, targetPath),
    baseName: path.basename(targetPath),
    section: targetSection,
    sectionSlug: slugify(targetSection),
    ...(githubBranch !== undefined ? { githubBranch } : {}),
  });
}

/**
 * Validate a section folder name. Accepts only the canonical sections so we
 * never silently create a new top-level folder.
 */
function isValidSection(value: unknown): value is Section {
  return typeof value === 'string' && (SECTION_ORDER as readonly string[]).includes(value);
}

/**
 * Validate that a base filename is safe to drop into a section dir: no slashes,
 * no NUL bytes, no leading dot, must end with `.md`. Path containment is still
 * enforced at the call site with `path.dirname` equality.
 */
function isValidNewBaseName(candidate: string): boolean {
  if (!candidate) return false;
  if (
    candidate.includes('/') ||
    candidate.includes('\\') ||
    candidate.includes('\0') ||
    candidate.startsWith('.')
  ) {
    return false;
  }
  if (!candidate.toLowerCase().endsWith('.md')) return false;
  return true;
}

export async function handleEditCreate(
  repoRoot: string,
  bodyText: string,
): Promise<Response> {
  let payload: { section?: string; baseName?: string; content?: string };
  try {
    payload = JSON.parse(bodyText) as typeof payload;
  } catch {
    return text(400, 'invalid JSON');
  }
  if (typeof payload.content !== 'string') return text(400, 'missing content');
  if (!isValidSection(payload.section)) return text(400, 'invalid section');
  if (typeof payload.baseName !== 'string' || !isValidNewBaseName(payload.baseName)) {
    return text(400, 'invalid baseName');
  }

  if (vercelRecipeEditRequiresGitHub()) {
    return text(
      503,
      'On Vercel the recipe tree is read-only. Set GITHUB_TOKEN and GITHUB_REPO to create recipes via GitHub.',
    );
  }

  const sectionDir = path.resolve(repoRoot, payload.section);
  const targetPath = path.resolve(sectionDir, payload.baseName);
  if (path.dirname(targetPath) !== sectionDir) {
    return text(400, 'baseName escapes section dir');
  }

  if (shouldSkipLocalRecipeWrites()) {
    const gh = parseGitHubRepo();
    if (!gh) {
      return text(
        500,
        'GITHUB_REPO must be owner/repo (e.g. tmb2131/recipes_amma) or a github.com URL when GITHUB_TOKEN is set',
      );
    }
    const rel = toGitHubPath(repoRoot, targetPath);
    if (await getFileShaOnMain(gh.owner, gh.repo, rel)) {
      return text(409, 'a recipe with that filename already exists');
    }
    try {
      await putFileOnMain(gh.owner, gh.repo, rel, payload.content, `Recipe editor: create ${rel}`);
    } catch (err) {
      return text(502, `GitHub sync failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    return json(200, {
      ok: true,
      requiresDeploy: true,
      ...createResponseFields(repoRoot, targetPath, payload.section),
      githubBranch: await getGithubBranchRef(),
    });
  }

  if (fs.existsSync(targetPath)) {
    return text(409, 'a recipe with that filename already exists');
  }

  try {
    fs.mkdirSync(sectionDir, { recursive: true });
    fs.writeFileSync(targetPath, payload.content, 'utf8');
  } catch (err) {
    return text(
      500,
      `Local create failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (isGitHubRecipeSyncEnabled()) {
    const gh = parseGitHubRepo();
    if (!gh) {
      return text(
        500,
        'GITHUB_REPO must be owner/repo (e.g. tmb2131/recipes_amma) or a github.com URL when GITHUB_TOKEN is set',
      );
    }
    const rel = toGitHubPath(repoRoot, targetPath);
    try {
      await putFileOnMain(gh.owner, gh.repo, rel, payload.content, `Recipe editor: create ${rel}`);
    } catch (err) {
      return text(502, `GitHub sync failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const githubBranch = isGitHubRecipeSyncEnabled() ? await getGithubBranchRef() : undefined;
  return json(200, {
    ok: true,
    requiresDeploy: false,
    ...createResponseFields(repoRoot, targetPath, payload.section),
    ...(githubBranch !== undefined ? { githubBranch } : {}),
  });
}

/**
 * Common response shape for create: relative path on disk, the URL the recipe
 * will live at once the next deploy lands (so the client can navigate), plus
 * the section slug for convenience.
 */
function createResponseFields(
  repoRoot: string,
  targetPath: string,
  section: Section,
): {
  relativePath: string;
  baseName: string;
  section: Section;
  sectionSlug: string;
  slug: string;
  href: string;
} {
  const baseName = path.basename(targetPath);
  const titleInfo = cleanTitle(baseName.replace(/\.md$/i, ''));
  const sectionSlug = slugify(section);
  const slug = slugify(titleInfo.title);
  return {
    relativePath: relativeRecipePath(repoRoot, targetPath),
    baseName,
    section,
    sectionSlug,
    slug,
    href: `/${sectionSlug}/${slug}/`,
  };
}

function text(status: number, body: string): Response {
  return new Response(body, {
    status,
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}
