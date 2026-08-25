import type {
  ApiError, BeadDetail, GraphPayload, HealthPayload, PurgeExecuteRequest, PurgeMode,
  PurgePreview, PurgeResult, SessionSummary,
} from '@beadviz/contract';

/**
 * Every error surfaced to a user carries a cause and a fix, so the client keeps
 * the sidecar's structured error rather than collapsing it into a status code.
 */
export class ApiFailure extends Error {
  readonly kind: ApiError['error']['kind'];
  readonly hint: string;
  readonly detail?: string;

  constructor(payload: ApiError['error']) {
    super(payload.message);
    this.name = 'ApiFailure';
    this.kind = payload.kind;
    this.hint = payload.hint;
    this.detail = payload.detail;
  }
}

const NETWORK_DOWN: ApiError['error'] = {
  kind: 'cli-error',
  message: 'The sidecar is not answering on this port.',
  hint: 'Start it with `npm run dev:server`, or check that nothing else took the port.',
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers: init?.body ? { 'content-type': 'application/json', ...init.headers } : init?.headers,
    });
  } catch (e) {
    throw new ApiFailure({ ...NETWORK_DOWN, detail: (e as Error).message });
  }

  const text = await res.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      throw new ApiFailure({
        kind: 'bad-json',
        message: `${path} returned something that is not JSON.`,
        hint: 'Check the sidecar log — this usually means an unhandled crash.',
        detail: text.slice(0, 300),
      });
    }
  }

  if (!res.ok) {
    const err = (body as ApiError | null)?.error;
    throw new ApiFailure(
      err ?? {
        kind: 'cli-error',
        message: `${path} failed with ${res.status}.`,
        hint: 'Check the sidecar log for the failing command.',
      },
    );
  }
  return body as T;
}

export const api = {
  health: () => request<HealthPayload>('/api/health'),
  sessions: () => request<SessionSummary[]>('/api/sessions'),
  graph: (sessionId: string) => request<GraphPayload>(`/api/sessions/${encodeURIComponent(sessionId)}/graph`),
  bead: (beadId: string) => request<BeadDetail>(`/api/beads/${encodeURIComponent(beadId)}`),
  purgePreview: (sessionId: string, mode: PurgeMode) =>
    request<PurgePreview>(`/api/sessions/${encodeURIComponent(sessionId)}/purge/preview`, {
      method: 'POST',
      body: JSON.stringify({ mode }),
    }),
  purgeExecute: (sessionId: string, req: PurgeExecuteRequest) =>
    request<PurgeResult>(`/api/sessions/${encodeURIComponent(sessionId)}/purge/execute`, {
      method: 'POST',
      body: JSON.stringify(req),
    }),
  prefs: () => request<{ lastSessionId: string | null; collapseDone: boolean }>('/api/prefs'),
  savePrefs: (patch: { lastSessionId?: string | null; collapseDone?: boolean }) =>
    request<unknown>('/api/prefs', { method: 'PUT', body: JSON.stringify(patch) }),
  avatarManifest: () =>
    request<{ version: number; fallback: string; agents: Record<string, { file: string; label?: string; hue?: string }>; warnings: string[] }>(
      '/api/avatars/manifest',
    ),
};
