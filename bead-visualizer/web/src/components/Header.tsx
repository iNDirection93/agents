import { useEffect, useRef, useState } from 'react';
import { EyeOff, Info, Trash2 } from 'lucide-react';
import type { GraphPayload, HealthPayload, SessionSummary } from '@beadviz/contract';
import { RefreshButton, SessionSelector, relativeTime } from './SessionSelector.js';

export interface HeaderProps {
  sessions: SessionSummary[];
  selectedId: string | null;
  loading: boolean;
  health: HealthPayload | null;
  graph: GraphPayload | null;
  collapseDone: boolean;
  hiddenDoneCount: number;
  onSelect: (id: string) => void;
  onRefresh: () => void;
  onToggleCollapseDone: () => void;
  onRetire: () => void;
}

export function Header(props: HeaderProps): JSX.Element {
  const selected = props.sessions.find((s) => s.id === props.selectedId) ?? null;

  return (
    <header className="header">
      <span className="header__marquee" aria-hidden>
        BEAD VISUALIZER
      </span>

      <SessionSelector
        sessions={props.sessions}
        selectedId={props.selectedId}
        loading={props.loading}
        beadsPath={props.health?.beadsDir ?? '.beads'}
        onSelect={props.onSelect}
      />

      {selected && <SessionPopover session={selected} onRetire={props.onRetire} />}

      <div className="header__spacer" />

      <div className="header__meta">
        {props.graph?.meta.readySource === 'derived' && (
          <span title={props.graph.meta.warnings.join('\n')} style={{ color: 'var(--glow-amber)' }}>
            readiness derived
          </span>
        )}
        {props.health?.source === 'fixture' && (
          <span className="source-chip" title={`Reading ${props.health.beadsDir}`}>
            FIXTURE
          </span>
        )}

        <button
          type="button"
          className="icon-button"
          aria-pressed={props.collapseDone}
          onClick={props.onToggleCollapseDone}
          title="Filter closed beads out of the layout entirely"
        >
          <EyeOff size={13} aria-hidden />
          Collapse done{props.hiddenDoneCount > 0 ? ` (${props.hiddenDoneCount})` : ''}
        </button>

        <RefreshButton loading={props.loading} onClick={props.onRefresh} />
      </div>
    </header>
  );
}

/**
 * The retire entry point lives here rather than the toolbar, spatially separated
 * and not red at rest: a red button sitting on screen all day invites the accident.
 */
function SessionPopover({ session, onRetire }: { session: SessionSummary; onRetire: () => void }): JSX.Element {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent): void => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div style={{ position: 'relative' }} ref={ref}>
      <button
        type="button"
        className="icon-button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        title="Session details"
      >
        <Info size={13} aria-hidden />
        Session
      </button>

      {open && (
        <div className="selector__pop" style={{ width: 320, left: 0 }}>
          <div style={{ padding: '8px 10px 12px' }}>
            <div className="session-row__id">{session.id}</div>
            <div className="session-row__branch">{session.branches.join(', ') || 'no branch label'}</div>
            <div className="session-row__counts" style={{ textAlign: 'left', marginTop: 8 }}>
              {session.beadCount} beads · {session.openCount} open · last active {relativeTime(session.lastActivity)}
            </div>
          </div>

          <div style={{ borderTop: '1px solid var(--hairline)', paddingTop: 10, marginTop: 4 }}>
            <button
              type="button"
              className="btn btn--quiet"
              style={{ width: '100%', textAlign: 'left' }}
              onClick={() => {
                setOpen(false);
                onRetire();
              }}
            >
              <Trash2 size={13} style={{ verticalAlign: '-2px', marginRight: 8 }} aria-hidden />
              Retire session…
            </button>
            {session.openCount > 0 && (
              <div className="purge-group__why" style={{ padding: '6px 10px 2px' }}>
                {session.openCount} bead{session.openCount === 1 ? ' is' : 's are'} still open, so a prune will keep
                {session.openCount === 1 ? ' it' : ' them'}.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
