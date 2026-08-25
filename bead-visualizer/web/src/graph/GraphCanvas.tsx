import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Background, BackgroundVariant, Controls, ReactFlow, ReactFlowProvider,
  useReactFlow, type Edge, type Node,
} from '@xyflow/react';
import '@xyflow/react/dist/base.css';
import type { GraphPayload } from '@beadviz/contract';
import { NeonDefs } from './NeonDefs.js';
import { BeadNodeView, type BeadNodeData } from './BeadNodeView.js';
import { NeonEdge, type NeonEdgeData } from './NeonEdge.js';
import { HighlightStore } from './highlightStore.js';
import { buildTopology, chainOf, edgesWithin } from './topology.js';
import { useElkLayout } from './useElkLayout.js';
import { NODE_H, NODE_W } from './layoutOptions.js';
import type { AvatarResolver } from '../api/useAvatars.js';

const nodeTypes = { bead: BeadNodeView };
const edgeTypes = { neon: NeonEdge };

/** ~40ms per rank, so a full power-on lands around 600ms on a typical session. */
const RANK_STAGGER_MS = 40;

export interface GraphCanvasProps {
  graph: GraphPayload;
  avatars: AvatarResolver;
  selectedBead: string | null;
  onSelectBead: (id: string | null) => void;
  reducedMotion: boolean;
  /** Bumped when the session changes, to re-run the power-on sequence. */
  powerOnKey: string;
}

function GraphCanvasInner(props: GraphCanvasProps): JSX.Element {
  const { graph, avatars, selectedBead, onSelectBead, reducedMotion } = props;
  const store = useMemo(() => new HighlightStore(), []);
  const topo = useMemo(() => buildTopology(graph.nodes, graph.edges), [graph.nodes, graph.edges]);
  const layout = useElkLayout(graph.nodes, graph.edges);
  const { fitView } = useReactFlow();
  const [hovered, setHovered] = useState<string | null>(null);
  const [powering, setPowering] = useState(false);
  const fittedKey = useRef<string>('');

  /* Highlight: the hovered or selected bead's whole transitive chain. */
  useEffect(() => {
    const focus = hovered ?? selectedBead;
    const lit = focus ? chainOf(topo, focus) : new Set<string>();
    store.apply({
      hovered,
      selected: selectedBead,
      lit,
      litEdges: focus ? edgesWithin(graph.edges, lit) : new Set<string>(),
      allNodes: graph.nodes.map((n) => n.id),
      allEdges: graph.edges.map((e) => e.id),
    });
  }, [hovered, selectedBead, topo, graph.nodes, graph.edges, store]);

  /* Selecting a session powers the sign on: current flows in topological order. */
  useEffect(() => {
    if (reducedMotion || graph.nodes.length === 0) {
      setPowering(false);
      return;
    }
    setPowering(true);
    const maxRank = Math.max(0, ...[...topo.rank.values()]);
    const timer = window.setTimeout(() => setPowering(false), maxRank * RANK_STAGGER_MS + 500);
    return () => window.clearTimeout(timer);
  }, [props.powerOnKey, reducedMotion, graph.nodes.length, topo.rank]);

  /* Fit once per layout, not on every repaint — refitting under the user is rude. */
  useEffect(() => {
    if (layout.pending || layout.positions.size === 0 || fittedKey.current === layout.key) return;
    fittedKey.current = layout.key;
    const timer = window.setTimeout(() => fitView({ padding: 0.18, duration: reducedMotion ? 0 : 320, maxZoom: 1.1 }), 30);
    return () => window.clearTimeout(timer);
  }, [layout.key, layout.pending, layout.positions.size, fitView, reducedMotion]);

  const handleHover = useCallback((id: string | null) => setHovered(id), []);
  const handleSelect = useCallback((id: string) => onSelectBead(id), [onSelectBead]);

  const nodes: Node[] = useMemo(() => {
    // Tab order follows the topological order, so the keyboard walks the graph the
    // way it reads: frontier first, then what unblocks next.
    const rankOf = (id: string): number => topo.rank.get(id) ?? 0;
    const ordered = [...graph.nodes].sort(
      (a, b) => rankOf(a.id) - rankOf(b.id) || topo.order.indexOf(a.id) - topo.order.indexOf(b.id),
    );

    return ordered.map((bead) => {
      const position = layout.positions.get(bead.id) ?? { x: 0, y: 0 };
      const data: BeadNodeData = {
        bead,
        avatarSrc: avatars.src(bead.agent),
        avatarLabel: avatars.label(bead.agent),
        hue: avatars.hue(bead.agent),
        gateName: bead.gateName,
        powerDelayMs: rankOf(bead.id) * RANK_STAGGER_MS,
        motion: !reducedMotion,
        store,
        onHover: handleHover,
        onSelect: handleSelect,
      };
      return {
        id: bead.id,
        type: 'bead',
        position,
        data,
        draggable: false,
        selectable: false,
        focusable: false,
        width: NODE_W,
        height: NODE_H,
      };
    });
  }, [graph.nodes, layout.positions, avatars, reducedMotion, store, topo, handleHover, handleSelect]);

  const edges: Edge[] = useMemo(() => {
    const statusOf = new Map(graph.nodes.map((n) => [n.id, n.status]));
    const rankOf = (id: string): number => topo.rank.get(id) ?? 0;
    return graph.edges.map((edge) => {
      const data: NeonEdgeData = {
        kind: edge.kind,
        satisfied: edge.satisfied,
        sourceStatus: statusOf.get(edge.source) ?? 'backlog',
        powerDelayMs: rankOf(edge.source) * RANK_STAGGER_MS + 120,
        store,
      };
      return { id: edge.id, source: edge.source, target: edge.target, type: 'neon', data, interactionWidth: 0 };
    });
  }, [graph.edges, graph.nodes, store, topo]);

  return (
    <div className={`flow-root${powering ? ' powering' : ''}`}>
      <NeonDefs />
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onPaneClick={() => onSelectBead(null)}
        /*
         * These three are load-bearing beyond what they do. React Flow decides a
         * node needs pointer events only if it is selectable, draggable, or has one
         * of these handlers — otherwise it sets `pointer-events: none` inline and
         * the pane swallows every click on a node. The node's own button handles
         * the tooltip and the keyboard; these keep the mouse reaching it.
         */
        onNodeMouseEnter={(_, node) => handleHover(node.id)}
        onNodeMouseLeave={() => handleHover(null)}
        onNodeClick={(_, node) => handleSelect(node.id)}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        nodesFocusable={false}
        edgesFocusable={false}
        panOnScroll
        minZoom={0.15}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={28} size={1} color="rgba(180,124,255,0.10)" />
        <Controls showInteractive={false} position="bottom-right" />
      </ReactFlow>
      {layout.pending && graph.nodes.length > 24 && (
        <div className="layout-pending" role="status">laying out {graph.nodes.length} beads…</div>
      )}
      {layout.error && (
        <div className="layout-pending layout-pending--error" role="alert">
          Layout failed: {layout.error}
        </div>
      )}
      <div className="vignette" />
    </div>
  );
}

export function GraphCanvas(props: GraphCanvasProps): JSX.Element {
  return (
    <ReactFlowProvider>
      <GraphCanvasInner {...props} />
    </ReactFlowProvider>
  );
}
