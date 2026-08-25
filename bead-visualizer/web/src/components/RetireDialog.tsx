import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { PurgeMode, PurgePreview, PurgeResult, PurgeStep, SessionSummary } from '@beadviz/contract';
import { ApiFailure, api } from '../api/client.js';
import { withCode } from './Notices.js';

type Phase = 'preview' | 'confirm' | 'running' | 'failed';

export interface RetireDialogProps {
  session: SessionSummary;
  onClose: () => void;
  onDone: (result: PurgeResult) => void;
  /** Steps streamed over SSE while the destructive call runs. */
  liveSteps: PurgeStep[];
}

/**
 * Not a delete button: preview → review what survives and why → confirm → report.
 *
 * The destructive control is unreachable until the dry-run has rendered real data,
 * and `--ignore-references` is a separate, separately-checked escape hatch that is
 * never on by default.
 */
export function RetireDialog(props: RetireDialogProps): JSX.Element {
  const { session } = props;
  const [mode, setMode] = useState<PurgeMode>('prune');
  const [preview, setPreview] = useState<PurgePreview | null>(null);
  const [phase, setPhase] = useState<Phase>('preview');
  const [error, setError] = useState<ApiFailure | null>(null);
  const [typed, setTyped] = useState('');
  const [ignoreReferences, setIgnoreReferences] = useState(false);
  const [backupFirst, setBackupFirst] = useState(false);
  const scrimRef = useRef<HTMLDivElement>(null);
  const firstFocus = useRef<HTMLButtonElement>(null);

  /* Step 2 always runs first. The confirmation dialog body *is* the dry-run output. */
  useEffect(() => {
    let live = true;
    setPreview(null);
    setError(null);
    setPhase('preview');
    api
      .purgePreview(session.id, mode)
      .then((p) => live && setPreview(p))
      .catch((e: unknown) => live && setError(e instanceof ApiFailure ? e : null));
    return () => {
      live = false;
    };
  }, [session.id, mode]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && phase !== 'running') props.onClose();
      if (e.key === 'Tab') trapFocus(e, scrimRef.current);
    };
    document.addEventListener('keydown', onKey, true);
    firstFocus.current?.focus();
    return () => document.removeEventListener('keydown', onKey, true);
  }, [props, phase]);

  const run = async (): Promise<void> => {
    setPhase('running');
    setError(null);
    try {
      const result = await api.purgeExecute(session.id, {
        confirm: true,
        mode,
        ignoreReferences,
        backupFirst,
      });
      props.onDone(result);
    } catch (e) {
      setError(e instanceof ApiFailure ? e : null);
      setPhase('failed');
    }
  };

  const deletableCount = preview
    ? preview.deletable.length + (ignoreReferences ? preview.keptReferenced.length : 0)
    : 0;
  const armed = typed.trim() === session.id && deletableCount > 0;

  return (
    <div className="scrim" ref={scrimRef} onMouseDown={(e) => e.target === scrimRef.current && phase !== 'running' && props.onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="retire-title">
        <div className="modal__head">
          <div className="modal__title" id="retire-title">
            Retire {session.id}
          </div>
          <div className="modal__sub">
            {mode === 'prune'
              ? 'Deletes closed beads only. Open and in-progress beads cannot be pruned, and closed beads that open work still cites are protected.'
              : 'Deletes ephemeral beads (wisps and transient molecules). Durable closed beads are not touched — that is what prune is for.'}
          </div>
          <div className="check-row" style={{ marginTop: 12 }}>
            <fieldset style={{ border: 0, padding: 0, margin: 0, display: 'flex', gap: 16 }}>
              <legend className="sr-only">What to delete</legend>
              {(['prune', 'purge'] as const).map((m) => (
                <label key={m} style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="purge-mode"
                    checked={mode === m}
                    onChange={() => setMode(m)}
                    disabled={phase === 'running'}
                  />
                  <span>{m === 'prune' ? 'Prune closed beads' : 'Purge ephemeral beads'}</span>
                </label>
              ))}
            </fieldset>
          </div>
        </div>

        <div className="modal__body">
          {error && (
            <div className="notice" role="alert" style={{ marginBottom: 16 }}>
              <div className="notice__kicker">{error.kind.replace(/-/g, ' ')}</div>
              <div className="notice__message" style={{ fontSize: 'var(--fs-small)' }}>
                {withCode(error.message)}
              </div>
              <div className="notice__hint">{withCode(error.hint)}</div>
              {error.detail && (
                <details className="notice__detail">
                  <summary style={{ fontSize: 'var(--fs-caption)', color: 'var(--text-caption)', cursor: 'pointer' }}>CLI output</summary>
                  <pre>{error.detail}</pre>
                </details>
              )}
            </div>
          )}

          {!preview && !error && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', color: 'var(--text-mid)', fontSize: 'var(--fs-small)' }}>
              <Loader2 size={15} className="spin" aria-hidden />
              Running <code style={{ margin: '0 4px' }}>bd {mode} --dry-run</code> against {session.id}…
            </div>
          )}

          {preview && (
            <>
              <Group
                title="Will be deleted"
                count={preview.deletable.length}
                why="Closed, and nothing open cites them."
                items={preview.deletable}
              />

              {preview.keptOpen.length > 0 && (
                <Group
                  title="Kept — still open"
                  count={preview.keptOpen.length}
                  why="Open beads can't be pruned. Close or reassign them first."
                  items={preview.keptOpen}
                />
              )}

              {preview.keptReferenced.length > 0 && (
                <Group
                  title="Kept — referenced by open work"
                  count={preview.keptReferenced.length}
                  why="prune skips a closed bead whose ID appears in the description, notes or comments of open work. These survive unless you tick the override below."
                  items={preview.keptReferenced.map((k) => ({
                    ...k,
                    note: `cited by ${k.referencedBy.join(', ') || 'open work'}`,
                  }))}
                />
              )}

              <div className="purge-group__why" style={{ marginTop: 4 }}>
                {preview.estimatedBytes !== null
                  ? `Roughly ${formatBytes(preview.estimatedBytes)} of rows. `
                  : 'No size estimate was reported. '}
                Deleting rows does not reclaim Dolt storage on its own, so <code>bd flatten</code> runs straight after.
              </div>

              <div className="check-row">
                <input
                  id="backup-first"
                  type="checkbox"
                  checked={backupFirst}
                  disabled={!preview.backupConfigured || phase === 'running'}
                  onChange={(e) => setBackupFirst(e.target.checked)}
                />
                <label htmlFor="backup-first">
                  {preview.backupConfigured ? (
                    <>
                      Run <strong>bd backup sync</strong> first.
                    </>
                  ) : (
                    <>
                      No backup target is configured, so there is nothing to back up to. Set one up with{' '}
                      <code>bd backup init</code> if you want one. (<code>bd export</code> is not a restorable
                      backup — it drops branches, history and working-set state.)
                    </>
                  )}
                </label>
              </div>

              {preview.keptReferenced.length > 0 && (
                <div className="check-row check-row--danger">
                  <input
                    id="ignore-refs"
                    type="checkbox"
                    checked={ignoreReferences}
                    disabled={phase === 'running'}
                    onChange={(e) => setIgnoreReferences(e.target.checked)}
                  />
                  <label htmlFor="ignore-refs">
                    <strong>Also delete beads that open work still references</strong> — passes{' '}
                    <code>--ignore-references</code>. The {preview.keptReferenced.length} bead
                    {preview.keptReferenced.length === 1 ? '' : 's'} above will be deleted too, and the open beads
                    citing them will point at nothing.
                  </label>
                </div>
              )}

              <div className="confirm-field" style={{ marginTop: 18 }}>
                <label htmlFor="confirm-name" className="field__label" style={{ display: 'block' }}>
                  Type <strong style={{ color: 'var(--text-hi)' }}>{session.id}</strong> to enable the button
                </label>
                <input
                  id="confirm-name"
                  value={typed}
                  disabled={phase === 'running' || deletableCount === 0}
                  onChange={(e) => setTyped(e.target.value)}
                  placeholder={session.id}
                  autoComplete="off"
                  spellCheck={false}
                />
                {deletableCount === 0 && (
                  <div className="purge-group__why" style={{ marginTop: 8 }}>
                    Nothing here can be deleted, so there is nothing to confirm.
                    {preview.keptOpen.length > 0 && ' Close this session’s open beads first.'}
                  </div>
                )}
              </div>

              {props.liveSteps.length > 0 && (
                <div className="step-log" style={{ marginTop: 16 }}>
                  {props.liveSteps.map((s, i) => (
                    <div className="step-log__row" key={i}>
                      <span className="step-log__name">{s.name}</span>
                      <span>{s.detail}</span>
                    </div>
                  ))}
                </div>
              )}

              <details className="raw-disclosure">
                <summary>Raw dry-run output</summary>
                <pre>{preview.raw || '(no output)'}</pre>
              </details>
            </>
          )}
        </div>

        <div className="modal__foot">
          <button ref={firstFocus} type="button" className="btn btn--quiet" onClick={props.onClose} disabled={phase === 'running'}>
            Cancel
          </button>
          <button type="button" className="btn btn--danger" disabled={!armed || phase === 'running'} onClick={run}>
            {phase === 'running' ? (
              <>
                <Loader2 size={13} className="spin" style={{ verticalAlign: '-2px', marginRight: 6 }} aria-hidden />
                Retiring…
              </>
            ) : (
              `Delete ${deletableCount} bead${deletableCount === 1 ? '' : 's'}`
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

interface GroupItem {
  id: string;
  title: string;
  note?: string;
}

function Group({ title, count, why, items }: { title: string; count: number; why: string; items: GroupItem[] }): JSX.Element {
  return (
    <div className="purge-group">
      <div className="purge-group__head">
        <span className="purge-group__count">{count}</span>
        <span>{title}</span>
      </div>
      <div className="purge-group__why">{why}</div>
      {items.length > 0 && (
        <div className="purge-list">
          {items.map((item) => (
            <div className="purge-item" key={item.id}>
              <span className="purge-item__id">{item.id}</span>
              <span>
                <span className="purge-item__title">{item.title}</span>
                {item.note && <div className="purge-item__ref">{item.note}</div>}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function formatBytes(bytes: number): string {
  if (bytes < 1000) return `${bytes} B`;
  if (bytes < 1e6) return `${(bytes / 1e3).toFixed(1)} kB`;
  if (bytes < 1e9) return `${(bytes / 1e6).toFixed(1)} MB`;
  return `${(bytes / 1e9).toFixed(2)} GB`;
}

/** A modal that lets Tab escape it is a modal in name only. */
function trapFocus(e: KeyboardEvent, root: HTMLElement | null): void {
  if (!root) return;
  const focusable = [...root.querySelectorAll<HTMLElement>('button, input, [href], summary, [tabindex]:not([tabindex="-1"])')]
    .filter((el) => !el.hasAttribute('disabled') && el.offsetParent !== null);
  if (focusable.length === 0) return;
  const first = focusable[0]!;
  const last = focusable[focusable.length - 1]!;
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}
