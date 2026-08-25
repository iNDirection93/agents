import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BeadDetail, GraphPayload, HealthPayload, PurgeStep, SessionSummary } from '@beadviz/contract';
import { ApiFailure, api } from './api/client.js';
import { useAvatars } from './api/useAvatars.js';
import { useServerEvents } from './api/useServerEvents.js';
import { GraphCanvas } from './graph/GraphCanvas.js';
import { Header } from './components/Header.js';
import { Legend } from './components/Legend.js';
import { DetailDrawer } from './components/DetailDrawer.js';
import { RetireDialog, formatBytes } from './components/RetireDialog.js';
import { ToastStack, type Toast } from './components/Toasts.js';
import { EmptyNotice, ErrorNotice, LoadingNotice, NoSelectionNotice } from './components/Notices.js';
import { readDeepLink, writeDeepLink } from './state/deepLink.js';
import { usePrefersReducedMotion } from './state/usePrefersReducedMotion.js';

const initialLink = readDeepLink();

export function App(): JSX.Element {
  const reducedMotion = usePrefersReducedMotion();
  const avatars = useAvatars();

  const [health, setHealth] = useState<HealthPayload | null>(null);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(initialLink.session);
  const [graph, setGraph] = useState<GraphPayload | null>(null);
  const [selectedBead, setSelectedBead] = useState<string | null>(initialLink.bead);
  const [detail, setDetail] = useState<BeadDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [collapseDone, setCollapseDone] = useState(false);
  const [loading, setLoading] = useState(true);
  const [graphLoading, setGraphLoading] = useState(false);
  const [error, setError] = useState<ApiFailure | null>(null);
  const [graphError, setGraphError] = useState<ApiFailure | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [retiring, setRetiring] = useState<SessionSummary | null>(null);
  const [purgeSteps, setPurgeSteps] = useState<PurgeStep[]>([]);

  const toastSeq = useRef(0);
  const focusReturn = useRef<HTMLElement | null>(null);
  const sessionIdRef = useRef(sessionId);
  sessionIdRef.current = sessionId;

  const toast = useCallback((tone: Toast['tone'], message: string) => {
    setToasts((prev) => [...prev, { id: ++toastSeq.current, tone, message }]);
  }, []);

  /* ------------------------------------------------------------- loading */

  const loadSessions = useCallback(
    async (opts: { quiet?: boolean } = {}) => {
      if (!opts.quiet) setLoading(true);
      try {
        const list = await api.sessions();
        setSessions(list);
        setError(null);
        // Restore the last session only when the URL did not already name one.
        if (!sessionIdRef.current && list.length > 0) {
          const prefs = await api.prefs().catch(() => null);
          const remembered = prefs?.lastSessionId && list.some((s) => s.id === prefs.lastSessionId)
            ? prefs.lastSessionId
            : list[0]!.id;
          setSessionId(remembered);
        }
      } catch (e) {
        if (e instanceof ApiFailure) setError(e);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    api.health().then(setHealth).catch(() => undefined);
    void loadSessions();
    api.prefs().then((p) => setCollapseDone(p.collapseDone)).catch(() => undefined);
  }, [loadSessions]);

  const loadGraph = useCallback(async (id: string, opts: { quiet?: boolean } = {}) => {
    if (!opts.quiet) setGraphLoading(true);
    try {
      const payload = await api.graph(id);
      setGraph(payload);
      setGraphError(null);
    } catch (e) {
      if (e instanceof ApiFailure) {
        setGraphError(e);
        setGraph(null);
      }
    } finally {
      setGraphLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!sessionId) {
      setGraph(null);
      return;
    }
    void loadGraph(sessionId);
    void api.savePrefs({ lastSessionId: sessionId }).catch(() => undefined);
  }, [sessionId, loadGraph]);

  /* Deep links both ways. */
  useEffect(() => {
    writeDeepLink({ session: sessionId, bead: selectedBead });
  }, [sessionId, selectedBead]);

  useEffect(() => {
    if (!selectedBead) {
      setDetail(null);
      return;
    }
    let live = true;
    setDetailLoading(true);
    api
      .bead(selectedBead)
      .then((d) => live && setDetail(d))
      .catch((e: unknown) => {
        if (live && e instanceof ApiFailure) {
          toast('error', `${e.message} ${e.hint}`);
          setSelectedBead(null);
        }
      })
      .finally(() => live && setDetailLoading(false));
    return () => {
      live = false;
    };
  }, [selectedBead, toast]);

  /* Live refresh. The sidecar debounces the filesystem burst; this just refetches. */
  useServerEvents(
    useCallback(
      (event) => {
        if (event.type === 'purge-progress') {
          setPurgeSteps((prev) => [...prev, event.step]);
          return;
        }
        if (event.type !== 'beads-changed') return;
        void loadSessions({ quiet: true });
        if (sessionIdRef.current) void loadGraph(sessionIdRef.current, { quiet: true });
      },
      [loadSessions, loadGraph],
    ),
  );

  /* ------------------------------------------------------------ derived */

  /**
   * Collapse-done filters closed beads out of the layout entirely, not just dims
   * them — that is the pressure valve above ~150 nodes, and dimming does nothing
   * for a layered layout that is too wide to read.
   */
  const visibleGraph = useMemo<GraphPayload | null>(() => {
    if (!graph) return null;
    if (!collapseDone) return graph;
    const keep = new Set(graph.nodes.filter((n) => n.status !== 'done').map((n) => n.id));
    return {
      ...graph,
      nodes: graph.nodes.filter((n) => keep.has(n.id)),
      edges: graph.edges.filter((e) => keep.has(e.source) && keep.has(e.target)),
    };
  }, [graph, collapseDone]);

  const hiddenDoneCount = graph ? graph.meta.counts.done : 0;

  /* ------------------------------------------------------------ handlers */

  const onSelectBead = useCallback((id: string | null) => {
    if (id) focusReturn.current = document.activeElement as HTMLElement;
    setSelectedBead(id);
  }, []);

  const onToggleCollapseDone = useCallback(() => {
    setCollapseDone((prev) => {
      void api.savePrefs({ collapseDone: !prev }).catch(() => undefined);
      return !prev;
    });
  }, []);

  const onRefresh = useCallback(() => {
    void loadSessions();
    if (sessionId) void loadGraph(sessionId);
    api.health().then(setHealth).catch(() => undefined);
  }, [loadSessions, loadGraph, sessionId]);

  const currentSession = sessions.find((s) => s.id === sessionId) ?? null;

  /* -------------------------------------------------------------- render */

  const fatal = error ?? (health?.problem ? new ApiFailure(health.problem) : null);

  return (
    <div className="app">
      <Header
        sessions={sessions}
        selectedId={sessionId}
        loading={loading || graphLoading}
        health={health}
        graph={graph}
        collapseDone={collapseDone}
        hiddenDoneCount={hiddenDoneCount}
        onSelect={(id) => {
          setSelectedBead(null);
          setSessionId(id);
        }}
        onRefresh={onRefresh}
        onToggleCollapseDone={onToggleCollapseDone}
        onRetire={() => {
          setPurgeSteps([]);
          setRetiring(currentSession);
        }}
      />

      <div className="canvas-wrap">
        {fatal ? (
          <ErrorNotice error={fatal} onRetry={onRefresh} />
        ) : graphError ? (
          <ErrorNotice error={graphError} onRetry={onRefresh} />
        ) : !sessionId ? (
          loading ? <LoadingNotice what="Scanning the database for sessions…" /> : <NoSelectionNotice count={sessions.length} />
        ) : !visibleGraph ? (
          <LoadingNotice what={`Reading ${sessionId}…`} />
        ) : visibleGraph.nodes.length === 0 ? (
          collapseDone && hiddenDoneCount > 0 ? (
            <div className="centered">
              <div className="notice">
                <div className="notice__kicker" data-tone="calm">everything is done</div>
                <div className="notice__message">
                  All {hiddenDoneCount} beads in {sessionId} are closed, and closed beads are collapsed.
                </div>
                <div className="notice__hint">
                  Turn off <strong>Collapse done</strong> to see them, or retire the session from the Session menu.
                </div>
              </div>
            </div>
          ) : (
            <EmptyNotice sessionId={sessionId} />
          )
        ) : (
          <>
            <GraphCanvas
              graph={visibleGraph}
              avatars={avatars}
              selectedBead={selectedBead}
              onSelectBead={onSelectBead}
              reducedMotion={reducedMotion}
              powerOnKey={`${sessionId}:${collapseDone}`}
            />
            <Legend />
          </>
        )}

        {(detail || detailLoading) && selectedBead && (
          <DetailDrawer
            bead={detail}
            loading={detailLoading}
            avatars={avatars}
            onClose={() => setSelectedBead(null)}
            onNavigate={(id) => setSelectedBead(id)}
            returnFocusTo={focusReturn.current}
          />
        )}
      </div>

      {retiring && (
        <RetireDialog
          session={retiring}
          liveSteps={purgeSteps}
          onClose={() => setRetiring(null)}
          onDone={(result) => {
            setRetiring(null);
            setSelectedBead(null);
            const reclaimed = result.bytesReclaimed !== null ? ` · ${formatBytes(result.bytesReclaimed)} reclaimed` : '';
            // A session row vanishing is correct but startling, so the toast says
            // exactly what happened rather than letting the list silently shrink.
            toast(
              'ok',
              `Retired ${result.sessionId} · ${result.deletedCount} bead${result.deletedCount === 1 ? '' : 's'} deleted, ${result.keptCount} kept${reclaimed}${result.flattened ? '' : ' · flatten unavailable'}`,
            );

            // Stay on the session when beads survived — the protected ones are
            // precisely what the user needs to look at next. Clear only when it is
            // genuinely gone, so we do not sit on a 404.
            void api.sessions().then((list) => {
              setSessions(list);
              const survived = list.some((s) => s.id === result.sessionId);
              if (!survived) {
                setSessionId(null);
                void api.savePrefs({ lastSessionId: null }).catch(() => undefined);
              } else {
                void loadGraph(result.sessionId);
              }
            });
          }}
        />
      )}

      <ToastStack toasts={toasts} onDismiss={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))} />
      <div className="scanlines" aria-hidden />
    </div>
  );
}
