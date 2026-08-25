import type { EdgeKind } from '@beadviz/contract';
import { isPlainObject, pick, pickString } from './envelope.js';
import type { Bead } from './normalize.js';

/**
 * Dependency extraction, from two sources that are merged and de-duplicated:
 * a whole-graph `bd dep list --json`, and the fields embedded in each bead record.
 * Either alone has been enough in some `bd` versions and not others; taking both
 * and de-duplicating costs nothing and means an output-format change degrades to
 * "one source went quiet" rather than "the graph lost its edges".
 *
 * Canonical direction throughout: **source blocks target**.
 */
export interface DepEdge {
  source: string;
  target: string;
  kind: EdgeKind;
}

const KIND_ALIASES: Record<string, EdgeKind> = {
  blocks: 'blocks', blocked_by: 'blocks', 'blocked-by': 'blocks', blocker: 'blocks',
  depends_on: 'blocks', 'depends-on': 'blocks', dependency: 'blocks', hard: 'blocks',
  'parent-child': 'parent-child', parent_child: 'parent-child', parent: 'parent-child',
  child: 'parent-child', subtask: 'parent-child', epic: 'parent-child', contains: 'parent-child',
  'discovered-from': 'discovered-from', discovered_from: 'discovered-from', discovered: 'discovered-from',
  related: 'related', 'relates-to': 'related', relates_to: 'related', see_also: 'related', soft: 'related',
};

export function normalizeKind(value: unknown): EdgeKind {
  if (typeof value !== 'string') return 'blocks';
  return KIND_ALIASES[value.trim().toLowerCase().replace(/\s+/g, '_')] ?? 'blocks';
}

/**
 * A record from `bd dep list --json`.
 *
 * `issue_id` / `depends_on_id` is unambiguous and preferred. The `from`/`to`
 * fallback follows the CLI's own argument order — `bd dep add <blocked> <blocker>`
 * — so `from` is the blocked bead. If a future `bd` reverses that, this is the
 * single line to change.
 */
export function depFromRecord(rec: Record<string, unknown>): DepEdge | null {
  const kind = normalizeKind(pick(rec, 'type', 'kind', 'dep_type', 'relation'));

  const blocked = pickString(rec, 'issue_id', 'issue', 'blocked_id', 'from', 'from_id', 'source_id', 'child_id');
  const blocker = pickString(rec, 'depends_on_id', 'depends_on', 'dependency_id', 'blocker_id', 'to', 'to_id', 'target_id', 'parent_id');
  if (!blocked || !blocker || blocked === blocker) return null;

  // parent-child records name the parent, which is the blocker end of the pair.
  return { source: blocker, target: blocked, kind };
}

export function depsFromDepList(records: Record<string, unknown>[]): DepEdge[] {
  return records.map(depFromRecord).filter((d): d is DepEdge => d !== null);
}

/** Field name → how it reads relative to the bead that carries it. */
const EMBEDDED: Array<{ names: string[]; kind: EdgeKind; beadIs: 'target' | 'source' }> = [
  { names: ['blocked_by', 'blockedBy', 'dependencies', 'depends_on', 'blockers'], kind: 'blocks', beadIs: 'target' },
  { names: ['blocks', 'dependents', 'blocking'], kind: 'blocks', beadIs: 'source' },
  { names: ['parent', 'parent_id', 'epic', 'parent_issue'], kind: 'parent-child', beadIs: 'target' },
  { names: ['children', 'subtasks', 'child_ids'], kind: 'parent-child', beadIs: 'source' },
  { names: ['discovered_from', 'discoveredFrom'], kind: 'discovered-from', beadIs: 'target' },
  { names: ['discovered', 'discoveries'], kind: 'discovered-from', beadIs: 'source' },
  { names: ['related', 'related_to', 'see_also'], kind: 'related', beadIs: 'source' },
];

export function depsFromBead(bead: Bead): DepEdge[] {
  const out: DepEdge[] = [];
  for (const spec of EMBEDDED) {
    for (const other of idsFrom(pick(bead.raw, ...spec.names))) {
      if (other === bead.id) continue;
      out.push(
        spec.beadIs === 'target'
          ? { source: other, target: bead.id, kind: spec.kind }
          : { source: bead.id, target: other, kind: spec.kind },
      );
    }
  }
  // A `dependencies: [{id, type}]` list carries its own kinds; re-read them.
  for (const entry of arrayOf(pick(bead.raw, 'dependencies', 'deps'))) {
    if (!isPlainObject(entry)) continue;
    const other = pickString(entry, 'id', 'issue_id', 'depends_on_id', 'target');
    if (!other || other === bead.id) continue;
    out.push({ source: other, target: bead.id, kind: normalizeKind(pick(entry, 'type', 'kind')) });
  }
  return out;
}

function arrayOf(v: unknown): unknown[] {
  if (Array.isArray(v)) return v;
  if (v === undefined || v === null) return [];
  return [v];
}

function idsFrom(v: unknown): string[] {
  return arrayOf(v)
    .map((item) => {
      if (typeof item === 'string') return item.trim();
      if (typeof item === 'number') return String(item);
      if (isPlainObject(item)) return pickString(item, 'id', 'issue_id', 'depends_on_id', 'target', 'key');
      return null;
    })
    .filter((s): s is string => !!s && s.length > 0);
}

/**
 * De-duplicate. `related` is symmetric, so a↔b and b↔a are one edge; everything
 * else is directed. Without this, a graph that reports deps from both ends draws
 * every edge twice and elk ranks it as though the constraint were doubled.
 */
export function dedupeDeps(deps: DepEdge[]): DepEdge[] {
  const seen = new Map<string, DepEdge>();
  for (const d of deps) {
    const key =
      d.kind === 'related'
        ? `related:${[d.source, d.target].sort().join('~')}`
        : `${d.kind}:${d.source}->${d.target}`;
    if (!seen.has(key)) seen.set(key, d);
  }
  return [...seen.values()];
}

/** Edges pointing outside the session would be phantom nodes in the layout. */
export function confineToNodes(deps: DepEdge[], ids: Set<string>): DepEdge[] {
  return deps.filter((d) => ids.has(d.source) && ids.has(d.target));
}

export function edgeId(d: DepEdge): string {
  return `${d.kind}:${d.source}->${d.target}`;
}
