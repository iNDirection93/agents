import { describe, expect, it } from 'vitest';
import { buildDetail, buildGraph, buildSessions } from '../src/bd/build.js';
import { LabelReader } from '../src/bd/labels.js';
import { normalizeBead, type Bead } from '../src/bd/normalize.js';
import { loadConfig } from '../src/config.js';
import type { DepEdge } from '../src/bd/deps.js';

const reader = new LabelReader(loadConfig('/tmp/beadviz-test-does-not-exist', []));

const bead = (id: string, over: Record<string, unknown> = {}): Bead =>
  normalizeBead({ id, title: `title ${id}`, labels: ['willie-b7e3'], updated_at: '2026-08-01T00:00:00Z', ...over })!;

const graph = (beads: Bead[], deps: DepEdge[], readyIds: Set<string> | null = null) =>
  buildGraph({ sessionId: 'willie-b7e3', beads, deps, readyIds, reader });

describe('openBlockerCount', () => {
  it('counts only blockers that are still open', () => {
    const g = graph(
      [bead('a', { status: 'closed' }), bead('b'), bead('c')],
      [{ source: 'a', target: 'c', kind: 'blocks' }, { source: 'b', target: 'c', kind: 'blocks' }],
    );
    expect(g.nodes.find((n) => n.id === 'c')?.openBlockerCount).toBe(1);
  });

  it('ignores non-blocking edges', () => {
    const g = graph([bead('a'), bead('b')], [{ source: 'a', target: 'b', kind: 'related' }]);
    expect(g.nodes.find((n) => n.id === 'b')?.openBlockerCount).toBe(0);
  });
});

describe('computed ready (§3)', () => {
  it('derives ready from open blockers when bd ready is unavailable', () => {
    const g = graph([bead('a'), bead('b')], [{ source: 'a', target: 'b', kind: 'blocks' }]);
    expect(g.nodes.find((n) => n.id === 'a')?.status).toBe('ready');
    expect(g.nodes.find((n) => n.id === 'b')?.status).toBe('backlog');
    expect(g.meta.readySource).toBe('derived');
  });

  it('defers to bd ready when it answered, even against our own edges', () => {
    const g = graph([bead('a'), bead('b')], [{ source: 'a', target: 'b', kind: 'blocks' }], new Set(['b']));
    expect(g.nodes.find((n) => n.id === 'a')?.status).toBe('backlog');
    expect(g.nodes.find((n) => n.id === 'b')?.status).toBe('ready');
    expect(g.meta.readySource).toBe('bd-ready');
  });

  it('never promotes a stored status to ready', () => {
    const g = graph([bead('a', { status: 'in_progress' }), bead('b', { status: 'closed' })], [], new Set(['a', 'b']));
    expect(g.nodes.map((n) => n.status).sort()).toEqual(['done', 'in_progress']);
  });
});

describe('satisfied edges (§3)', () => {
  it('marks an edge from a closed bead as spent', () => {
    const g = graph(
      [bead('a', { status: 'closed' }), bead('b')],
      [{ source: 'a', target: 'b', kind: 'blocks' }],
    );
    expect(g.edges[0]?.satisfied).toBe(true);
  });

  it('leaves an edge from open work unsatisfied', () => {
    const g = graph([bead('a'), bead('b')], [{ source: 'a', target: 'b', kind: 'blocks' }]);
    expect(g.edges[0]?.satisfied).toBe(false);
  });
});

describe('graph hygiene', () => {
  it('drops edges pointing outside the session, which would be phantom nodes', () => {
    const g = graph([bead('a')], [{ source: 'a', target: 'not-in-session', kind: 'blocks' }]);
    expect(g.edges).toEqual([]);
  });

  it('keeps a multi-parent node`s edges', () => {
    const g = graph(
      [bead('p1'), bead('p2'), bead('kid')],
      [{ source: 'p1', target: 'kid', kind: 'blocks' }, { source: 'p2', target: 'kid', kind: 'blocks' }],
    );
    expect(g.edges).toHaveLength(2);
    expect(g.nodes.find((n) => n.id === 'kid')?.openBlockerCount).toBe(2);
  });

  it('de-duplicates an edge reported twice', () => {
    const g = graph([bead('a'), bead('b')], [
      { source: 'a', target: 'b', kind: 'blocks' },
      { source: 'a', target: 'b', kind: 'blocks' },
    ]);
    expect(g.edges).toHaveLength(1);
  });

  it('counts every status and lists branches', () => {
    const g = graph([bead('a', { labels: ['willie-b7e3', 'branch:feature/x'] }), bead('b', { status: 'closed' })], []);
    expect(g.meta.counts.done).toBe(1);
    expect(g.meta.branches).toEqual(['feature/x']);
  });
});

describe('buildSessions (§1.3)', () => {
  it('sorts by most-recent activity, not alphabetically', () => {
    // Alphabetically 0001 sorts first; by activity it is last.
    const beads = [
      bead('a', { labels: ['willie-0001'], updated_at: '2026-01-01T00:00:00Z' }),
      bead('b', { labels: ['willie-ffff'], updated_at: '2026-09-01T00:00:00Z' }),
    ];
    expect(buildSessions(beads, reader).map((s) => s.id)).toEqual(['willie-ffff', 'willie-0001']);
  });

  it('ignores a label that only looks like a session tag', () => {
    // The default pattern is willie-{4 hex}; `willie-zzzz` is not one.
    expect(buildSessions([bead('a', { labels: ['willie-zzzz'] })], reader)).toEqual([]);
  });

  it('counts open beads separately from the total', () => {
    const beads = [
      bead('a', { labels: ['willie-b7e3'] }),
      bead('b', { labels: ['willie-b7e3'], status: 'closed' }),
    ];
    const [session] = buildSessions(beads, reader);
    expect(session).toMatchObject({ beadCount: 2, openCount: 1 });
  });

  it('ignores beads with no session label', () => {
    expect(buildSessions([bead('a', { labels: ['backlog'] })], reader)).toEqual([]);
  });
});

describe('buildDetail', () => {
  it('separates blockers from dependents and attributes comments', () => {
    const target = bead('kid', { comments: [{ body: 'from a bot', author: 'flanders' }, { body: 'from a person', author: 'sam' }] });
    const detail = buildDetail(
      target,
      [bead('parent'), target, bead('later')],
      [
        { source: 'parent', target: 'kid', kind: 'blocks' },
        { source: 'kid', target: 'later', kind: 'blocks' },
      ],
      reader,
      null,
    );
    expect(detail.blockedBy.map((r) => r.id)).toEqual(['parent']);
    expect(detail.blocks.map((r) => r.id)).toEqual(['later']);
    expect(detail.openBlockerCount).toBe(1);
    expect(detail.comments.map((c) => c.authorKind)).toEqual(['agent', 'human']);
  });

  it('lists related work from either direction', () => {
    const target = bead('x');
    const detail = buildDetail(target, [target, bead('y')], [{ source: 'y', target: 'x', kind: 'related' }], reader, null);
    expect(detail.related.map((r) => r.id)).toEqual(['y']);
  });
});
