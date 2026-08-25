import { describe, expect, it } from 'vitest';
import { dedupeDeps, depFromRecord, depsFromBead, depsFromDepList, normalizeKind } from '../src/bd/deps.js';
import { normalizeBead, type Bead } from '../src/bd/normalize.js';

const bead = (rec: Record<string, unknown>): Bead => normalizeBead(rec)!;

describe('normalizeKind', () => {
  it.each([
    ['blocks', 'blocks'], ['blocked-by', 'blocks'], ['depends_on', 'blocks'],
    ['parent-child', 'parent-child'], ['subtask', 'parent-child'],
    ['discovered-from', 'discovered-from'], ['related', 'related'], ['', 'blocks'],
  ])('%s -> %s', (input, expected) => expect(normalizeKind(input)).toBe(expected));
});

describe('depFromRecord', () => {
  it('points source at the blocker', () => {
    // bd dep add bd-i29v bd-wmma  =>  i29v is blocked by wmma; do wmma first.
    expect(depFromRecord({ issue_id: 'bd-i29v', depends_on_id: 'bd-wmma', type: 'blocks' })).toEqual({
      source: 'bd-wmma', target: 'bd-i29v', kind: 'blocks',
    });
  });

  it('reads the from/to spelling with the same argument order', () => {
    expect(depFromRecord({ from: 'bd-later', to: 'bd-earlier', type: 'blocks' })).toEqual({
      source: 'bd-earlier', target: 'bd-later', kind: 'blocks',
    });
  });

  it('treats the parent as the blocker end', () => {
    expect(depFromRecord({ child_id: 'bd-kid', parent_id: 'bd-epic', type: 'parent-child' })).toEqual({
      source: 'bd-epic', target: 'bd-kid', kind: 'parent-child',
    });
  });

  it('rejects self-edges and incomplete records', () => {
    expect(depFromRecord({ issue_id: 'bd-1', depends_on_id: 'bd-1' })).toBeNull();
    expect(depFromRecord({ issue_id: 'bd-1' })).toBeNull();
  });

  it('skips unusable records in a batch', () => {
    expect(depsFromDepList([{ issue_id: 'a', depends_on_id: 'b' }, {}])).toHaveLength(1);
  });
});

describe('depsFromBead', () => {
  it('reads blocked_by as an incoming edge', () => {
    expect(depsFromBead(bead({ id: 'bd-2', blocked_by: ['bd-1'] }))).toEqual([
      { source: 'bd-1', target: 'bd-2', kind: 'blocks' },
    ]);
  });

  it('reads blocks as an outgoing edge', () => {
    expect(depsFromBead(bead({ id: 'bd-1', blocks: ['bd-2'] }))).toEqual([
      { source: 'bd-1', target: 'bd-2', kind: 'blocks' },
    ]);
  });

  it('reads a scalar parent', () => {
    expect(depsFromBead(bead({ id: 'bd-kid', parent: 'bd-epic' }))).toEqual([
      { source: 'bd-epic', target: 'bd-kid', kind: 'parent-child' },
    ]);
  });

  it('honours per-entry kinds in a dependencies list', () => {
    expect(depsFromBead(bead({ id: 'bd-2', dependencies: [{ id: 'bd-1', type: 'related' }] }))).toContainEqual({
      source: 'bd-1', target: 'bd-2', kind: 'related',
    });
  });

  it('ignores a self-reference', () => {
    expect(depsFromBead(bead({ id: 'bd-1', blocked_by: ['bd-1'] }))).toEqual([]);
  });
});

describe('dedupeDeps', () => {
  it('collapses an edge reported from both ends', () => {
    const both = [
      ...depsFromBead(bead({ id: 'bd-2', blocked_by: ['bd-1'] })),
      ...depsFromBead(bead({ id: 'bd-1', blocks: ['bd-2'] })),
    ];
    expect(dedupeDeps(both)).toHaveLength(1);
  });

  it('treats related as symmetric', () => {
    expect(dedupeDeps([
      { source: 'a', target: 'b', kind: 'related' },
      { source: 'b', target: 'a', kind: 'related' },
    ])).toHaveLength(1);
  });

  it('keeps opposite directions of a blocking edge, which is a real cycle', () => {
    expect(dedupeDeps([
      { source: 'a', target: 'b', kind: 'blocks' },
      { source: 'b', target: 'a', kind: 'blocks' },
    ])).toHaveLength(2);
  });
});
