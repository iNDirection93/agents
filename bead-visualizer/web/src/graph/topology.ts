import { RANKING_EDGE_KINDS, type BeadEdge, type BeadNode, type EdgeKind } from '@beadviz/contract';

/** Only these shape the hierarchy; `related` and `discovered-from` are informational (§3). */
const STRUCTURAL: ReadonlySet<EdgeKind> = new Set<EdgeKind>(RANKING_EDGE_KINDS);

export interface Topology {
  /** blocker → blocked, structural edges only. */
  out: Map<string, string[]>;
  /** blocked → blocker. */
  in: Map<string, string[]>;
  /** Every neighbour including informational edges, for the hover highlight. */
  touching: Map<string, string[]>;
  /** Longest-path rank; drives the power-on stagger and the Tab order. */
  rank: Map<string, number>;
  /** Node ids in topological order, so Tab walks the graph the way it reads. */
  order: string[];
}

export function buildTopology(nodes: BeadNode[], edges: BeadEdge[]): Topology {
  const out = new Map<string, string[]>();
  const inc = new Map<string, string[]>();
  const touching = new Map<string, string[]>();
  const ids = new Set(nodes.map((n) => n.id));

  const push = (m: Map<string, string[]>, k: string, v: string): void => {
    const list = m.get(k);
    if (list) list.push(v);
    else m.set(k, [v]);
  };

  for (const e of edges) {
    if (!ids.has(e.source) || !ids.has(e.target)) continue;
    push(touching, e.source, e.target);
    push(touching, e.target, e.source);
    if (!STRUCTURAL.has(e.kind)) continue;
    push(out, e.source, e.target);
    push(inc, e.target, e.source);
  }

  return { out, in: inc, touching, ...rankAndOrder(nodes, out, inc) };
}

/**
 * Kahn's algorithm, with the leftovers appended when the graph is not acyclic.
 * A dependency cycle is a bug in the beads, but it must not hang the layout — the
 * graph still has to render so you can *see* the cycle.
 */
function rankAndOrder(
  nodes: BeadNode[],
  out: Map<string, string[]>,
  inc: Map<string, string[]>,
): { rank: Map<string, number>; order: string[] } {
  const indegree = new Map<string, number>();
  for (const n of nodes) indegree.set(n.id, (inc.get(n.id) ?? []).length);

  const rank = new Map<string, number>();
  const order: string[] = [];
  let frontier = nodes.filter((n) => (indegree.get(n.id) ?? 0) === 0).map((n) => n.id);
  for (const id of frontier) rank.set(id, 0);

  while (frontier.length > 0) {
    const next: string[] = [];
    for (const id of frontier) {
      order.push(id);
      for (const child of out.get(id) ?? []) {
        const left = (indegree.get(child) ?? 0) - 1;
        indegree.set(child, left);
        rank.set(child, Math.max(rank.get(child) ?? 0, (rank.get(id) ?? 0) + 1));
        if (left === 0) next.push(child);
      }
    }
    frontier = next;
  }

  for (const n of nodes) {
    if (!rank.has(n.id)) {
      rank.set(n.id, 0);
      order.push(n.id);
    }
  }
  return { rank, order };
}

export type Direction = 'up' | 'down';

/** Everything this bead is waiting on, or everything waiting on it — transitively. */
export function reach(topo: Topology, start: string, direction: Direction): Set<string> {
  const adjacency = direction === 'up' ? topo.in : topo.out;
  const seen = new Set<string>();
  const stack = [...(adjacency.get(start) ?? [])];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const next of adjacency.get(id) ?? []) {
      if (!seen.has(next)) stack.push(next);
    }
  }
  return seen;
}

/**
 * The set a hover or focus lights up: the bead, its whole transitive chain in both
 * directions, and its immediate informational neighbours. That is the question you
 * are actually asking — *what is this waiting on, and what is waiting on it?*
 */
export function chainOf(topo: Topology, id: string): Set<string> {
  const set = new Set<string>([id]);
  for (const up of reach(topo, id, 'up')) set.add(up);
  for (const down of reach(topo, id, 'down')) set.add(down);
  for (const near of topo.touching.get(id) ?? []) set.add(near);
  return set;
}

/** Edges with both ends inside the highlighted set. */
export function edgesWithin(edges: BeadEdge[], within: Set<string>): Set<string> {
  const out = new Set<string>();
  for (const e of edges) {
    if (within.has(e.source) && within.has(e.target)) out.add(e.id);
  }
  return out;
}
