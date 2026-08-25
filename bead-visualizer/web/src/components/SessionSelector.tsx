import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, RefreshCw } from 'lucide-react';
import type { SessionSummary } from '@beadviz/contract';

export interface SessionSelectorProps {
  sessions: SessionSummary[];
  selectedId: string | null;
  loading: boolean;
  beadsPath: string;
  onSelect: (id: string) => void;
}

/** Type-ahead earns its keep past ~10 sessions; below that it is just chrome. */
const FILTER_THRESHOLD = 10;

export function SessionSelector(props: SessionSelectorProps): JSX.Element {
  const { sessions, selectedId, loading } = props;
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selected = sessions.find((s) => s.id === selectedId) ?? null;
  const showFilter = sessions.length > FILTER_THRESHOLD;

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return sessions;
    return sessions.filter(
      (s) => s.id.toLowerCase().includes(q) || s.branches.some((b) => b.toLowerCase().includes(q)),
    );
  }, [sessions, filter]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent): void => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setActiveIndex(Math.max(0, visible.findIndex((s) => s.id === selectedId)));
  }, [open, visible, selectedId]);

  const commit = (session: SessionSummary): void => {
    props.onSelect(session.id);
    setOpen(false);
    setFilter('');
    buttonRef.current?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    switch (e.key) {
      case 'Escape':
        e.preventDefault();
        setOpen(false);
        buttonRef.current?.focus();
        break;
      case 'ArrowDown':
        e.preventDefault();
        setActiveIndex((i) => Math.min(visible.length - 1, i + 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActiveIndex((i) => Math.max(0, i - 1));
        break;
      case 'Home':
        e.preventDefault();
        setActiveIndex(0);
        break;
      case 'End':
        e.preventDefault();
        setActiveIndex(visible.length - 1);
        break;
      case 'Enter': {
        e.preventDefault();
        const hit = visible[activeIndex];
        if (hit) commit(hit);
        break;
      }
      default:
        break;
    }
  };

  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector<HTMLElement>('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, open]);

  return (
    <div className="selector" ref={rootRef} onKeyDown={onKeyDown}>
      <button
        ref={buttonRef}
        type="button"
        className="selector__button"
        role="combobox"
        aria-expanded={open}
        aria-controls="session-listbox"
        aria-haspopup="listbox"
        aria-label="Select a session"
        onClick={() => setOpen((v) => !v)}
      >
        <span>
          <span className="selector__name">{selected ? selected.id : 'SELECT SESSION'}</span>
          <span className="selector__sub">
            {selected
              ? `${selected.beadCount} beads · ${selected.openCount} open${selected.branches[0] ? ` · ${selected.branches[0]}` : ''}`
              : `${sessions.length} session${sessions.length === 1 ? '' : 's'} in this database`}
          </span>
        </span>
        <ChevronDown className="selector__chev" size={16} aria-hidden />
      </button>

      {open && (
        <div className="selector__pop">
          {showFilter && (
            <label className="sr-only" htmlFor="session-filter">
              Filter sessions
            </label>
          )}
          {showFilter && (
            <input
              id="session-filter"
              className="selector__filter"
              placeholder="Filter by session or branch…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              autoFocus
            />
          )}

          <div id="session-listbox" role="listbox" ref={listRef} aria-label="Sessions">
            {visible.map((session, i) => (
              <button
                key={session.id}
                type="button"
                role="option"
                aria-selected={session.id === selectedId}
                data-active={i === activeIndex}
                className="session-row"
                onMouseEnter={() => setActiveIndex(i)}
                onClick={() => commit(session)}
              >
                {/* Lime = still has open work. Ice = fully closed, so eligible for retirement. */}
                <span className="session-row__dot" data-open={session.openCount > 0} aria-hidden />
                <span>
                  <span className="session-row__id">{session.id}</span>
                  <span className="session-row__branch">{session.branches.join(', ') || 'no branch label'}</span>
                </span>
                <span>
                  <span className="session-row__counts">
                    {session.beadCount} beads · {session.openCount} open
                  </span>
                  <span className="session-row__age">last active {relativeTime(session.lastActivity)}</span>
                </span>
              </button>
            ))}

            {visible.length === 0 && (
              <div className="notice" style={{ border: 0, padding: '14px 10px' }}>
                <div className="notice__message" style={{ fontSize: 'var(--fs-small)' }}>
                  {sessions.length === 0 ? 'No sessions found in this database.' : 'No session matches that filter.'}
                </div>
                <div className="notice__hint">
                  {sessions.length === 0 ? (
                    <>
                      Reading <code>{props.beadsPath}</code>. Sessions are discovered from bead labels — check
                      that your beads carry the session tag your config expects.
                    </>
                  ) : (
                    'Clear the filter to see all sessions.'
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <span className="sr-only" role="status">
        {loading ? 'Loading sessions' : `${sessions.length} sessions loaded`}
      </span>
    </div>
  );
}

export function RefreshButton({ loading, onClick }: { loading: boolean; onClick: () => void }): JSX.Element {
  return (
    <button type="button" className="icon-button" onClick={onClick} disabled={loading} title="Rescan the database">
      <RefreshCw size={13} className={loading ? 'spin' : undefined} aria-hidden />
      {loading ? 'Scanning' : 'Refresh'}
    </button>
  );
}

export function relativeTime(iso: string): string {
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return 'unknown';
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(then).toISOString().slice(0, 10);
}
