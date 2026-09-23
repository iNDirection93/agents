/**
 * The wire contract between the sidecar and the browser.
 *
 * Both sides import this file. It is types plus a handful of frozen constants —
 * no logic — so a change here is a change both sides see at compile time.
 */
/**
 * `ready` is computed, never stored: an open bead with no open blockers.
 * The sidecar prefers `bd ready --json` for it and falls back to deriving it;
 * `GraphMeta.readySource` says which happened.
 */
export type Status = 'backlog' | 'ready' | 'in_progress' | 'blocked' | 'done';
export declare const STATUSES: readonly Status[];
export type EdgeKind = 'blocks' | 'parent-child' | 'discovered-from' | 'related';
export declare const EDGE_KINDS: readonly EdgeKind[];
/** Only these two shape the hierarchy; the rest are informational (§3). */
export declare const RANKING_EDGE_KINDS: readonly EdgeKind[];
export interface BeadNode {
    id: string;
    title: string;
    status: Status;
    /** Renders as a hexagon rather than a circle. */
    isGate: boolean;
    /** The emit or label the gate stands for (`PLANNED`), for the hexagon caption. */
    gateName: string | null;
    /** Manifest key — the agent expected to act on this bead. */
    agent: string | null;
    branch: string | null;
    priority: 0 | 1 | 2 | 3;
    openBlockerCount: number;
    updatedAt: string;
}
export interface BeadEdge {
    id: string;
    /** The blocker. */
    source: string;
    /** The blocked. */
    target: string;
    kind: EdgeKind;
    /** Source is closed, so this edge is structurally present but spent. */
    satisfied: boolean;
}
export interface GraphMeta {
    sessionId: string;
    label: string;
    counts: Record<Status, number>;
    /** Where `ready` came from — surfaced in the UI when it had to be derived. */
    readySource: 'bd-ready' | 'derived';
    branches: string[];
    /** Non-fatal problems worth showing without blocking the render. */
    warnings: string[];
    generatedAt: string;
}
export interface GraphPayload {
    nodes: BeadNode[];
    edges: BeadEdge[];
    meta: GraphMeta;
}
export interface SessionSummary {
    id: string;
    label: string;
    beadCount: number;
    openCount: number;
    /** ISO-8601; max updatedAt across the group. */
    lastActivity: string;
    branches: string[];
}
export interface BeadComment {
    author: string | null;
    /** Best-effort: agent names come from the configured roster. */
    authorKind: 'human' | 'agent' | 'unknown';
    body: string;
    createdAt: string | null;
}
export interface BeadDetail extends BeadNode {
    description: string | null;
    closeReason: string | null;
    labels: string[];
    createdAt: string | null;
    closedAt: string | null;
    /** Beads this one waits on. */
    blockedBy: BeadRef[];
    /** Beads waiting on this one. */
    blocks: BeadRef[];
    related: BeadRef[];
    comments: BeadComment[];
}
export interface BeadRef {
    id: string;
    title: string;
    status: Status;
    kind: EdgeKind;
}
export type PurgeMode = 'prune' | 'purge';
export interface PurgeCandidate {
    id: string;
    title: string;
    status: Status;
}
export interface PurgeKeptReferenced extends PurgeCandidate {
    /** The open/in-progress beads whose text cites this ID. */
    referencedBy: string[];
}
export interface PurgePreview {
    sessionId: string;
    mode: PurgeMode;
    /** Closed, unreferenced — these go. */
    deletable: PurgeCandidate[];
    /** Open or in progress — `prune` will never touch them. */
    keptOpen: PurgeCandidate[];
    /** Closed but cited by open work; `--ignore-references` overrides. */
    keptReferenced: PurgeKeptReferenced[];
    /** Bytes, when the CLI reports an estimate. */
    estimatedBytes: number | null;
    /** Whether a `bd backup` target is configured, so step 2 can be honest. */
    backupConfigured: boolean;
    /** Verbatim CLI output, shown behind a disclosure. */
    raw: string;
}
export interface PurgeExecuteRequest {
    confirm: true;
    mode: PurgeMode;
    ignoreReferences: boolean;
    /** Run `bd backup sync` before the destructive step. */
    backupFirst?: boolean;
}
export interface PurgeResult {
    sessionId: string;
    deletedCount: number;
    keptCount: number;
    bytesBefore: number | null;
    bytesAfter: number | null;
    bytesReclaimed: number | null;
    flattened: boolean;
    backupSynced: boolean;
    steps: PurgeStep[];
}
export interface PurgeStep {
    name: string;
    ok: boolean;
    detail: string;
}
export type BdErrorKind = 'binary-missing' | 'no-beads-dir' | 'dolt-down' | 'bad-json' | 'cli-error' | 'timeout' | 'bad-request' | 'not-found' | 'unsupported';
/** Every failure names a cause and a fix (§7). */
export interface ApiError {
    error: {
        kind: BdErrorKind;
        message: string;
        /** The remedy, in the imperative. */
        hint: string;
        detail?: string;
    };
}
export interface AvatarEntry {
    file: string;
    label?: string;
    /** Optional per-agent neon tint for the node ring. */
    hue?: string;
}
export interface AvatarManifest {
    version: number;
    fallback: string;
    agents: Record<string, AvatarEntry>;
}
export interface HealthPayload {
    ok: boolean;
    /** Fixture mode is loudly flagged in the UI so nobody mistakes it for live data. */
    source: 'bd' | 'fixture';
    repoRoot: string;
    beadsDir: string;
    bdVersion: string | null;
    sessionLabelPattern: string;
    problem: ApiError['error'] | null;
}
export type ServerEvent = {
    type: 'hello';
    source: 'bd' | 'fixture';
} | {
    type: 'beads-changed';
    at: string;
} | {
    type: 'purge-progress';
    sessionId: string;
    step: PurgeStep;
};
