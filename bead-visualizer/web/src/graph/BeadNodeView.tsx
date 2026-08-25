import { memo, useEffect, useRef, useState } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { BeadNode } from '@beadviz/contract';
import { useNodeEmphasis, type HighlightStore } from './highlightStore.js';

export interface BeadNodeData extends Record<string, unknown> {
  bead: BeadNode;
  avatarSrc: string;
  avatarLabel: string;
  hue: string | null;
  gateName: string | null;
  powerDelayMs: number;
  motion: boolean;
  store: HighlightStore;
  onHover: (id: string | null) => void;
  onSelect: (id: string) => void;
}

const STATUS_WORDS: Record<BeadNode['status'], string> = {
  backlog: 'backlog',
  ready: 'ready',
  in_progress: 'in progress',
  blocked: 'blocked',
  done: 'done',
};

const HEX_POINTS = '32,3 57,17.5 57,46.5 32,61 7,46.5 7,17.5';
const HEX_POINTS_INNER = '32,7 53.5,19.5 53.5,44.5 32,57 10.5,44.5 10.5,19.5';

/**
 * The node: a ring, an avatar clipped to it, and an always-visible ID caption.
 * Hover adds the title and status; focus does exactly the same thing, because a
 * hover-only affordance does not exist for a keyboard or a touchscreen.
 */
function BeadNodeViewInner({ data }: NodeProps): JSX.Element {
  const d = data as BeadNodeData;
  const { bead } = d;
  const emphasis = useNodeEmphasis(d.store, bead.id);
  const [focused, setFocused] = useState(false);
  const [tipVisible, setTipVisible] = useState(false);
  const hoverTimer = useRef<number | null>(null);

  useEffect(() => () => {
    if (hoverTimer.current !== null) window.clearTimeout(hoverTimer.current);
  }, []);

  const showTip = (immediate: boolean): void => {
    if (immediate) {
      setTipVisible(true);
      return;
    }
    hoverTimer.current = window.setTimeout(() => setTipVisible(true), 200);
  };
  const hideTip = (): void => {
    if (hoverTimer.current !== null) window.clearTimeout(hoverTimer.current);
    hoverTimer.current = null;
    setTipVisible(false);
  };

  const gateLabel = (d.gateName ?? 'GATE').toUpperCase().slice(0, 11);
  const blockerNote =
    bead.openBlockerCount > 0
      ? `${bead.openBlockerCount} open blocker${bead.openBlockerCount === 1 ? '' : 's'}`
      : 'no open blockers';
  const ariaLabel = `${bead.id}. ${bead.title}. ${STATUS_WORDS[bead.status]}, ${blockerNote}.${
    bead.agent ? ` Agent ${d.avatarLabel}.` : ''
  }${bead.isGate ? ' Gate.' : ''}`;

  return (
    <div
      className="bead"
      data-status={bead.status}
      data-gate={bead.isGate}
      data-emphasis={emphasis}
      data-focused={focused}
      data-hued={d.hue !== null}
      data-motion={d.motion ? 'on' : 'off'}
      style={
        {
          '--power-delay': `${d.powerDelayMs}ms`,
          ...(d.hue ? { '--agent-hue': d.hue } : {}),
        } as React.CSSProperties
      }
    >
      <Handle type="target" position={Position.Left} isConnectable={false} />

      <div className="bead__figure">
        <div className="bead__halo" />
        <svg className="bead__svg" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
          {bead.isGate ? (
            <>
              <polygon className="bead__plate" points={HEX_POINTS} />
              <polygon className="bead__ring" points={HEX_POINTS} />
              {d.hue && <polygon className="bead__agent-ring" points={HEX_POINTS_INNER} />}
              {/* textLength compresses rather than truncates: FOUNDATION must stay readable. */}
              <text className="bead__gate-label" x="32" y="36" textLength={gateLabel.length > 6 ? 40 : undefined} lengthAdjust="spacingAndGlyphs">
                {gateLabel}
              </text>
            </>
          ) : (
            <>
              <circle className="bead__plate" cx="32" cy="32" r="29" />
              <image
                className="bead__avatar"
                href={d.avatarSrc}
                x="4"
                y="4"
                width="56"
                height="56"
                preserveAspectRatio="xMidYMid slice"
              />
              <circle className="bead__ring" cx="32" cy="32" r="29" />
              {d.hue && <circle className="bead__agent-ring" cx="32" cy="32" r="25.5" />}
              {/* Blocked carries hard-edged inner notches, so colour is never the only signal. */}
              <g className="bead__notches">
                <line x1="32" y1="5" x2="32" y2="11" />
                <line x1="59" y1="32" x2="53" y2="32" />
                <line x1="32" y1="59" x2="32" y2="53" />
                <line x1="5" y1="32" x2="11" y2="32" />
              </g>
            </>
          )}
        </svg>
      </div>

      <div className="bead__id">{bead.id}</div>

      <button
        type="button"
        className="bead__hit"
        aria-label={ariaLabel}
        onMouseEnter={() => {
          d.onHover(bead.id);
          showTip(false);
        }}
        onMouseLeave={() => {
          d.onHover(null);
          hideTip();
        }}
        onFocus={() => {
          setFocused(true);
          d.onHover(bead.id);
          showTip(true);
        }}
        onBlur={() => {
          setFocused(false);
          d.onHover(null);
          hideTip();
        }}
        onClick={() => d.onSelect(bead.id)}
      />

      {(tipVisible || focused) && (
        <div className="bead__tip" role="tooltip">
          <div className="bead__tip-title">{bead.title}</div>
          <div className="bead__tip-meta">
            <span className="bead__tip-status">{STATUS_WORDS[bead.status].toUpperCase()}</span>
            <span>{d.avatarLabel}</span>
            {bead.openBlockerCount > 0 && <span>{bead.openBlockerCount} blocking</span>}
          </div>
        </div>
      )}

      <Handle type="source" position={Position.Right} isConnectable={false} />
    </div>
  );
}

export const BeadNodeView = memo(BeadNodeViewInner);
