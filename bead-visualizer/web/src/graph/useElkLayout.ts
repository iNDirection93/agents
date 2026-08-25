import { useEffect, useRef, useState } from 'react';
import ElkConstructor, { type ELK as ElkEngine } from 'elkjs/lib/elk-api.js';
import type { BeadEdge, BeadNode } from '@beadviz/contract';
import { ELK_OPTIONS, NODE_H, NODE_W, layoutEdges } from './layoutOptions.js';

export interface Positioned {
  positions: Map<string, { x: number; y: number }>;
  /** The layout these positions belong to, so a stale reply is ignorable. */
  key: string;
  pending: boolean;
  error: string | null;
}

const EMPTY: Positioned = { positions: new Map(), key: '', pending: false, error: null };

type ElkCtor = new (options: { workerFactory: (url?: string) => unknown }) => ElkEngine;

/** elk-api is CJS; the default export lands under `.default` in a production build. */
function elkConstructor(): ElkCtor {
  const bag = ElkConstructor as unknown as { default?: ElkCtor };
  return (bag.default ?? (ElkConstructor as unknown as ElkCtor)) as ElkCtor;
}

/**
 * Runs elk in a worker and hands back positions.
 *
 * Two properties matter more than they look. The request id guards against
 * out-of-order replies — agents write in bursts, so two layouts can genuinely be in
 * flight. And the layout key is derived from structure only, so a status change on
 * a bead repaints without moving anything: a graph that reshuffles every time an
 * agent touches a bead is unusable to watch.
 */
export function useElkLayout(nodes: BeadNode[], edges: BeadEdge[]): Positioned {
  const [state, setState] = useState<Positioned>(EMPTY);
  const elkRef = useRef<ElkEngine | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const requestId = useRef(0);

  useEffect(() => {
    try {
      const Elk = elkConstructor();
      elkRef.current = new Elk({
        workerFactory: () => {
          const worker = new Worker(new URL('./elk.worker.ts', import.meta.url), { type: 'module' });
          workerRef.current = worker;
          return worker;
        },
      });
    } catch (e) {
      setState((prev) => ({ ...prev, error: e instanceof Error ? e.message : String(e) }));
    }
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
      elkRef.current = null;
    };
  }, []);

  const key = structureKey(nodes, edges);

  useEffect(() => {
    const elk = elkRef.current;
    if (!elk || nodes.length === 0) {
      setState({ positions: new Map(), key, pending: false, error: null });
      return;
    }

    const id = ++requestId.current;
    setState((prev) => ({ ...prev, key, pending: true }));

    elk
      .layout({
        id: 'root',
        layoutOptions: ELK_OPTIONS,
        children: nodes.map((n) => ({ id: n.id, width: NODE_W, height: NODE_H })),
        edges: layoutEdges(edges).map((e) => ({ id: e.id, sources: [e.source], targets: [e.target] })),
      })
      .then((laid) => {
        if (id !== requestId.current) return;
        setState({
          key,
          pending: false,
          error: null,
          positions: new Map((laid.children ?? []).map((c) => [c.id, { x: c.x ?? 0, y: c.y ?? 0 }])),
        });
      })
      .catch((e: unknown) => {
        if (id !== requestId.current) return;
        setState((prev) => ({ ...prev, pending: false, error: e instanceof Error ? e.message : String(e) }));
      });
    // `key` is the structural fingerprint; the node and edge arrays are new objects
    // on every refetch even when nothing moved.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return state;
}

function structureKey(nodes: BeadNode[], edges: BeadEdge[]): string {
  const ids = nodes.map((n) => n.id).sort().join(',');
  const links = edges.map((e) => e.id).sort().join(',');
  return `${nodes.length}:${ids}|${edges.length}:${links}`;
}
