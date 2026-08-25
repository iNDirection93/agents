#!/usr/bin/env node
/**
 * Generates a fixture database for demoing and stress-testing without `bd`.
 *
 * The shapes it produces are the ones that break a dependency viewer: multi-parent
 * nodes, gates, spent edges from closed blockers, reference-protected closed beads,
 * a session that is fully closed (purgeable) and one that is not, and — with
 * --stress — the 200-node case from §9.
 *
 *   node scripts/make-fixture.mjs [--out fixtures/demo.json] [--stress]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const args = process.argv.slice(2);
const outArg = args.indexOf('--out');
const out = resolve(outArg >= 0 ? args[outArg + 1] : 'fixtures/demo.json');
const stress = args.includes('--stress');

const AGENTS = ['willie', 'drnick', 'flanders', 'tod', 'bart', 'frink'];
const AREAS = ['mcp-server', 'java-tools', 'infra'];
const beads = [];
const deps = [];

let seed = 20260824;
const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const pick = (xs) => xs[Math.floor(rand() * xs.length)];
const hex = (n) => Math.floor(rand() * 16 ** n).toString(16).padStart(n, '0');
const days = (n) => new Date(Date.UTC(2026, 7, 24) - n * 864e5).toISOString();

function bead(o) {
  beads.push({
    created_at: days(20),
    updated_at: days(Math.floor(rand() * 18)),
    priority: 1,
    labels: [],
    ...o,
  });
  return o.id;
}

function dep(blocked, blocker, type = 'blocks') {
  deps.push({ issue_id: blocked, depends_on_id: blocker, type });
}

/* -- willie-b7e3: a live session, the one the demo opens on ---------------- */

const S1 = 'willie-b7e3';
const BR1 = 'branch:feature/auth-refactor';
const base = (id, title, over = {}) => bead({
  id, title, ...over,
  labels: ['willie', 'from-willie', S1, BR1, pick(AREAS), 'pr-plan', ...(over.labels ?? [])],
});

base('bd-a1b2', 'Design the transport-edge auth filter', {
  status: 'closed', priority: 0,
  labels: ['drnick', 'design', 'foundation'],
  description: 'Decide where the auth check lives: transport edge, per-handler guard, or middleware chain.',
  close_reason: 'COMPLETED and TESTED.\nCOMMITS: a3f9d21\nPACKAGES: gateway/mcpServer/internal/transport\nDECISIONS:\n  - Auth check placed at the transport edge rather than per-handler.\n    OPTIONS: transport-edge filter | per-handler guard | middleware chain\n    CHOSE transport-edge BECAUSE handlers must stay ignorant of auth; reversal: medium\nDEVIATIONS: none',
  closed_at: days(12),
});
base('bd-c3d4', 'Extract the token verifier', { status: 'closed', labels: ['flanders', 'core'], closed_at: days(9) });
base('bd-e5f6', 'Wire the filter into ServeHTTP', { status: 'in_progress', labels: ['flanders', 'core'] });
base('bd-g7h8', 'Add the ready-query fast path', { status: 'open', labels: ['flanders', 'core'] });
base('bd-i9j0', 'Reject expired tokens with 401, not 500', { status: 'blocked', labels: ['flanders', 'core', 'risky'] });
base('bd-k1l2', 'Backfill transport tests', { status: 'open', labels: ['flanders', 'cleanup'], priority: 2 });
base('bd-m3n4', 'Instrument the filter for recon', { status: 'open', labels: ['tod', 'repro'] });
base('bd-o5p6', 'Harvest: transport.md vs. the diff', { status: 'open', labels: ['bart', 'harvest'], priority: 2 });
base('bd-q7r8', 'PLANNED — hand off to Flanders', { status: 'closed', labels: ['willie', 'exit:PLANNED'], closed_at: days(14) });
base('bd-s9t0', 'Rename TokenChecker, the name lies', {
  status: 'open', labels: ['flanders', 'rename'], priority: 2,
  description: 'Follows the decision recorded in bd-a1b2 — keep that bead until this lands.',
});

dep('bd-c3d4', 'bd-a1b2');
dep('bd-e5f6', 'bd-c3d4');
dep('bd-g7h8', 'bd-c3d4');
dep('bd-i9j0', 'bd-e5f6');
dep('bd-i9j0', 'bd-g7h8');          // multi-parent
dep('bd-k1l2', 'bd-e5f6');
dep('bd-a1b2', 'bd-q7r8', 'parent-child');
dep('bd-m3n4', 'bd-e5f6', 'related');
dep('bd-o5p6', 'bd-k1l2', 'discovered-from');

