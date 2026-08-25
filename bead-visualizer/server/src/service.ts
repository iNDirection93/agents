import type {
  BeadDetail, GraphPayload, HealthPayload, PurgeExecuteRequest, PurgeMode, PurgePreview,
  PurgeResult, PurgeStep, SessionSummary,
} from '@beadviz/contract';
import type { AppConfig } from './config.js';
import { AppError } from './errors.js';
import type { Backend } from './backend.js';
import { LabelReader, groupBySession } from './bd/labels.js';
import { buildDetail, buildGraph, buildSessions } from './bd/build.js';
import type { Bead } from './bd/normalize.js';

/**
 * The whole of the app's logic, which is deliberately not much: fetch, group,
 * build, return. `bd` stays the single source of truth (§1.1) — nothing here
 * caches beads or writes anything back.
 */
export class BeadService {
  private readonly reader: LabelReader;

  constructor(private readonly cfg: AppConfig, private readonly backend: Backend) {
    this.reader = new LabelReader(cfg);
  }

  get source(): 'bd' | 'fixture' {
    return this.backend.source;
  }

  health(): Promise<HealthPayload> {
    return this.backend.health();
  }

  async sessions(): Promise<SessionSummary[]> {
    return buildSessions(await this.backend.allBeads(), this.reader);
  }

  async graph(sessionId: string): Promise<GraphPayload> {
    const all = await this.backend.allBeads();
    const members = groupBySession(all, this.reader).get(sessionId);
    if (!members || members.length === 0) {
      // A session that has just been retired is gone, not broken — say which.
      throw new AppError(
        'not-found',
        `No beads carry the label \`${sessionId}\`.`,
        'Refresh the session list; a retired session disappears once its beads are deleted.',
      );
    }

    const [readyIds, deps] = await Promise.all([this.backend.readyIds(), this.backend.deps(all)]);
    const warnings: string[] = [];
    if (!readyIds) warnings.push('`bd ready` was unavailable — readiness is derived from open blockers, which can differ on unusual dependency types.');

    return buildGraph({ sessionId, beads: members, deps, readyIds, reader: this.reader, warnings });
  }

  async bead(beadId: string): Promise<BeadDetail> {
    const all = await this.backend.allBeads();
    const bead = all.find((b) => b.id === beadId);
    if (!bead) {
      throw new AppError('not-found', `No bead ${beadId} in this database.`, 'Check the ID, or refresh — it may have been pruned.');
    }
    const [readyIds, deps] = await Promise.all([this.backend.readyIds(), this.backend.deps(all)]);
    return buildDetail(bead, all, deps, this.reader, readyIds);
  }

  async purgePreview(sessionId: string, mode: PurgeMode): Promise<PurgePreview> {
    const { members, all } = await this.sessionBeads(sessionId);
    return this.backend.purgePreview(sessionId, mode, members, all);
  }

  async purgeExecute(
    sessionId: string,
    req: PurgeExecuteRequest,
    onStep: (s: PurgeStep) => void,
  ): Promise<PurgeResult> {
    const { members, all } = await this.sessionBeads(sessionId);
    return this.backend.purgeExecute(sessionId, req, members, all, onStep);
  }

  private async sessionBeads(sessionId: string): Promise<{ members: Bead[]; all: Bead[] }> {
    const all = await this.backend.allBeads();
    const members = groupBySession(all, this.reader).get(sessionId) ?? [];
    if (members.length === 0) {
      throw new AppError('not-found', `No beads carry the label \`${sessionId}\`.`, 'Refresh the session list.');
    }
    return { members, all };
  }
}
