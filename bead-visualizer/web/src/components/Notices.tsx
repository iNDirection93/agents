import { AlertTriangle, Inbox, Loader2 } from 'lucide-react';
import type { ApiError } from '@beadviz/contract';

/**
 * Every error names its cause and its fix (§7). None of these is a bare spinner
 * that never resolves — even the loading state says what it is waiting for.
 */
export function ErrorNotice({
  error,
  onRetry,
}: {
  error: { kind: ApiError['error']['kind']; message: string; hint: string; detail?: string };
  onRetry?: () => void;
}): JSX.Element {
  return (
    <div className="centered">
      <div className="notice" role="alert">
        <div className="notice__kicker">
          <AlertTriangle size={12} style={{ verticalAlign: '-1px', marginRight: 6 }} aria-hidden />
          {error.kind.replace(/-/g, ' ')}
        </div>
        <div className="notice__message">{withCode(error.message)}</div>
        <div className="notice__hint">{withCode(error.hint)}</div>
        {error.detail && (
          <details className="notice__detail">
            <summary style={{ fontSize: 'var(--fs-caption)', color: 'var(--text-caption)', cursor: 'pointer' }}>
              CLI output
            </summary>
            <pre>{error.detail}</pre>
          </details>
        )}
        {onRetry && (
          <div className="notice__actions">
            <button type="button" className="btn" onClick={onRetry}>
              Retry
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function EmptyNotice({ sessionId }: { sessionId: string }): JSX.Element {
  return (
    <div className="centered">
      <div className="notice">
        <div className="notice__kicker" data-tone="calm">
          <Inbox size={12} style={{ verticalAlign: '-1px', marginRight: 6 }} aria-hidden />
          empty session
        </div>
        <div className="notice__message">{sessionId} has no beads left.</div>
        <div className="notice__hint">
          Either every bead was retired, or the label was applied to work that has since moved. Create one with{' '}
          <code>bd create … -l &quot;{sessionId}&quot;</code>, or pick another session from the marquee.
        </div>
      </div>
    </div>
  );
}

export function LoadingNotice({ what }: { what: string }): JSX.Element {
  return (
    <div className="centered">
      <div className="notice" style={{ borderColor: 'transparent', background: 'transparent' }}>
        <div className="notice__message" style={{ color: 'var(--text-mid)', display: 'flex', gap: 10, alignItems: 'center' }}>
          <Loader2 size={16} className="spin" aria-hidden />
          {what}
        </div>
      </div>
    </div>
  );
}

export function NoSelectionNotice({ count }: { count: number }): JSX.Element {
  return (
    <div className="centered">
      <div className="notice">
        <div className="notice__kicker" data-tone="calm">no session selected</div>
        <div className="notice__message">
          {count > 0 ? 'Pick a session from the marquee to power the sign on.' : 'No sessions found in this database.'}
        </div>
        <div className="notice__hint">
          {count > 0
            ? 'Sessions are sorted by most-recent activity. A lime dot means open work; an ice dot means the session is finished and can be retired.'
            : 'Sessions are derived from bead labels — there is no `bd sessions` command. Check that beads in this database carry the session tag your config expects.'}
        </div>
      </div>
    </div>
  );
}

/** Renders `backtick` spans as <code>, so a message can name a command inline. */
export function withCode(text: string): React.ReactNode {
  const parts = text.split(/`([^`]+)`/g);
  return parts.map((part, i) => (i % 2 === 1 ? <code key={i}>{part}</code> : <span key={i}>{part}</span>));
}
