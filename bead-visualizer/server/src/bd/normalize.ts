import type { Status } from '@beadviz/contract';
import { isPlainObject, pick, pickNumber, pickString, pickStringArray } from './envelope.js';

/** What `bd` stores. `ready` is not here — it is computed in graph.ts (§3). */
export type RawStatus = 'open' | 'in_progress' | 'blocked' | 'closed';

export interface RawComment {
  author: string | null;
  body: string;
  createdAt: string | null;
}

export interface Bead {
  id: string;
  title: string;
  status: RawStatus;
  labels: string[];
  priority: 0 | 1 | 2 | 3;
  assignee: string | null;
  description: string | null;
  /** Description + notes + comments, concatenated — the haystack `prune` scans for citations. */
  referenceText: string;
  closeReason: string | null;
  createdAt: string | null;
  updatedAt: string;
  closedAt: string | null;
  comments: RawComment[];
  /** Kept so graph.ts can mine dependencies embedded in the bead record itself. */
  raw: Record<string, unknown>;
}

const STATUS_ALIASES: Record<string, RawStatus> = {
  open: 'open', todo: 'open', new: 'open', backlog: 'open', ready: 'open', proposed: 'open',
  in_progress: 'in_progress', 'in-progress': 'in_progress', inprogress: 'in_progress',
  doing: 'in_progress', active: 'in_progress', started: 'in_progress', wip: 'in_progress',
  blocked: 'blocked', waiting: 'blocked', on_hold: 'blocked',
  closed: 'closed', done: 'closed', complete: 'closed', completed: 'closed',
  resolved: 'closed', fixed: 'closed', merged: 'closed',
};

export function normalizeStatus(value: unknown): RawStatus {
  if (typeof value !== 'string') return 'open';
  return STATUS_ALIASES[value.trim().toLowerCase().replace(/\s+/g, '_')] ?? 'open';
}

const PRIORITY_WORDS: Record<string, 0 | 1 | 2 | 3> = {
  critical: 0, urgent: 0, highest: 0,
  high: 1,
  medium: 2, normal: 2, moderate: 2,
  low: 3, lowest: 3, trivial: 3,
};

export function normalizePriority(value: unknown): 0 | 1 | 2 | 3 {
  if (typeof value === 'number' && Number.isFinite(value)) return clampPriority(value);
  if (typeof value === 'string') {
    const s = value.trim().toLowerCase();
    const word = PRIORITY_WORDS[s];
    if (word !== undefined) return word;
    const m = /^p?(\d)$/.exec(s);
    if (m) return clampPriority(Number.parseInt(m[1]!, 10));
  }
  // P2 is the conventions' "non-blocking" tier: the least alarming thing to assume.
  return 2;
}

function clampPriority(n: number): 0 | 1 | 2 | 3 {
  const i = Math.round(n);
  return (i < 0 ? 0 : i > 3 ? 3 : i) as 0 | 1 | 2 | 3;
}

export function normalizeComments(value: unknown): RawComment[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): RawComment[] => {
    if (typeof item === 'string') return [{ author: null, body: item, createdAt: null }];
    if (!isPlainObject(item)) return [];
    const body = pickString(item, 'body', 'text', 'comment', 'message');
    if (!body) return [];
    return [{
      author: pickString(item, 'author', 'actor', 'user', 'created_by'),
      body,
      createdAt: pickString(item, 'created_at', 'timestamp', 'at'),
    }];
  });
}

export function normalizeBead(rec: Record<string, unknown>): Bead | null {
  const id = pickString(rec, 'id', 'issue_id', 'bead_id', 'key');
  if (!id) return null;

  const description = pickString(rec, 'description', 'body', 'desc');
  const notes = pickString(rec, 'notes', 'design', 'acceptance_criteria', 'notes_md');
  const closeReason = pickString(rec, 'close_reason', 'closeReason', 'resolution');
  const comments = normalizeComments(pick(rec, 'comments', 'notes_list', 'discussion'));
  const updatedAt =
    pickString(rec, 'updated_at', 'updatedAt', 'modified_at', 'last_activity', 'created_at') ??
    new Date(0).toISOString();

  return {
    id,
    title: pickString(rec, 'title', 'summary', 'name') ?? id,
    status: normalizeStatus(pick(rec, 'status', 'state')),
    labels: pickStringArray(rec, 'labels', 'tags'),
    priority: normalizePriority(pick(rec, 'priority', 'prio', 'p')),
    assignee: pickString(rec, 'assignee', 'actor', 'owner', 'assigned_to'),
    description,
    referenceText: [description, notes, closeReason, ...comments.map((c) => c.body)]
      .filter((s): s is string => !!s)
      .join('\n'),
    closeReason,
    createdAt: pickString(rec, 'created_at', 'createdAt'),
    updatedAt,
    closedAt: pickString(rec, 'closed_at', 'closedAt', 'resolved_at'),
    comments,
    raw: rec,
  };
}

export function normalizeBeads(records: Record<string, unknown>[]): Bead[] {
  return records.map(normalizeBead).filter((b): b is Bead => b !== null);
}

/** The stored status, before `ready` is layered on. */
export function toContractStatus(raw: RawStatus): Exclude<Status, 'ready'> {
  switch (raw) {
    case 'closed': return 'done';
    case 'in_progress': return 'in_progress';
    case 'blocked': return 'blocked';
    default: return 'backlog';
  }
}

export function isOpen(b: Bead): boolean {
  return b.status !== 'closed';
}
