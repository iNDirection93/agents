import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import type { BeadDetail } from '@beadviz/contract';
import type { AvatarResolver } from '../api/useAvatars.js';
import { relativeTime } from './SessionSelector.js';

const STATUS_WORDS: Record<BeadDetail['status'], string> = {
  backlog: 'BACKLOG',
  ready: 'READY',
  in_progress: 'IN PROGRESS',
  blocked: 'BLOCKED',
  done: 'DONE',
};

export interface DetailDrawerProps {
  bead: BeadDetail | null;
  loading: boolean;
  avatars: AvatarResolver;
  onClose: () => void;
  onNavigate: (beadId: string) => void;
  /** Focus returns here when the drawer closes. */
  returnFocusTo: HTMLElement | null;
}

/**
 * Slides in over the canvas, which stays interactive. Escape closes it, the canvas
 * closes it, and focus goes back to the node that opened it — a drawer that strands
 * your focus on a closed element is worse than no drawer.
 */
export function DetailDrawer(props: DetailDrawerProps): JSX.Element | null {
  const { bead, avatars } = props;
  const panelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        props.onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [props]);

  useEffect(() => {
    panelRef.current?.focus();
    const target = props.returnFocusTo;
    return () => {
      if (target?.isConnected) target.focus();
    };
    // Only on open: re-focusing on every prop change would fight the user.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!bead && !props.loading) return null;

  return (
    <aside
      className="drawer"
      ref={panelRef}
      tabIndex={-1}
      role="complementary"
      aria-label={bead ? `Details for ${bead.id}` : 'Loading bead details'}
    >
      <div className="drawer__head">
        <div>
          <div className="drawer__id">{bead?.id ?? '…'}</div>
          <h2 className="drawer__title">{bead?.title ?? 'Loading…'}</h2>
        </div>
        <button type="button" className="drawer__close" onClick={props.onClose} aria-label="Close details">
          <X size={16} aria-hidden />
        </button>
      </div>

      {bead && (
        <div className="drawer__body">
          <div className="field">
            <span className="status-pill" data-status={bead.status}>
              {STATUS_WORDS[bead.status]}
            </span>
            {bead.isGate && (
              <span className="status-pill" data-status="backlog" style={{ marginLeft: 8, color: 'var(--glow-violet)' }}>
                GATE
              </span>
            )}
          </div>

          <div className="field">
            <div className="field__label">Agent</div>
            <div className="agent-line">
              <img src={avatars.src(bead.agent)} alt="" width={28} height={28} />
              <span className="field__value">{avatars.label(bead.agent)}</span>
            </div>
          </div>

          <div className="field">
            <div className="field__label">Branch</div>
            <div className="field__value">{bead.branch ?? 'backlog (no branch label)'}</div>
          </div>

          <div className="field">
            <div className="field__label">Priority</div>
            <div className="field__value">P{bead.priority}</div>
          </div>

          <RefGroup
            label={`Blocked by (${bead.openBlockerCount} open)`}
            refs={bead.blockedBy}
            empty="Nothing is holding this up."
            onNavigate={props.onNavigate}
          />
          <RefGroup label="Blocks" refs={bead.blocks} empty="Nothing is waiting on this." onNavigate={props.onNavigate} />
          {bead.related.length > 0 && (
            <RefGroup label="Related" refs={bead.related} empty="" onNavigate={props.onNavigate} />
          )}

          {bead.description && (
            <div className="field">
              <div className="field__label">Description</div>
              <div className="field__value field__value--prose">{bead.description}</div>
            </div>
          )}

          {bead.closeReason && (
            <div className="field">
              <div className="field__label">Close reason</div>
              <div className="field__value field__value--prose">{bead.closeReason}</div>
            </div>
          )}

          {bead.comments.length > 0 && (
            <div className="field">
              <div className="field__label">Comments</div>
              {bead.comments.map((c, i) => (
                <div className="comment" key={i}>
                  <div className="comment__head">
                    <span className="comment__who" data-kind={c.authorKind}>
                      {c.author ?? 'unknown'}
                    </span>
                    <span>{c.authorKind}</span>
                    {c.createdAt && <span>{relativeTime(c.createdAt)}</span>}
                  </div>
                  <div className="comment__body">{c.body}</div>
                </div>
              ))}
            </div>
          )}

          <div className="field">
            <div className="field__label">Labels</div>
            <div className="label-chips">
              {bead.labels.map((l) => (
                <span className="label-chip" key={l}>
                  {l}
                </span>
              ))}
            </div>
          </div>

          <div className="field">
            <div className="field__label">Timestamps</div>
            <div className="field__value" style={{ color: 'var(--text-mid)', fontSize: 'var(--fs-caption)', lineHeight: 1.8 }}>
              {bead.createdAt && <div>created {relativeTime(bead.createdAt)}</div>}
              <div>updated {relativeTime(bead.updatedAt)}</div>
              {bead.closedAt && <div>closed {relativeTime(bead.closedAt)}</div>}
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}

function RefGroup({
  label,
  refs,
  empty,
  onNavigate,
}: {
  label: string;
  refs: BeadDetail['blockedBy'];
  empty: string;
  onNavigate: (id: string) => void;
}): JSX.Element {
  return (
    <div className="field">
      <div className="field__label">{label}</div>
      {refs.length === 0 ? (
        <div className="field__value" style={{ color: 'var(--text-caption)', fontSize: 'var(--fs-caption)' }}>
          {empty}
        </div>
      ) : (
        <div className="ref-list">
          {refs.map((r) => (
            <button
              type="button"
              className="ref"
              key={`${r.kind}:${r.id}`}
              data-status={r.status}
              onClick={() => onNavigate(r.id)}
            >
              <span className="ref__id">{r.id}</span>
              <span className="ref__title">{r.title}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
