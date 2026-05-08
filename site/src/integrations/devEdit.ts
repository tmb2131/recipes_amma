import type { AstroIntegration } from 'astro';
import fs from 'node:fs';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * Dev-only integration: adds `POST /__edit/delete`, `GET /__edit/load`, and
 * `POST /__edit/save` endpoints to the Vite dev server. Used by
 * `RecipeActions.astro` and `RecipeEditModal.astro` to mutate recipe files
 * on disk.
 *
 * Safety:
 * - Only mounted while `astro dev` is running. The built `dist/` site never
 *   sees this code.
 * - Validates that the target path is inside the repo root and ends in `.md`.
 * - Deletes are soft: files are moved to `site/.trash/`.
 */
export function devEdit(): AstroIntegration {
  return {
    name: 'dev-edit',
    hooks: {
      'astro:server:setup': ({ server }) => {
        const astroRoot = server.config.root; // .../Recipes/site
        const repoRoot = path.resolve(astroRoot, '..');
        const trashDir = path.join(astroRoot, '.trash');

        server.middlewares.use(
          '/__edit/delete',
          async (req: IncomingMessage, res: ServerResponse) => {
            if (req.method !== 'POST') {
              return reply(res, 405, 'method not allowed');
            }
            try {
              const body = await readBody(req);
              const payload = JSON.parse(body) as { relativePath?: string };
              const resolved = resolveSafePath(repoRoot, payload.relativePath);
              if (!resolved) return reply(res, 400, 'invalid path');
              if (!fs.existsSync(resolved)) return reply(res, 404, 'file not found');

              fs.mkdirSync(trashDir, { recursive: true });
              const stamp = new Date()
                .toISOString()
                .replace(/[:.]/g, '-')
                .replace('T', '_')
                .slice(0, 19);
              const trashName = `${stamp}__${path.basename(resolved)}`;
              fs.renameSync(resolved, path.join(trashDir, trashName));
              return replyJson(res, 200, { ok: true, trashed: trashName });
            } catch (err) {
              return reply(res, 500, errMsg(err));
            }
          },
        );

        server.middlewares.use(
          '/__edit/load',
          (req: IncomingMessage, res: ServerResponse) => {
            if (req.method !== 'GET') {
              return reply(res, 405, 'method not allowed');
            }
            try {
              const url = new URL(req.url ?? '', 'http://localhost');
              const rel = url.searchParams.get('relativePath') ?? undefined;
              const resolved = resolveSafePath(repoRoot, rel);
              if (!resolved) return reply(res, 400, 'invalid path');
              if (!fs.existsSync(resolved)) return reply(res, 404, 'file not found');

              const content = fs.readFileSync(resolved, 'utf8');
              return reply(res, 200, content, 'text/markdown; charset=utf-8');
            } catch (err) {
              return reply(res, 500, errMsg(err));
            }
          },
        );

        server.middlewares.use(
          '/__edit/save',
          async (req: IncomingMessage, res: ServerResponse) => {
            if (req.method !== 'POST') {
              return reply(res, 405, 'method not allowed');
            }
            try {
              const body = await readBody(req, 1024 * 1024); // 1 MB cap
              const payload = JSON.parse(body) as {
                relativePath?: string;
                content?: string;
                newBaseName?: string;
              };
              if (typeof payload.content !== 'string') {
                return reply(res, 400, 'missing content');
              }
              const sourcePath = resolveSafePath(repoRoot, payload.relativePath);
              if (!sourcePath) return reply(res, 400, 'invalid path');
              if (!fs.existsSync(sourcePath)) return reply(res, 404, 'file not found');

              let targetPath = sourcePath;
              let renamed = false;

              if (payload.newBaseName && payload.newBaseName !== path.basename(sourcePath)) {
                const candidate = payload.newBaseName;
                if (
                  candidate.includes('/') ||
                  candidate.includes('\\') ||
                  candidate.includes('\0') ||
                  !candidate.toLowerCase().endsWith('.md') ||
                  candidate.startsWith('.')
                ) {
                  return reply(res, 400, 'invalid newBaseName');
                }
                const sectionDir = path.dirname(sourcePath);
                const proposed = path.resolve(sectionDir, candidate);
                if (path.dirname(proposed) !== sectionDir) {
                  return reply(res, 400, 'newBaseName escapes section dir');
                }
                if (fs.existsSync(proposed)) {
                  return reply(res, 409, 'a recipe with that filename already exists');
                }
                fs.renameSync(sourcePath, proposed);
                targetPath = proposed;
                renamed = true;
              }

              fs.writeFileSync(targetPath, payload.content, 'utf8');

              const newRelativePath = path.relative(repoRoot, targetPath);
              return replyJson(res, 200, {
                ok: true,
                renamed,
                relativePath: newRelativePath,
                baseName: path.basename(targetPath),
              });
            } catch (err) {
              return reply(res, 500, errMsg(err));
            }
          },
        );
      },
    },
  };
}

/**
 * Resolve `relativePath` against the repo root, refusing anything that
 * escapes the root or doesn't look like a markdown file. Returns the
 * absolute path on success, or `null` on rejection.
 */
function resolveSafePath(repoRoot: string, relativePath: unknown): string | null {
  if (!relativePath || typeof relativePath !== 'string') return null;
  const resolved = path.resolve(repoRoot, relativePath);
  if (!resolved.startsWith(repoRoot + path.sep)) return null;
  if (!resolved.toLowerCase().endsWith('.md')) return null;
  return resolved;
}

function readBody(req: IncomingMessage, maxBytes = 64 * 1024): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > maxBytes) {
        req.destroy();
        reject(new Error('body too large'));
      }
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function reply(res: ServerResponse, status: number, body: string, type = 'text/plain') {
  res.statusCode = status;
  res.setHeader('content-type', type);
  res.end(body);
}

function replyJson(res: ServerResponse, status: number, body: unknown) {
  reply(res, status, JSON.stringify(body), 'application/json');
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
