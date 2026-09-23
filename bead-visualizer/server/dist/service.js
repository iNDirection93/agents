import { AppError } from './errors.js';
import { LabelReader, groupBySession } from './bd/labels.js';
import { buildDetail, buildGraph, buildSessions } from './bd/build.js';
/**
 * The whole of the app's logic, which is deliberately not much: fetch, group,
 * build, return. `bd` stays the single source of truth (§1.1); the backend keeps a
 * short-lived read snapshot for speed but drops it on every change the `.beads/`
 * watcher reports, so what we serve is never staler than the last write.
 */
export class BeadService {
    cfg;
    backend;
    reader;
    constructor(cfg, backend) {
        this.cfg = cfg;
        this.backend = backend;
        this.reader = new LabelReader(cfg);
    }
    get source() {
        return this.backend.source;
    }
    /** Force the next read to re-spawn bd — backs the manual "rescan" button. */
    invalidate() {
        this.backend.invalidate();
    }
    health() {
        return this.backend.health();
    }
    async sessions() {
        return buildSessions(await this.backend.allBeads(), this.reader);
    }
    async graph(sessionId) {
        // One bd invocation, then work in memory. Concurrent bd calls contend on the
        // embedded Dolt store lock (measurably *slower* than serial), and deps() no
        // longer spawns a process, so there is nothing to parallelize.
        const all = await this.backend.allBeads();
        const members = groupBySession(all, this.reader).get(sessionId);
        if (!members || members.length === 0) {
            // A session that has just been retired is gone, not broken — say which.
            throw new AppError('not-found', `No beads carry the label \`${sessionId}\`.`, 'Refresh the session list; a retired session disappears once its beads are deleted.');
        }
        const [readyIds, deps] = await Promise.all([this.backend.readyIds(), this.backend.deps(all)]);
        const warnings = [];
        if (!readyIds)
            warnings.push('`bd ready` was unavailable — readiness is derived from open blockers, which can differ on unusual dependency types.');
        return buildGraph({ sessionId, beads: members, deps, readyIds, reader: this.reader, warnings });
    }
    async bead(beadId) {
        const all = await this.backend.allBeads();
        const bead = all.find((b) => b.id === beadId);
        if (!bead) {
            throw new AppError('not-found', `No bead ${beadId} in this database.`, 'Check the ID, or refresh — it may have been pruned.');
        }
        const [readyIds, deps] = await Promise.all([this.backend.readyIds(), this.backend.deps(all)]);
        return buildDetail(bead, all, deps, this.reader, readyIds);
    }
    async purgePreview(sessionId, mode) {
        const { members, all } = await this.sessionBeads(sessionId);
        return this.backend.purgePreview(sessionId, mode, members, all);
    }
    async purgeExecute(sessionId, req, onStep) {
        const { members, all } = await this.sessionBeads(sessionId);
        return this.backend.purgeExecute(sessionId, req, members, all, onStep);
    }
    async sessionBeads(sessionId) {
        const all = await this.backend.allBeads();
        const members = groupBySession(all, this.reader).get(sessionId) ?? [];
        if (members.length === 0) {
            throw new AppError('not-found', `No beads carry the label \`${sessionId}\`.`, 'Refresh the session list.');
        }
        return { members, all };
    }
}
//# sourceMappingURL=service.js.map