/**
 * The wire contract between the sidecar and the browser.
 *
 * Both sides import this file. It is types plus a handful of frozen constants —
 * no logic — so a change here is a change both sides see at compile time.
 */
export const STATUSES = Object.freeze([
    'backlog',
    'ready',
    'in_progress',
    'blocked',
    'done',
]);
export const EDGE_KINDS = Object.freeze([
    'blocks',
    'parent-child',
    'discovered-from',
    'related',
]);
/** Only these two shape the hierarchy; the rest are informational (§3). */
export const RANKING_EDGE_KINDS = Object.freeze(['blocks', 'parent-child']);
