import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import fastifyStatic from '@fastify/static';
import type { FastifyInstance } from 'fastify';
import type { AvatarManifest } from '@beadviz/contract';
import { isSafeRelativePath } from '../validate.js';

/**
 * Avatars are read from a folder you populate — the app bundles none and fetches
 * none (§1.4). Everything here is therefore defensive about a hand-edited
 * manifest: a bad entry drops out with a warning rather than breaking the graph.
 */
const GENERIC_FALLBACK = 'generic-agent.svg';

export async function registerAvatars(app: FastifyInstance, dir: string): Promise<void> {
  ensureFallback(dir);

  await app.register(fastifyStatic, {
    root: dir,
    prefix: '/avatars/',
    index: false,
    dotfiles: 'deny',
    // Agent art changes rarely, but a swapped folder should show up on reload.
    cacheControl: true,
    maxAge: 60_000,
  });

  app.get('/api/avatars/manifest', async () => readManifest(dir));
}

export interface ManifestResult extends AvatarManifest {
  /** Non-fatal problems, surfaced in the UI rather than swallowed. */
  warnings: string[];
}

export function readManifest(dir: string): ManifestResult {
  const path = join(dir, 'manifest.json');
  const empty: ManifestResult = { version: 1, fallback: GENERIC_FALLBACK, agents: {}, warnings: [] };

  if (!existsSync(path)) {
    return { ...empty, warnings: [`No manifest.json in ${dir} — every agent uses the generic avatar.`] };
  }

  let doc: unknown;
  try {
    doc = JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    return { ...empty, warnings: [`${path} is not valid JSON: ${(e as Error).message}`] };
  }
  if (typeof doc !== 'object' || doc === null) {
    return { ...empty, warnings: [`${path} must contain an object.`] };
  }

  const raw = doc as Partial<AvatarManifest>;
  const warnings: string[] = [];
  const agents: AvatarManifest['agents'] = {};

  for (const [key, entry] of Object.entries(raw.agents ?? {})) {
    if (!entry || typeof entry !== 'object' || typeof entry.file !== 'string') {
      warnings.push(`Agent "${key}" has no file; using the fallback.`);
      continue;
    }
    if (!isSafeRelativePath(entry.file)) {
      warnings.push(`Agent "${key}" points outside the avatars folder ("${entry.file}"); ignored.`);
      continue;
    }
    if (!existsSync(join(dir, entry.file))) {
      warnings.push(`Agent "${key}" points at ${entry.file}, which is not in ${dir}.`);
      continue;
    }
    agents[key] = {
      file: entry.file,
      ...(typeof entry.label === 'string' ? { label: entry.label } : {}),
      ...(typeof entry.hue === 'string' && /^#[0-9a-f]{3,8}$/i.test(entry.hue) ? { hue: entry.hue } : {}),
    };
  }

  const fallback =
    typeof raw.fallback === 'string' && isSafeRelativePath(raw.fallback) && existsSync(join(dir, raw.fallback))
      ? raw.fallback
      : GENERIC_FALLBACK;
  if (fallback !== raw.fallback && raw.fallback) {
    warnings.push(`Fallback "${String(raw.fallback)}" is missing; using ${GENERIC_FALLBACK}.`);
  }

  return { version: typeof raw.version === 'number' ? raw.version : 1, fallback, agents, warnings };
}

/**
 * The built-in generic avatar. Written to disk once rather than served from memory
 * so that the folder is self-describing: everything the graph can draw is a file
 * you can look at, and replacing it is a matter of overwriting it.
 */
function ensureFallback(dir: string): void {
  mkdirSync(dir, { recursive: true });
  const path = join(dir, GENERIC_FALLBACK);
  if (existsSync(path)) return;
  writeFileSync(path, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 56 56" role="img" aria-label="Unassigned agent">
  <rect width="56" height="56" fill="#1E1838"/>
  <circle cx="28" cy="22" r="9" fill="none" stroke="#6B6389" stroke-width="2"/>
  <path d="M11 50c0-9.4 7.6-17 17-17s17 7.6 17 17" fill="none" stroke="#6B6389" stroke-width="2"/>
</svg>
`, 'utf8');
}
