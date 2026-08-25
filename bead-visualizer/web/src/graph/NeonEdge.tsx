import { memo } from 'react';
import { getBezierPath, type EdgeProps } from '@xyflow/react';
import { RANKING_EDGE_KINDS, type EdgeKind, type Status } from '@beadviz/contract';
import { useEdgeLit, useNodeEmphasis, type HighlightStore } from './highlightStore.js';

export interface NeonEdgeData extends Record<string, unknown> {
  kind: EdgeKind;
  satisfied: boolean;
  sourceStatus: Status;
  powerDelayMs: number;
  store: HighlightStore;
}

const STATUS_VAR: Record<Status, string> = {
  backlog: 'var(--tube-off)',
  ready: 'var(--glow-lime)',
  in_progress: 'var(--glow-amber)',
  blocked: 'var(--glow-magenta)',
  done: 'var(--glow-ice)',
};

/**
 * Four visual classes, and the distinction that carries the most weight is
 * satisfied vs. unsatisfied: a dependency from a closed bead is structurally
 * present and functionally spent, and drawing the two alike is the fastest way to
 * make the graph unreadable (§3).
 *
 * Cubic bezier, never orthogonal — right angles would kill the tubing metaphor.
 */
function NeonEdgeInner(props: EdgeProps): JSX.Element {
  const { id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition } = props;
  const data = props.data as NeonEdgeData;
  const [path] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition });

  const lit = useEdgeLit(data.store, id);
  // An edge whose ends are both dimmed recedes with them.
  const sourceEmphasis = useNodeEmphasis(data.store, props.source);
  const targetEmphasis = useNodeEmphasis(data.store, props.target);
  const dimmed = sourceEmphasis === 'dimmed' && targetEmphasis === 'dimmed';

  const spent = data.satisfied && data.kind === 'blocks';
  const stroke =
    data.kind === 'blocks' && !data.satisfied
      ? STATUS_VAR[data.sourceStatus]
      : undefined;

  const classes = [
    'edge',
    `edge--${data.kind}`,
    spent ? 'edge--spent' : '',
    lit ? 'edge--highlit' : '',
    RANKING_EDGE_KINDS.includes(data.kind) ? 'edge--animatable' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <g
      className={classes}
      data-emphasis={dimmed ? 'dimmed' : 'none'}
      style={{ '--power-delay': `${data.powerDelayMs}ms` } as React.CSSProperties}
    >
      <path className="edge-glow" d={path} style={stroke ? { stroke } : undefined} />
      <path className="edge-core" d={path} style={stroke ? { stroke } : undefined} />
      <path className="edge-hit" d={path} />
    </g>
  );
}

export const NeonEdge = memo(NeonEdgeInner);
