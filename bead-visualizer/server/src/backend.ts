import { readFileSync, writeFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type {
  HealthPayload, PurgeExecuteRequest, PurgeMode, PurgePreview, PurgeResult, PurgeStep,
} from '@beadviz/contract';
import type { AppConfig } from './config.js';
import { AppError } from './errors.js';
import { BdRunner, checkBeadsDir } from './bd/exec.js';
import { parseRecords, parseJsonStdout, unwrapEnvelope, isPlainObject, pickString } from './bd/envelope.js';
import { normalizeBeads, isOpen, type Bead } from './bd/normalize.js';
import { depsFromBead, depsFromDepList, dedupeDeps, type DepEdge } from './bd/deps.js';
import {
  derivePreview, mergePreview, parseDryRunJson, parseDryRunText, emptyDryRun, type ParsedDryRun,
} from './bd/purge.js';

export interface Backend {
  readonly source: 'bd' | 'fixture';
  health(): Promise<HealthPayload>;
  allBeads(): Promise<Bead[]>;
  /** `null` when `bd ready` was unavailable — the caller downgrades to derived readiness. */
  readyIds(): Promise<Set<string> | null>;
  deps(beads: Bead[]): Promise<DepEdge[]>;
  purgePreview(sessionId: string, mode: PurgeMode, sessionBeads: Bead[], allBeads: Bead[]): Promise<PurgePreview>;
  purgeExecute(
    sessionId: string,
    req: PurgeExecuteRequest,
    sessionBeads: Bead[],
    allBeads: Bead[],
    onStep: (s: PurgeStep) => void,
  ): Promise<PurgeResult>;
}

const USAGE_REJECTION = /unknown (flag|option|shorthand)|unrecognized|invalid (option|flag)|flag provided but not defined|no such flag|unexpected argument/i;

/* -------------------------------------------------------------- bd backend */

export class BdBackend implements Backend {
  readonly source = 'bd' as const;
  private readonly runner: BdRunner;

  constructor(private readonly cfg: AppConfig) {
    this.runner = new BdRunner(cfg);
  }

  async health(): Promise<HealthPayload> {
    const base = {
      ok: false,
      source: this.source,
      repoRoot: this.cfg.repoRoot,
      beadsDir: join(this.cfg.repoRoot, '.beads'),
      bdVersion: null as string | null,
      sessionLabelPattern: this.cfg.sessionLabelPattern,
    };

    const missingDir = checkBeadsDir(this.cfg.repoRoot);
    if (missingDir) return { ...base, problem: missingDir.toPayload().error };

    try {
      const { stdout } = await this.runner.exec(['--version'], { timeoutMs: 8_000 });
      const version = stdout.trim().split('\n')[0] ?? null;
      // `--version` never touches Dolt, so prove the database answers too.
      await this.runner.execFirst(this.cfg.listCandidates, { timeoutMs: 15_000 });
      return { ...base, ok: true, bdVersion: version, problem: null };
    } catch (e) {
      const err = e instanceof AppError ? e : new AppError('cli-error', String(e), 'Check the sidecar log.');
      return { ...base, problem: err.toPayload().error };
    }
  }

  async allBeads(): Promise<Bead[]> {
    const missing = checkBeadsDir(this.cfg.repoRoot);
    if (missing) throw missing;
    const { stdout } = await this.runner.execFirst(this.cfg.listCandidates);
    return normalizeBeads(parseRecords(stdout, 'bd list'));
  }

  /**
   * `bd ready` is the canonical readiness implementation (§3), so we ask it rather
   * than re-deriving the dependency-type semantics. A failure here is not fatal —
   * it downgrades the graph to derived readiness and says so in the UI.
   */
  async readyIds(): Promise<Set<string> | null> {
    try {
      const { stdout, stderr } = await this.runner.exec(['ready', '--json'], { tolerateFailure: true });
      if (!stdout.trim()) return stderr.trim() ? null : new Set();
      const records = parseRecords(stdout, 'bd ready');
      const ids = records.map((r) => pickString(r, 'id', 'issue_id')).filter((s): s is string => !!s);
      return records.length > 0 && ids.length === 0 ? null : new Set(ids);
    } catch {
      return null;
    }
  }

  async deps(beads: Bead[]): Promise<DepEdge[]> {
    const embedded = beads.flatMap(depsFromBead);
    let listed: DepEdge[] = [];
    try {
      const { stdout } = await this.runner.execFirst(
        [['dep', 'list', '--json'], ['dep', 'tree', '--json'], ['deps', '--json']],
        { tolerateFailure: true },
      );
      if (stdout.trim()) listed = depsFromDepList(parseRecords(stdout, 'bd dep list'));
    } catch {
      // Embedded fields alone are enough to draw the graph; a missing `dep list`
      // subcommand is not a reason to fail the request.
    }
    return dedupeDeps([...listed, ...embedded]);
  }

  /**
   * The scope arguments are the safety rail: `bd prune` with no scope is a
   * database-wide delete. If the template does not carry `{session}`, or the CLI
   * rejects it, we refuse — we never widen the blast radius by falling back.
   */
  private scopeArgs(sessionId: string): string[] {
    const template = this.cfg.scopeArgsTemplate;
    if (!template.some((a) => a.includes('{session}'))) {
      throw new AppError(
        'unsupported',
        'Refusing to prune: the configured scope does not mention the session.',
        'scopeArgsTemplate in beadviz.config.json must contain {session}, e.g. ["--label","{session}"].',
      );
    }
    return template.map((a) => a.replace('{session}', sessionId));
  }

  private async dryRun(sessionId: string, mode: PurgeMode): Promise<{ parsed: ParsedDryRun | null; raw: string; rejected: boolean }> {
    const args = [mode, '--dry-run', ...this.scopeArgs(sessionId)];
    const { stdout, stderr } = await this.runner.exec(args, { tolerateFailure: true });
    const raw = [stdout, stderr].filter((s) => s.trim()).join('\n').trim();
    if (USAGE_REJECTION.test(stderr)) return { parsed: null, raw, rejected: true };
    return { parsed: null, raw, rejected: false };
  }

  async purgePreview(sessionId: string, mode: PurgeMode, sessionBeads: Bead[], allBeads: Bead[]): Promise<PurgePreview> {
    const derived = derivePreview(sessionId, sessionBeads, allBeads.filter(isOpen), mode);
    const { raw, rejected } = await this.dryRun(sessionId, mode);

    if (rejected) {
      throw new AppError(
        'unsupported',
        `\`bd ${mode}\` does not accept the configured session scope, so this session cannot be retired safely.`,
        'Adjust scopeArgsTemplate in beadviz.config.json to a filter your bd version supports. An unscoped prune would delete closed beads across the whole database, so this app will not run one.',
        raw.slice(0, 800),
      );
    }

    const knownIds = sessionBeads.map((b) => b.id);
    const parsed = parseFromRaw(raw, knownIds);
    const merged = mergePreview(derived, parsed, new Map(sessionBeads.map((b) => [b.id, b])));

    return { ...merged, backupConfigured: await this.backupConfigured(), raw };
  }

  private async backupConfigured(): Promise<boolean> {
    try {
      const { stdout, stderr } = await this.runner.exec(['backup', 'status', '--json'], {
        tolerateFailure: true, timeoutMs: 8_000,
      });
      const text = `${stdout}\n${stderr}`;
      if (!stdout.trim() || USAGE_REJECTION.test(stderr)) return false;
      if (/not configured|no backup|disabled|never/i.test(text)) return false;
      return true;
    } catch {
      return false;
    }
  }

  async purgeExecute(
    sessionId: string,
    req: PurgeExecuteRequest,
    sessionBeads: Bead[],
    allBeads: Bead[],
    onStep: (s: PurgeStep) => void,
  ): Promise<PurgeResult> {
    const scope = this.scopeArgs(sessionId);
    const steps: PurgeStep[] = [];
    const record = (s: PurgeStep): void => { steps.push(s); onStep(s); };

    // Re-run the dry-run immediately before the destructive call. The preview the
    // user approved may be minutes old, and this is also what proves the CLI still
    // accepts the scope — never send --force to a command that might ignore it.
    const { raw, rejected } = await this.dryRun(sessionId, req.mode);
    if (rejected) {
      throw new AppError(
        'unsupported',
        `\`bd ${req.mode}\` rejected the session scope.`,
        'Fix scopeArgsTemplate in beadviz.config.json. This app will not run an unscoped prune.',
        raw.slice(0, 800),
      );
    }
    const derived = derivePreview(sessionId, sessionBeads, allBeads.filter(isOpen), req.mode);
    const plan = mergePreview(derived, parseFromRaw(raw, sessionBeads.map((b) => b.id)), new Map(sessionBeads.map((b) => [b.id, b])));
    record({ name: 'dry-run', ok: true, detail: `${plan.deletable.length} to delete, ${plan.keptOpen.length + plan.keptReferenced.length} kept` });

    let backupSynced = false;
    if (req.backupFirst) {
      const { stderr } = await this.runner.exec(['backup', 'sync'], { tolerateFailure: true, timeoutMs: 120_000 });
      backupSynced = !stderr.trim() || !USAGE_REJECTION.test(stderr);
      record({ name: 'backup sync', ok: backupSynced, detail: backupSynced ? 'backup synced' : stderr.slice(0, 200) });
      if (!backupSynced) {
        throw new AppError('cli-error', 'Backup failed, so nothing was deleted.', 'Fix the backup target or clear the "back up first" checkbox, then retry.', stderr.slice(0, 400));
      }
    }

    const bytesBefore = dirSize(join(this.cfg.repoRoot, '.beads'));

    const args = [req.mode, '--force', ...scope];
    if (req.ignoreReferences) args.push('--ignore-references');
    const { stdout: delOut, stderr: delErr } = await this.runner.exec(args, { tolerateFailure: true, timeoutMs: 120_000 });
    if (delErr.trim() && USAGE_REJECTION.test(delErr)) {
      throw new AppError('cli-error', `\`bd ${req.mode}\` rejected its arguments.`, 'Check the flags your bd version supports.', delErr.slice(0, 400));
    }
    record({ name: `bd ${req.mode} --force`, ok: true, detail: firstLine(delOut) || `${plan.deletable.length} beads deleted` });

    // Row deletion alone does not reclaim Dolt storage (§1.2).
    const { stdout: flatOut, stderr: flatErr } = await this.runner.exec(['flatten'], { tolerateFailure: true, timeoutMs: 180_000 });
    const flattened = !USAGE_REJECTION.test(flatErr);
    record({ name: 'bd flatten', ok: flattened, detail: flattened ? firstLine(flatOut) || 'storage compacted' : 'flatten unavailable in this bd version' });

    const bytesAfter = dirSize(join(this.cfg.repoRoot, '.beads'));
    return {
      sessionId,
      deletedCount: req.ignoreReferences ? plan.deletable.length + plan.keptReferenced.length : plan.deletable.length,
      keptCount: req.ignoreReferences ? plan.keptOpen.length : plan.keptOpen.length + plan.keptReferenced.length,
      bytesBefore,
      bytesAfter,
      bytesReclaimed: bytesBefore !== null && bytesAfter !== null ? Math.max(0, bytesBefore - bytesAfter) : null,
      flattened,
      backupSynced,
      steps,
    };
  }
}

function parseFromRaw(raw: string, knownIds: string[]): ParsedDryRun {
  if (!raw.trim()) return emptyDryRun();
  try {
    const json = unwrapEnvelope(parseJsonStdout(raw, 'dry run'), 'dry run');
    const parsed = parseDryRunJson(isPlainObject(json) ? json : {});
    if (parsed) return parsed;
  } catch {
    // Not JSON — the text parser is the expected path for a human-readable dry run.
  }
  return parseDryRunText(raw, knownIds);
}

function firstLine(s: string): string {
  return s.trim().split('\n')[0]?.trim() ?? '';
}

export function dirSize(dir: string): number | null {
  if (!existsSync(dir)) return null;
  let total = 0;
  const walk = (d: string): void => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (entry.isFile()) {
        try { total += statSync(p).size; } catch { /* raced with the CLI; skip */ }
      }
    }
  };
  try { walk(dir); } catch { return null; }
  return total;
}

