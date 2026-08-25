import { describe, expect, it } from 'vitest';
import { normalizeBead, normalizeBeads, normalizePriority, normalizeStatus, toContractStatus } from '../src/bd/normalize.js';

describe('normalizeStatus', () => {
  it.each([
    ['open', 'open'], ['in_progress', 'in_progress'], ['in-progress', 'in_progress'],
    ['IN PROGRESS', 'in_progress'], ['blocked', 'blocked'], ['closed', 'closed'],
    ['done', 'closed'], ['completed', 'closed'], ['nonsense', 'open'],
  ])('%s -> %s', (input, expected) => {
    expect(normalizeStatus(input)).toBe(expected);
  });

  it('maps closed to the contract`s done', () => {
    expect(toContractStatus('closed')).toBe('done');
    expect(toContractStatus('open')).toBe('backlog');
  });
});

describe('normalizePriority', () => {
  it.each([[0, 0], [3, 3], ['P1', 1], ['p2', 2], ['high', 1], ['critical', 0], [9, 3], [-1, 0]] as const)(
    '%s -> %s', (input, expected) => expect(normalizePriority(input)).toBe(expected),
  );

  it('defaults to 2 when absent', () => {
    expect(normalizePriority(undefined)).toBe(2);
  });
});

describe('normalizeBead', () => {
  it('drops a record with no id', () => {
    expect(normalizeBead({ title: 'orphan' })).toBeNull();
  });

  it('falls back to the id for a missing title', () => {
    expect(normalizeBead({ id: 'bd-a1b2' })?.title).toBe('bd-a1b2');
  });

  it('collects the reference haystack from description, notes and comments', () => {
    const bead = normalizeBead({
      id: 'bd-1',
      description: 'follows bd-old',
      notes: 'see bd-older',
      comments: [{ body: 'and bd-oldest', author: 'flanders' }],
    });
    expect(bead?.referenceText).toContain('bd-old');
    expect(bead?.referenceText).toContain('bd-older');
    expect(bead?.referenceText).toContain('bd-oldest');
    expect(bead?.comments[0]?.author).toBe('flanders');
  });

  it('accepts a bare string comment', () => {
    expect(normalizeBead({ id: 'bd-1', comments: ['hi'] })?.comments).toEqual([
      { author: null, body: 'hi', createdAt: null },
    ]);
  });

  it('falls back to created_at when updated_at is absent', () => {
    expect(normalizeBead({ id: 'bd-1', created_at: '2026-02-02T00:00:00Z' })?.updatedAt).toBe('2026-02-02T00:00:00Z');
  });

  it('skips unusable records in a batch without failing the batch', () => {
    expect(normalizeBeads([{ id: 'bd-1' }, { nope: true }]).map((b) => b.id)).toEqual(['bd-1']);
  });
});
