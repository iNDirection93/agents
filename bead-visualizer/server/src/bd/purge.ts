import type { PurgeCandidate, PurgeKeptReferenced, PurgePreview, PurgeMode } from '@beadviz/contract';
import { isPlainObject, pick, pickNumber, pickString, pickStringArray } from './envelope.js';
import { isOpen, toContractStatus, type Bead } from './normalize.js';

/**
 * Parsing and modelling for the retire flow. Every function here is pure; the CLI
 * calls live in backend.ts. The split matters because this is the one flow where a
 * misparse is destructive, and a pure parser can be tested against both output
 * shapes without a database anywhere near it.
 */

/* -------------------------------------------------------- local derivation */

/**
 * What `prune` will do, derived from the beads we already hold.
 *
 * This is not a guess at the CLI's behaviour for its own sake — it is the floor
 * under the preview. `bd prune` deletes closed non-ephemeral beads and skips any
 * whose ID is cited in the text of open work; if the dry-run output is terse or
 * its format has moved, the dialog still shows a correct, explained list instead
 * of an empty one.
 */
export function derivePreview(
  sessionId: string,
  sessionBeads: Bead[],
  openBeadsEverywhere: Bead[],
  mode: PurgeMode,
): Omit<PurgePreview, 'backupConfigured' | 'raw'> {
  const closed = sessionBeads.filter((b) => !isOpen(b));
  const references = buildReferenceIndex(closed.map((b) => b.id), openBeadsEverywhere);

  const deletable: PurgeCandidate[] = [];
  const keptReferenced: PurgeKeptReferenced[] = [];

  for (const bead of closed) {
    const citedBy = references.get(bead.id);
    if (citedBy && citedBy.length > 0) {
      keptReferenced.push({ ...candidate(bead), referencedBy: citedBy });
    } else {
      deletable.push(candidate(bead));
    }
  }

  return {
    sessionId,
    mode,
    deletable,
    keptOpen: sessionBeads.filter(isOpen).map(candidate),
    keptReferenced,
    estimatedBytes: null,
  };
}

function candidate(b: Bead): PurgeCandidate {
  return { id: b.id, title: b.title, status: toContractStatus(b.status) };
}

/**
 * Which open beads cite which closed IDs. Word-boundary matching on the ID, over
 * description + notes + comments — the same surfaces `prune`'s reference check reads.
 */