/* --------------------------------------------------------- fixture backend */

/**
 * A JSON file standing in for the database, so the UI can be developed, demoed and
 * tested on a machine with no `bd` and no Dolt. Retiring a session really does
 * rewrite the fixture, because a purge flow that no-ops in demo mode is a purge
 * flow nobody has actually watched work.
 */
export class FixtureBackend implements Backend {
  readonly source = 'fixture' as const;

  constructor(private readonly cfg: AppConfig, private readonly file: string) {
    if (!existsSync(file)) {
      throw new AppError('not-found', `Fixture ${file} does not exist.`, 'Pass --fixture <path-to-json> or drop the flag to use the real bd CLI.');
    }
  }

  private read(): { beads: Record<string, unknown>[]; ready?: string[]; deps?: Record<string, unknown>[] } {
    const doc = JSON.parse(readFileSync(this.file, 'utf8')) as Record<string, unknown>;
    const beads = Array.isArray(doc.beads) ? (doc.beads as Record<string, unknown>[]) : [];
    return {
      beads,
      ready: Array.isArray(doc.ready) ? (doc.ready as string[]) : undefined,
      deps: Array.isArray(doc.deps) ? (doc.deps as Record<string, unknown>[]) : undefined,
    };
  }

  async health(): Promise<HealthPayload> {
    return {
      ok: true,
      source: this.source,
      repoRoot: this.cfg.repoRoot,
      beadsDir: this.file,
      bdVersion: 'fixture',
      sessionLabelPattern: this.cfg.sessionLabelPattern,
      problem: null,
    };
  }

