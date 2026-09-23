import { readFileSync, writeFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { AppError } from './errors.js';
import { BdRunner, checkBeadsDir } from './bd/exec.js';
import { parseRecords, parseJsonStdout, unwrapEnvelope, isPlainObject, pickString } from './bd/envelope.js';
import { normalizeBeads, isOpen } from './bd/normalize.js';
import { depsFromBead, depsFromDepList, dedupeDeps } from './bd/deps.js';
import { derivePreview, mergePreview, parseDryRunJson, parseDryRunText, emptyDryRun, } from './bd/purge.js';
const USAGE_REJECTION = /unknown (flag|option|shorthand)|unrecognized|invalid (option|flag)|flag provided but not defined|no such flag|unexpected argument/i;
/* -------------------------------------------------------------- bd backend */
export class BdBackend {
    cfg;
    source = 'bd';
    runner;
    /**
     * A single-database snapshot cache. Each `bd` invocation cold-starts the embedded
     * Dolt engine (~0.4s) and they cannot run in parallel — concurrent opens contend
     * on the store lock and are measurably *slower* than serial — so re-reading the
     * whole database on every request was the app's dominant cost once the ~10s
     * `dep list` was gone.
     *
     * We cache the two read commands and drop the cache the instant the `.beads/`
     * watcher reports a real change (wired in index.ts) or we write ourselves. `bd`
     * therefore stays the single source of truth; we simply do not re-spawn it when
     * nothing has changed. `gen` stops an in-flight read from storing a snapshot that
     * a change invalidated mid-flight, and TTL_MS is a backstop for the rare change
     * that slips past the watcher.
     */
    static TTL_MS = 30_000;
    gen = 0;
    beadsSnap = null;
    beadsInFlight = null;
    readySnap = null;
    readyInFlight = null;
    versionCache = null;
    constructor(cfg) {
        this.cfg = cfg;
        this.runner = new BdRunner(cfg);
    }
    /** Drop the snapshot — the watcher (or our own write) says the beads changed. */
    invalidate() {
        this.gen += 1;
        this.beadsSnap = null;
        this.readySnap = null;
    }
    fresh(snap) {
        return !!snap && snap.gen === this.gen && Date.now() - snap.at < BdBackend.TTL_MS;
    }
    async health() {
        const base = {
            ok: false,
            source: this.source,
            repoRoot: this.cfg.repoRoot,
            beadsDir: join(this.cfg.repoRoot, '.beads'),
            bdVersion: null,
            sessionLabelPattern: this.cfg.sessionLabelPattern,
        };
        const missingDir = checkBeadsDir(this.cfg.repoRoot);
        if (missingDir)
            return { ...base, problem: missingDir.toPayload().error };
        try {
            if (!this.versionCache) {
                const { stdout } = await this.runner.exec(['--version'], { timeoutMs: 8_000 });
                this.versionCache = stdout.trim().split('\n')[0] ?? null;
            }
            // Prove the database answers — but through the cache, so a warm health check
            // is free and the initial load shares its one `bd list` with /api/sessions.
            await this.allBeads();
            return { ...base, ok: true, bdVersion: this.versionCache, problem: null };
        }
        catch (e) {
            const err = e instanceof AppError ? e : new AppError('cli-error', String(e), 'Check the sidecar log.');
            return { ...base, problem: err.toPayload().error };
        }
    }
    async allBeads() {
        const missing = checkBeadsDir(this.cfg.repoRoot);
        if (missing)
            throw missing;
        if (this.fresh(this.beadsSnap))
            return this.beadsSnap.beads;
        // Coalesce concurrent callers onto one spawn — otherwise health + sessions +
        // graph firing together would be three contending `bd list` processes.
        if (this.beadsInFlight)
            return this.beadsInFlight;
        const startGen = this.gen;
        this.beadsInFlight = (async () => {
            const { stdout } = await this.runner.execFirst(this.cfg.listCandidates);
            const beads = normalizeBeads(parseRecords(stdout, 'bd list'));
            if (this.gen === startGen)
                this.beadsSnap = { gen: this.gen, at: Date.now(), beads };
            return beads;
        })();
        try {
            return await this.beadsInFlight;
        }
        finally {
            this.beadsInFlight = null;
        }
    }
    /**
     * `bd ready` is the canonical readiness implementation (§3), so we ask it rather
     * than re-deriving the dependency-type semantics. A failure here is not fatal —
     * it downgrades the graph to derived readiness and says so in the UI. Cached and
     * coalesced like allBeads, and invalidated by the same signal.
     */
    async readyIds() {
        if (this.fresh(this.readySnap))
            return this.readySnap.ids;
        if (this.readyInFlight)
            return this.readyInFlight;
        const startGen = this.gen;
        this.readyInFlight = (async () => {
            let ids;
            try {
                const { stdout, stderr } = await this.runner.exec(['ready', '--json'], { tolerateFailure: true });
                if (!stdout.trim()) {
                    ids = stderr.trim() ? null : new Set();
                }
                else {
                    const records = parseRecords(stdout, 'bd ready');
                    const list = records.map((r) => pickString(r, 'id', 'issue_id')).filter((s) => !!s);
                    ids = records.length > 0 && list.length === 0 ? null : new Set(list);
                }
            }
            catch {
                ids = null;
            }
            if (this.gen === startGen)
                this.readySnap = { gen: this.gen, at: Date.now(), ids };
            return ids;
        })();
        try {
            return await this.readyInFlight;
        }
        finally {
            this.readyInFlight = null;
        }
    }
    /**
     * Edges are read from the per-bead `dependencies` records that `bd list --all
     * --json` already returns (see `allBeads`) — the exact same set `bd dep list`
     * produces, for free, with no extra process spawn.
     *
     * We deliberately do NOT call `bd dep list <ids> --json`: at ~130 ids it took
     * ~10s (bd appears to issue a query per id), and its output was byte-identical to
     * the embedded records. That one call was the dominant cost of every graph load.
     */
    async deps(beads) {
        return dedupeDeps(beads.flatMap(depsFromBead));
    }
    /**
     * The scope arguments are the safety rail: `bd prune` with no scope is a
     * database-wide delete. If the template does not carry `{session}`, or the CLI
     * rejects it, we refuse — we never widen the blast radius by falling back.
     */
    scopeArgs(sessionId) {
        const template = this.cfg.scopeArgsTemplate;
        if (!template.some((a) => a.includes('{session}'))) {
            throw new AppError('unsupported', 'Refusing to prune: the configured scope does not mention the session.', 'scopeArgsTemplate in beadviz.config.json must contain {session}, e.g. ["--label","{session}"].');
        }
        return template.map((a) => a.replace('{session}', sessionId));
    }
    async dryRun(sessionId, mode) {
        const args = [mode, '--dry-run', ...this.scopeArgs(sessionId)];
        const { stdout, stderr } = await this.runner.exec(args, { tolerateFailure: true });
        const raw = [stdout, stderr].filter((s) => s.trim()).join('\n').trim();
        if (USAGE_REJECTION.test(stderr))
            return { parsed: null, raw, rejected: true };
        return { parsed: null, raw, rejected: false };
    }
    async purgePreview(sessionId, mode, sessionBeads, allBeads) {
        const derived = derivePreview(sessionId, sessionBeads, allBeads.filter(isOpen), mode);
        const { raw, rejected } = await this.dryRun(sessionId, mode);
        if (rejected) {
            throw new AppError('unsupported', `\`bd ${mode}\` does not accept the configured session scope, so this session cannot be retired safely.`, 'Adjust scopeArgsTemplate in beadviz.config.json to a filter your bd version supports. An unscoped prune would delete closed beads across the whole database, so this app will not run one.', raw.slice(0, 800));
        }
        const knownIds = sessionBeads.map((b) => b.id);
        const parsed = parseFromRaw(raw, knownIds);
        const merged = mergePreview(derived, parsed, new Map(sessionBeads.map((b) => [b.id, b])));
        return { ...merged, backupConfigured: await this.backupConfigured(), raw };
    }
    async backupConfigured() {
        try {
            const { stdout, stderr } = await this.runner.exec(['backup', 'status', '--json'], {
                tolerateFailure: true, timeoutMs: 8_000,
            });
            const text = `${stdout}\n${stderr}`;
            if (!stdout.trim() || USAGE_REJECTION.test(stderr))
                return false;
            if (/not configured|no backup|disabled|never/i.test(text))
                return false;
            return true;
        }
        catch {
            return false;
        }
    }
    async purgeExecute(sessionId, req, sessionBeads, allBeads, onStep) {
        const scope = this.scopeArgs(sessionId);
        const steps = [];
        const record = (s) => { steps.push(s); onStep(s); };
        // Re-run the dry-run immediately before the destructive call. The preview the
        // user approved may be minutes old, and this is also what proves the CLI still
        // accepts the scope — never send --force to a command that might ignore it.
        const { raw, rejected } = await this.dryRun(sessionId, req.mode);
        if (rejected) {
            throw new AppError('unsupported', `\`bd ${req.mode}\` rejected the session scope.`, 'Fix scopeArgsTemplate in beadviz.config.json. This app will not run an unscoped prune.', raw.slice(0, 800));
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
        if (req.ignoreReferences)
            args.push('--ignore-references');
        const { stdout: delOut, stderr: delErr } = await this.runner.exec(args, { tolerateFailure: true, timeoutMs: 120_000 });
        if (delErr.trim() && USAGE_REJECTION.test(delErr)) {
            throw new AppError('cli-error', `\`bd ${req.mode}\` rejected its arguments.`, 'Check the flags your bd version supports.', delErr.slice(0, 400));
        }
        record({ name: `bd ${req.mode} --force`, ok: true, detail: firstLine(delOut) || `${plan.deletable.length} beads deleted` });
        // We just changed the database ourselves — drop the cache so the reload the UI
        // fires on completion reads the new state rather than the pre-delete snapshot.
        this.invalidate();
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
function parseFromRaw(raw, knownIds) {
    if (!raw.trim())
        return emptyDryRun();
    try {
        const json = unwrapEnvelope(parseJsonStdout(raw, 'dry run'), 'dry run');
        const parsed = parseDryRunJson(isPlainObject(json) ? json : {});
        if (parsed)
            return parsed;
    }
    catch {
        // Not JSON — the text parser is the expected path for a human-readable dry run.
    }
    return parseDryRunText(raw, knownIds);
}
function firstLine(s) {
    return s.trim().split('\n')[0]?.trim() ?? '';
}
export function dirSize(dir) {
    if (!existsSync(dir))
        return null;
    let total = 0;
    const walk = (d) => {
        for (const entry of readdirSync(d, { withFileTypes: true })) {
            const p = join(d, entry.name);
            if (entry.isDirectory())
                walk(p);
            else if (entry.isFile()) {
                try {
                    total += statSync(p).size;
                }
                catch { /* raced with the CLI; skip */ }
            }
        }
    };
    try {
        walk(dir);
    }
    catch {
        return null;
    }
    return total;
}
/* --------------------------------------------------------- fixture backend */
/**
 * A JSON file standing in for the database, so the UI can be developed, demoed and
 * tested on a machine with no `bd` and no Dolt. Retiring a session really does
 * rewrite the fixture, because a purge flow that no-ops in demo mode is a purge
 * flow nobody has actually watched work.
 */
export class FixtureBackend {
    cfg;
    file;
    source = 'fixture';
    /** The fixture reads its file every call and rewrites it on mutation, so there is
     *  nothing cached and nothing to invalidate. */
    invalidate() { }
    constructor(cfg, file) {
        this.cfg = cfg;
        this.file = file;
        if (!existsSync(file)) {
            throw new AppError('not-found', `Fixture ${file} does not exist.`, 'Pass --fixture <path-to-json> or drop the flag to use the real bd CLI.');
        }
    }
    read() {
        const doc = JSON.parse(readFileSync(this.file, 'utf8'));
        const beads = Array.isArray(doc.beads) ? doc.beads : [];
        return {
            beads,
            ready: Array.isArray(doc.ready) ? doc.ready : undefined,
            deps: Array.isArray(doc.deps) ? doc.deps : undefined,
        };
    }
    async health() {
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
    async allBeads() {
        return normalizeBeads(this.read().beads);
    }
    async readyIds() {
        const { ready } = this.read();
        return ready ? new Set(ready) : null;
    }
    async deps(beads) {
        const { deps } = this.read();
        return dedupeDeps([...(deps ? depsFromDepList(deps) : []), ...beads.flatMap(depsFromBead)]);
    }
    async purgePreview(sessionId, mode, sessionBeads, allBeads) {
        const derived = derivePreview(sessionId, sessionBeads, allBeads.filter(isOpen), mode);
        return {
            ...derived,
            estimatedBytes: derived.deletable.length * 4096,
            backupConfigured: false,
            raw: `[fixture] ${mode} --dry-run --label ${sessionId}\n${derived.deletable.length} deletable, ${derived.keptOpen.length} open, ${derived.keptReferenced.length} referenced`,
        };
    }
    async purgeExecute(sessionId, req, sessionBeads, allBeads, onStep) {
        const derived = derivePreview(sessionId, sessionBeads, allBeads.filter(isOpen), req.mode);
        const doomed = new Set([
            ...derived.deletable.map((c) => c.id),
            ...(req.ignoreReferences ? derived.keptReferenced.map((c) => c.id) : []),
        ]);
        const steps = [];
        const step = (name, detail) => {
            const s = { name, ok: true, detail };
            steps.push(s);
            onStep(s);
        };
        step('dry-run', `${doomed.size} to delete`);
        const doc = JSON.parse(readFileSync(this.file, 'utf8'));
        const before = JSON.stringify(doc).length;
        doc.beads = doc.beads.filter((b) => !doomed.has(String(b.id ?? '')));
        if (Array.isArray(doc.deps)) {
            doc.deps = doc.deps.filter((d) => !doomed.has(String(d.issue_id ?? '')) && !doomed.has(String(d.depends_on_id ?? '')));
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
export function createBackend(cfg) {
    return cfg.fixture ? new FixtureBackend(cfg, cfg.fixture) : new BdBackend(cfg);
}
//# sourceMappingURL=backend.js.map