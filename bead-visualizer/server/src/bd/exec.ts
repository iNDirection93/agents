import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { AppError } from '../errors.js';
import type { AppConfig } from '../config.js';

const run = promisify(execFile);

export interface CliOutcome {
  argv: string[];
  stdout: string;
  stderr: string;
}

export interface RunOptions {
  /** Let a non-zero exit through instead of throwing — `--dry-run` probing needs this. */
  tolerateFailure?: boolean;
  timeoutMs?: number;
}

/**
 * The one place this app touches a shell-adjacent surface.
 *
 * `execFile` with an argv array: no interpolation, no `shell: true`, ever. Session
 * names arrive from the browser and are allowlisted upstream in validate.ts, so
 * even a future argv-injection attempt has nothing to work with.
 */
export class BdRunner {
  constructor(private readonly cfg: AppConfig) {}

  async exec(args: string[], opts: RunOptions = {}): Promise<CliOutcome> {
    const argv = [this.cfg.bdBinary, ...args];
    try {
      const { stdout, stderr } = await run(this.cfg.bdBinary, args, {
        cwd: this.cfg.repoRoot,
        timeout: opts.timeoutMs ?? this.cfg.timeoutMs,
        maxBuffer: 64 * 1024 * 1024,
        env: { ...process.env, BD_JSON_ENVELOPE: '1', NO_COLOR: '1' },
        windowsHide: true,
      });
      return { argv, stdout, stderr };
    } catch (e) {
      const err = e as NodeJS.ErrnoException & { stdout?: string; stderr?: string; killed?: boolean; signal?: string };
      if (opts.tolerateFailure && err.code !== 'ENOENT') {
        return { argv, stdout: err.stdout ?? '', stderr: err.stderr ?? '' };
      }
      throw this.classify(err, argv);
    }
  }

  /**
   * `bd`'s flag surface has moved between releases, so a call site can offer several
   * spellings of the same request. Only *usage* failures fall through to the next
   * candidate — a Dolt outage is reported, not retried three more ways.
   */
  async execFirst(candidates: string[][], opts: RunOptions = {}): Promise<CliOutcome> {
    let last: AppError | null = null;
    for (const args of candidates) {
      try {
        return await this.exec(args, opts);
      } catch (e) {
        const err = e instanceof AppError ? e : null;
        if (!err || err.kind !== 'cli-error') throw e;
        last = err;
      }
    }
    throw last ?? new AppError('cli-error', 'No bd invocation succeeded.', 'Check `bd --help` and set listCandidates in beadviz.config.json.');
  }

  /** Classify a spawn/exit failure into something with a fix attached (§7). */
  classify(err: NodeJS.ErrnoException & { stderr?: string; killed?: boolean; signal?: string }, argv: string[]): AppError {
    const cmd = argv.join(' ');
    const stderr = (err.stderr ?? '').trim();

    if (err.code === 'ENOENT') {
      return new AppError(
        'binary-missing',
        `\`${this.cfg.bdBinary}\` is not on PATH.`,
        'Install beads and make sure `bd` is on PATH, or set bdBinary in beadviz.config.json.',
        cmd,
      );
    }
    if (err.killed || err.signal === 'SIGTERM' || /ETIMEDOUT/.test(String(err.code))) {
      return new AppError(
        'timeout',
        `\`${cmd}\` did not finish within ${this.cfg.timeoutMs}ms.`,
        'Check that the Dolt server is responsive: `bd dolt status`.',
        stderr,
      );
    }
    return classifyStderr(stderr, cmd, this.cfg.repoRoot);
  }
}

const DOLT_DOWN = /connection refused|can'?t connect to (the )?(mysql|dolt)|dial tcp|dolt (sql-)?server (is )?not running|no such host|ECONNREFUSED/i;
const NO_DB = /no \.beads|\.beads (directory|dir) not found|not a beads (repo|database)|no beads database|run `?bd init`?|database not initiali[sz]ed/i;

export function classifyStderr(stderr: string, cmd: string, repoRoot: string): AppError {
  if (DOLT_DOWN.test(stderr)) {
    return new AppError(
      'dolt-down',
      'The Dolt server is not accepting connections.',
      'Run `bd dolt start` in the repository, then retry. (Embedded Dolt was removed in v0.56.1 — server mode is the only mode.)',
      stderr,
    );
  }
  if (NO_DB.test(stderr)) {
    return new AppError(
      'no-beads-dir',
      `No beads database found at ${join(repoRoot, '.beads')}.`,
      'Point the sidecar at the repository that owns `.beads/` with `--repo <path>`, or run `bd init` there.',
      stderr,
    );
  }
  return new AppError(
    'cli-error',
    `\`${cmd}\` failed.`,
    'Run the same command in a terminal to see the full output.',
    stderr || '(no stderr)',
  );
}

/** Cheap pre-flight so the first error names the missing directory rather than a CLI usage string. */
export function checkBeadsDir(repoRoot: string): AppError | null {
  if (existsSync(join(repoRoot, '.beads'))) return null;
  return new AppError(
    'no-beads-dir',
    `No \`.beads/\` directory found at ${repoRoot}.`,
    'Start the sidecar with `--repo <path-to-repo>`, or run `bd init` in this directory.',
  );
}
