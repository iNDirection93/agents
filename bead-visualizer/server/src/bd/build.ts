import type {
  BeadDetail, BeadEdge, BeadNode, BeadRef, GraphPayload, SessionSummary, Status,
} from '@beadviz/contract';
import { confineToNodes, dedupeDeps, edgeId, type DepEdge } from './deps.js';
import { LabelReader, groupBySession } from './labels.js';
import { isOpen, toContractStatus, type Bead } from './normalize.js';

/**
 * Pure builders: beads + deps in, wire contract out. No I/O, so the awkward parts
 * — computed `ready`, `satisfied`, blocker counts — are testable without a database.
 */

export interface BuildGraphInput {
  sessionId: string;
  beads: Bead[];
  deps: DepEdge[];
  /**
   * IDs from `bd ready --json`, the canonical implementation of readiness.
   * `null` means that call was unavailable and readiness is derived instead — the
   * UI is told which, because the two disagree on dependency-type semantics.
   */
  readyIds: Set<string> | null;
  reader: LabelReader;
  warnings?: string[];
}

export function buildGraph(input: BuildGraphInput): GraphPayload {
  const { sessionId, beads, reader } = input;
  const ids = new Set(beads.map((b) => b.id));
  const byId = new Map(beads.map((b) => [b.id, b]));
  const deps = confineToNodes(dedupeDeps(input.deps), ids);

  const openBlockers = new Map<string, number>();
  for (const d of deps) {
    if (d.kind !== 'blocks') continue;
    const blocker = byId.get(d.source);
    if (blocker && isOpen(blocker)) {
      openBlockers.set(d.target, (openBlockers.get(d.target) ?? 0) + 1);
    }
  }

  const nodes: BeadNode[] = beads.map((bead) => {
    const openBlockerCount = openBlockers.get(bead.id) ?? 0;
    return {
      id: bead.id,
      title: bead.title,
      status: resolveStatus(bead, openBlockerCount, input.readyIds),
      isGate: reader.isGate(bead),
      gateName: reader.gateNameOf(bead),
      agent: reader.agentOf(bead),
      branch: reader.branchOf(bead),
      priority: bead.priority,
      openBlockerCount,
      updatedAt: bead.updatedAt,
    };
  });

  const edges: BeadEdge[] = deps.map((d) => ({
    id: edgeId(d),
    source: d.source,
    target: d.target,
    kind: d.kind,
    // A dependency from a closed bead is structurally present and functionally spent.
    satisfied: !isOpen(byId.get(d.source)!),
  }));

  const counts: Record<Status, number> = { backlog: 0, ready: 0, in_progress: 0, blocked: 0, done: 0 };
  for (const n of nodes) counts[n.status] += 1;

  return {
    nodes: nodes.sort(byUpdatedDesc),
    edges,
    meta: {
      sessionId,
      label: sessionId,
      counts,
      readySource: input.readyIds ? 'bd-ready' : 'derived',
      branches: distinctBranches(beads, reader),
      warnings: input.warnings ?? [],
      generatedAt: new Date().toISOString(),
    },
  };
}

/**
 * `ready` is computed, never stored (§3): an open bead with nothing open in front
 * of it. `bd ready` is the canonical implementation, so when we have its answer we
 * defer to it entirely rather than second-guessing it from our own edge set.
 */
function resolveStatus(bead: Bead, openBlockerCount: number, readyIds: Set<string> | null): Status {
  const stored = toContractStatus(bead.status);
  if (stored !== 'backlog') return stored;
  if (readyIds) return readyIds.has(bead.id) ? 'ready' : 'backlog';
  return openBlockerCount === 0 ? 'ready' : 'backlog';
}

function byUpdatedDesc(a: BeadNode, b: BeadNode): number {
  return b.updatedAt.localeCompare(a.updatedAt);
}

function distinctBranches(beads: Bead[], reader: LabelReader): string[] {
  const set = new Set<string>();
  for (const b of beads) {
    const branch = reader.branchOf(b);
    if (branch) set.add(branch);
  }
  return [...set].sort();
}

/* --------------------------------------------------------------- sessions */

/**
 * Session discovery is a scan, not a query — there is no `bd sessions` (§1.3).
 * Sorted by most-recent activity: alphabetical order on a hex suffix is noise.
 */
export function buildSessions(beads: Bead[], reader: LabelReader): SessionSummary[] {
  const grouped = groupBySession(beads, reader);
  const out: SessionSummary[] = [];

  for (const [id, members] of grouped) {
    const branches = distinctBranches(members, reader);
    out.push({
      id,
      label: id,
      beadCount: members.length,
      openCount: members.filter(isOpen).length,
      lastActivity: members.reduce((max, b) => (b.updatedAt > max ? b.updatedAt : max), ''),
      branches,
    });
  }
  return out.sort((a, b) => b.lastActivity.localeCompare(a.lastActivity) || a.id.localeCompare(b.id));
}

/* ------------------------------------------------------------------ detail */

export function buildDetail(
  bead: Bead,
  all: Bead[],
  deps: DepEdge[],
  reader: LabelReader,
  readyIds: Set<string> | null,
): BeadDetail {
  const byId = new Map(all.map((b) => [b.id, b]));
  const scoped = dedupeDeps(deps);

  const openBlockerCount = scoped.filter(
    (d) => d.kind === 'blocks' && d.target === bead.id && isOpenId(d.source, byId),
  ).length;

  const refFor = (id: string, kind: DepEdge['kind']): BeadRef | null => {
    const other = byId.get(id);
    if (!other) return null;
    return {
      id,
      title: other.title,
      status: resolveStatus(other, 0, readyIds),
      kind,
    };
  };

  const blockedBy = scoped
    .filter((d) => d.target === bead.id && (d.kind === 'blocks' || d.kind === 'parent-child'))
    .map((d) => refFor(d.source, d.kind))
    .filter((r): r is BeadRef => r !== null);

  const blocks = scoped
    .filter((d) => d.source === bead.id && (d.kind === 'blocks' || d.kind === 'parent-child'))
    .map((d) => refFor(d.target, d.kind))
    .filter((r): r is BeadRef => r !== null);

  const related = scoped
    .filter((d) => (d.kind === 'related' || d.kind === 'discovered-from') && (d.source === bead.id || d.target === bead.id))
    .map((d) => refFor(d.source === bead.id ? d.target : d.source, d.kind))
    .filter((r): r is BeadRef => r !== null);

  return {
    id: bead.id,
    title: bead.title,
    status: resolveStatus(bead, openBlockerCount, readyIds),
    isGate: reader.isGate(bead),
    gateName: reader.gateNameOf(bead),
    agent: reader.agentOf(bead),
    branch: reader.branchOf(bead),
    priority: bead.priority,
    openBlockerCount,
    updatedAt: bead.updatedAt,
    description: bead.description,
    closeReason: bead.closeReason,
    labels: bead.labels,
    createdAt: bead.createdAt,
    closedAt: bead.closedAt,
    blockedBy,
    blocks,
    related,
    comments: bead.comments.map((c) => ({
      author: c.author,
      // Attribution matters on a board that mixes both; the roster is the only signal.
      authorKind: c.author ? (reader.isAgentName(c.author) ? 'agent' : 'human') : 'unknown',
      body: c.body,
      createdAt: c.createdAt,
    })),
  };
}

function isOpenId(id: string, byId: Map<string, Bead>): boolean {
  const b = byId.get(id);
  return !!b && isOpen(b);
}
