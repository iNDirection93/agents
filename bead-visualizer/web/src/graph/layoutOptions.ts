import { RANKING_EDGE_KINDS, type BeadEdge } from '@beadviz/contract';

/**
 * Left-to-right reads as time and causality, which is how a session progresses.
 * Rank 0 is the unblocked frontier.
 */
export const ELK_OPTIONS: Record<string, string> = {
  'elk.algorithm': 'layered',
  'elk.direction': 'RIGHT',
  'elk.layered.spacing.nodeNodeBetweenLayers': '120',
  'elk.spacing.nodeNode': '72',
  'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
  'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
  'elk.edgeRouting': 'SPLINES',
};

/** 64px circle, 88px including the ID caption; the hit area is the full 88×88. */
export const NODE_W = 88;
export const NODE_H = 88;

/**
 * Informational edges are excluded from the layered pass entirely. Ranking on them
 * distorts the hierarchy into nonsense — a `related` link between two unconnected
 * branches will drag one of them across the graph.
 */
export function layoutEdges(edges: BeadEdge[]): BeadEdge[] {
  return edges.filter((e) => RANKING_EDGE_KINDS.includes(e.kind));
}