export function buildReferenceIndex(closedIds: string[], openBeads: Bead[]): Map<string, string[]> {
  const index = new Map<string, string[]>();
  if (closedIds.length === 0) return index;

  const patterns = closedIds.map((id) => [id, new RegExp(`(^|[^A-Za-z0-9_-])${escapeRe(id)}([^A-Za-z0-9_-]|$)`)] as const);
  for (const open of openBeads) {
    if (!open.referenceText) continue;
    for (const [id, re] of patterns) {
      if (id !== open.id && re.test(open.referenceText)) {
        const list = index.get(id);
        if (list) list.push(open.id);
        else index.set(id, [open.id]);
      }
    }
  }
  return index;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/* ------------------------------------------------------------ CLI parsing */

export interface ParsedDryRun {
  deletable: string[];
  keptOpen: string[];
  keptReferenced: Map<string, string[]>;
  estimatedBytes: number | null;
}

export function emptyDryRun(): ParsedDryRun {
  return { deletable: [], keptOpen: [], keptReferenced: new Map(), estimatedBytes: null };
}

/** Structured dry-run output, when `bd` gives us one. */
export function parseDryRunJson(value: unknown): ParsedDryRun | null {
  if (!isPlainObject(value)) return null;
  const out = emptyDryRun();
  let sawSomething = false;

  const deleted = pick(value, 'deleted', 'would_delete', 'deletable', 'pruned', 'to_delete');
  if (deleted !== undefined) {
    out.deletable = idList(deleted);
    sawSomething = true;
  }

  const kept = pick(value, 'kept', 'skipped', 'protected', 'retained');
  for (const entry of asArray(kept)) {
    sawSomething = true;
    if (typeof entry === 'string') {
      out.keptOpen.push(entry);
      continue;
    }
    if (!isPlainObject(entry)) continue;
    const id = pickString(entry, 'id', 'issue_id');
    if (!id) continue;
    const refs = pickStringArray(entry, 'referenced_by', 'references', 'cited_by', 'blockers');
    const reason = (pickString(entry, 'reason', 'why', 'cause') ?? '').toLowerCase();
    if (refs.length > 0 || /referen|cite/.test(reason)) out.keptReferenced.set(id, refs);
    else out.keptOpen.push(id);
  }

  const bytes = pickNumber(value, 'bytes', 'estimated_bytes', 'reclaimable_bytes', 'size_bytes');
  if (bytes !== null) {
    out.estimatedBytes = bytes;
    sawSomething = true;
  }
  return sawSomething ? out : null;
}

const SECTION_DELETE = /would (be )?(delete|remove|prune)|to (be )?(delete|remove)|deleting|prunable|will be deleted/i;
const SECTION_KEEP_OPEN = /open|in.?progress|not closed|active/i;
const SECTION_KEEP_REF = /referenc|cited|protected|in use/i;
const SECTION_KEEP = /kept|keeping|skipp|retain|preserv|protect/i;

/**
 * Human-readable dry-run output.
 *
 * Rather than inventing a bead-ID regex — which would mis-fire on any ID-shaped
 * token in a title — this matches only IDs we already know are in the session, and
 * classifies each by the section heading above it. Unknown formats degrade to "no
 * IDs found", which the caller fills from the local derivation.
 */
export function parseDryRunText(text: string, knownIds: string[]): ParsedDryRun {
  const out = emptyDryRun();
  if (!text.trim() || knownIds.length === 0) return { ...out, estimatedBytes: parseSize(text) };

  const patterns = knownIds.map((id) => [id, new RegExp(`(^|[^A-Za-z0-9_-])${escapeRe(id)}([^A-Za-z0-9_-]|$)`)] as const);
  let section: 'delete' | 'keep-open' | 'keep-ref' | 'keep' | null = null;

  for (const line of text.split('\n')) {
    const heading = classifyHeading(line);
    if (heading) section = heading;

    const hits = patterns.filter(([, re]) => re.test(line)).map(([id]) => id);
    if (hits.length === 0) continue;

    const lineSection = classifyInline(line) ?? section;
    for (const id of hits) {
      switch (lineSection) {
        case 'keep-ref': {
          // Any *other* known ID on the line is the citing bead.
          out.keptReferenced.set(id, hits.filter((h) => h !== id));
          break;
        }
        case 'keep-open': out.keptOpen.push(id); break;
        case 'keep': out.keptOpen.push(id); break;
        case 'delete': out.deletable.push(id); break;
        default: break;
      }
    }
  }

  out.deletable = unique(out.deletable).filter((id) => !out.keptReferenced.has(id));
  out.keptOpen = unique(out.keptOpen).filter((id) => !out.keptReferenced.has(id) && !out.deletable.includes(id));
  out.estimatedBytes = parseSize(text);
  return out;
}

function classifyHeading(line: string): 'delete' | 'keep-open' | 'keep-ref' | 'keep' | null {
  const l = line.trim();
  if (!l || /^[-*\d]/.test(l)) return null;
  if (SECTION_DELETE.test(l)) return 'delete';
  if (SECTION_KEEP_REF.test(l)) return 'keep-ref';
  if (SECTION_KEEP.test(l)) return SECTION_KEEP_OPEN.test(l) ? 'keep-open' : 'keep';
  return null;
}

function classifyInline(line: string): 'delete' | 'keep-open' | 'keep-ref' | null {
  if (SECTION_KEEP_REF.test(line)) return 'keep-ref';
  if (SECTION_KEEP.test(line) && SECTION_KEEP_OPEN.test(line)) return 'keep-open';
  if (SECTION_KEEP.test(line)) return 'keep-open';
  if (SECTION_DELETE.test(line)) return 'delete';
  return null;
}

const SIZE_UNITS: Record<string, number> = {
  b: 1, kb: 1e3, mb: 1e6, gb: 1e9,
  kib: 1024, mib: 1024 ** 2, gib: 1024 ** 3,
};

export function parseSize(text: string): number | null {
  const m = /([\d.]+)\s*(kib|mib|gib|kb|mb|gb|b)\b/i.exec(text);
  if (!m) return null;
  const n = Number.parseFloat(m[1]!);
  const unit = SIZE_UNITS[m[2]!.toLowerCase()];
  if (!Number.isFinite(n) || unit === undefined) return null;
  return Math.round(n * unit);
}

function idList(v: unknown): string[] {
  return asArray(v)
    .map((e) => (typeof e === 'string' ? e : isPlainObject(e) ? pickString(e, 'id', 'issue_id') : null))
    .filter((s): s is string => !!s);
}

function asArray(v: unknown): unknown[] {
  if (Array.isArray(v)) return v;
  if (v === undefined || v === null) return [];
  return [v];
}

function unique(xs: string[]): string[] {
  return [...new Set(xs)];
}

/**
 * The CLI's answer wins where it spoke; the local derivation fills the rest.
 * Two asymmetries are deliberate:
 *  - a bead the CLI listed as kept-because-referenced is never demoted to deletable;
 *  - an open bead is never listed as deletable, whatever the text seemed to say,
 *    because `prune` cannot delete one and showing otherwise would be a lie about
 *    what the confirm button does.
 */
export function mergePreview(
  derived: Omit<PurgePreview, 'backupConfigured' | 'raw'>,
  parsed: ParsedDryRun,
  beadsById: Map<string, Bead>,
): Omit<PurgePreview, 'backupConfigured' | 'raw'> {
  if (parsed.deletable.length === 0 && parsed.keptReferenced.size === 0 && parsed.keptOpen.length === 0) {
    return { ...derived, estimatedBytes: parsed.estimatedBytes ?? derived.estimatedBytes };
  }

  const openIds = new Set(derived.keptOpen.map((c) => c.id));
  const toCandidate = (id: string): PurgeCandidate => {
    const bead = beadsById.get(id);
    return bead ? candidate(bead) : { id, title: id, status: 'done' };
  };

  const keptReferenced: PurgeKeptReferenced[] = [];
  const seenRef = new Set<string>();
  for (const [id, refs] of parsed.keptReferenced) {
    if (openIds.has(id)) continue;
    seenRef.add(id);
    const fromDerived = derived.keptReferenced.find((k) => k.id === id);
    keptReferenced.push({
      ...toCandidate(id),
      referencedBy: refs.length > 0 ? refs : fromDerived?.referencedBy ?? [],
    });
  }
  for (const k of derived.keptReferenced) {
    if (!seenRef.has(k.id)) keptReferenced.push(k);
  }

  const refIds = new Set(keptReferenced.map((k) => k.id));
  const deletable = unique([...parsed.deletable, ...derived.deletable.map((c) => c.id)])
    .filter((id) => !refIds.has(id) && !openIds.has(id))
    .map(toCandidate);

  return {
    sessionId: derived.sessionId,
    mode: derived.mode,
    deletable,
    keptOpen: derived.keptOpen,
    keptReferenced,
    estimatedBytes: parsed.estimatedBytes ?? derived.estimatedBytes,
  };
}