  async allBeads(): Promise<Bead[]> {
    return normalizeBeads(this.read().beads);
  }

  async readyIds(): Promise<Set<string> | null> {
    const { ready } = this.read();
    return ready ? new Set(ready) : null;
  }

  async deps(beads: Bead[]): Promise<DepEdge[]> {
    const { deps } = this.read();
    return dedupeDeps([...(deps ? depsFromDepList(deps) : []), ...beads.flatMap(depsFromBead)]);
  }

  async purgePreview(sessionId: string, mode: PurgeMode, sessionBeads: Bead[], allBeads: Bead[]): Promise<PurgePreview> {
    const derived = derivePreview(sessionId, sessionBeads, allBeads.filter(isOpen), mode);
    return {
      ...derived,
      estimatedBytes: derived.deletable.length * 4096,
      backupConfigured: false,
      raw: `[fixture] ${mode} --dry-run --label ${sessionId}\n${derived.deletable.length} deletable, ${derived.keptOpen.length} open, ${derived.keptReferenced.length} referenced`,
    };
  }

  async purgeExecute(
    sessionId: string,
    req: PurgeExecuteRequest,
    sessionBeads: Bead[],
    allBeads: Bead[],
    onStep: (s: PurgeStep) => void,
  ): Promise<PurgeResult> {
    const derived = derivePreview(sessionId, sessionBeads, allBeads.filter(isOpen), req.mode);
    const doomed = new Set([
      ...derived.deletable.map((c) => c.id),
      ...(req.ignoreReferences ? derived.keptReferenced.map((c) => c.id) : []),
    ]);

    const steps: PurgeStep[] = [];
    const step = (name: string, detail: string): void => {
      const s: PurgeStep = { name, ok: true, detail };
      steps.push(s);
      onStep(s);
    };
    step('dry-run', `${doomed.size} to delete`);

    const doc = JSON.parse(readFileSync(this.file, 'utf8')) as Record<string, unknown>;
    const before = JSON.stringify(doc).length;
    doc.beads = (doc.beads as Record<string, unknown>[]).filter((b) => !doomed.has(String(b.id ?? '')));
    if (Array.isArray(doc.deps)) {
      doc.deps = (doc.deps as Record<string, unknown>[]).filter(
        (d) => !doomed.has(String(d.issue_id ?? '')) && !doomed.has(String(d.depends_on_id ?? '')),
      );
    }
    writeFileSync(this.file, `${JSON.stringify(doc, null, 2)}\n`, 'utf8');
    const after = JSON.stringify(doc).length;

    step(`bd ${req.mode} --force`, `${doomed.size} beads deleted`);
    step('bd flatten', 'storage compacted');

    return {
      sessionId,
      deletedCount: doomed.size,
      keptCount: derived.keptOpen.length + (req.ignoreReferences ? 0 : derived.keptReferenced.length),
      bytesBefore: before,
      bytesAfter: after,
      bytesReclaimed: Math.max(0, before - after),
      flattened: true,
      backupSynced: false,
      steps,
    };
  }
}

export function createBackend(cfg: AppConfig): Backend {
  return cfg.fixture ? new FixtureBackend(cfg, cfg.fixture) : new BdBackend(cfg);
}