/* -- willie-6e01: finished, so it is the one you can retire ---------------- */

const S2 = 'willie-6e01';
const BR2 = 'branch:feature/ready-cache';
for (const [i, title] of [
  'Design the ready cache invalidation',
  'Implement the cache',
  'Benchmark against the uncached path',
  'HARVESTED — cache matches the design',
].entries()) {
  bead({
    id: `bd-r${i}0${i}`, title, status: 'closed',
    labels: [pick(AGENTS), S2, BR2, 'java-tools', ...(i === 3 ? ['exit:HARVESTED'] : [])],
    closed_at: days(30 + i), updated_at: days(30 + i),
    close_reason: 'COMPLETED and TESTED.\nCOMMITS: 7b1c0de\nDEVIATIONS: none',
  });
}
dep('bd-r101', 'bd-r000');
dep('bd-r202', 'bd-r101');
dep('bd-r303', 'bd-r202');

/* -- willie-4d5c: closed, but one bead is cited by open work elsewhere ----- */

const S3 = 'willie-4d5c';
bead({
  id: 'bd-cited1', title: 'Establish the drift.lock projection format', status: 'closed',
  labels: ['drnick', S3, 'branch:main', 'infra'], closed_at: days(40), updated_at: days(40),
});
bead({
  id: 'bd-free1', title: 'Wire link-steering.sh into CI', status: 'closed',
  labels: ['flanders', S3, 'branch:main', 'infra'], closed_at: days(38), updated_at: days(38),
});
dep('bd-free1', 'bd-cited1');
// The citation that will protect bd-cited1 from prune, from a bead in another session.
beads.find((b) => b.id === 'bd-s9t0').description +=
  '\nFormat comes from bd-cited1; do not prune that until this is done.';

/* -- willie-0000: an empty-ish session, for the empty state ---------------- */

bead({ id: 'bd-lonely', title: 'Survey the records package', status: 'open', labels: ['willie', 'willie-0000', 'branch:main', 'survey'] });

/* -- stress: the 200-node case from §9 ------------------------------------- */

if (stress) {
  const S = 'willie-ffff';
  const RANKS = 20, PER_RANK = 10;
  const idAt = (r, i) => `bd-x${String(r).padStart(2, '0')}${String(i).padStart(2, '0')}`;
  for (let r = 0; r < RANKS; r++) {
    for (let i = 0; i < PER_RANK; i++) {
      const id = idAt(r, i);
      const status = r < 6 ? 'closed' : r < 8 ? 'in_progress' : rand() < 0.12 ? 'blocked' : 'open';
      bead({
        id, title: `Rank ${r} task ${i} — ${pick(['wire', 'extract', 'harden', 'benchmark', 'document'])} the ${pick(['transport', 'resolver', 'cache', 'chart', 'client'])}`,
        status,
        labels: [pick(AGENTS), S, 'branch:feature/stress', pick(AREAS), ...(i === 0 && r % 5 === 0 ? [`exit:RANK-${r}`] : [])],
        priority: r % 4,
        ...(status === 'closed' ? { closed_at: days(RANKS - r) } : {}),
      });
      if (r > 0) {
        dep(id, idAt(r - 1, Math.floor(rand() * PER_RANK)));
        if (rand() < 0.35) dep(id, idAt(r - 1, Math.floor(rand() * PER_RANK)));
        if (rand() < 0.12) dep(id, idAt(Math.max(0, r - 2), Math.floor(rand() * PER_RANK)), 'related');
      }
    }
  }
}

/* -- ready set, exactly as `bd ready` would report it ---------------------- */

const openIds = new Set(beads.filter((b) => (b.status ?? 'open') !== 'closed').map((b) => b.id));
const blocked = new Set(
  deps.filter((d) => d.type === 'blocks' && openIds.has(d.depends_on_id)).map((d) => d.issue_id),
);
const ready = [...openIds].filter((id) => !blocked.has(id) && beads.find((b) => b.id === id).status === 'open');

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify({ beads, deps, ready }, null, 2)}\n`);
console.log(`${out}: ${beads.length} beads, ${deps.length} deps, ${ready.length} ready`);
