import { describe, expect, it } from 'vitest';
import {
  buildReferenceIndex, derivePreview, mergePreview, parseDryRunJson, parseDryRunText, parseSize,
} from '../src/bd/purge.js';
import { normalizeBead, type Bead } from '../src/bd/normalize.js';

const bead = (id: string, over: Record<string, unknown> = {}): Bead =>
  normalizeBead({ id, title: `title ${id}`, labels: ['willie-b7e3'], ...over })!;

describe('reference protection (§1.2)', () => {
  it('finds a closed bead cited by open work', () => {
    const index = buildReferenceIndex(['bd-old'], [bead('bd-new', { description: 'follows on from bd-old' })]);
    expect(index.get('bd-old')).toEqual(['bd-new']);
  });

  it('does not match an ID that is a prefix of a longer token', () => {
    const index = buildReferenceIndex(['bd-old'], [bead('bd-new', { description: 'see bd-older' })]);
    expect(index.has('bd-old')).toBe(false);
  });

  it('finds citations in comments as well as the description', () => {
    const index = buildReferenceIndex(['bd-old'], [bead('bd-new', { comments: [{ body: 'superseded bd-old' }] })]);
    expect(index.get('bd-old')).toEqual(['bd-new']);
  });

  it('ignores a bead citing itself', () => {
    expect(buildReferenceIndex(['bd-1'], [bead('bd-1', { description: 'bd-1' })]).size).toBe(0);
  });
});

describe('derivePreview', () => {
  const session = [
    bead('bd-closed', { status: 'closed' }),
    bead('bd-cited', { status: 'closed' }),
    bead('bd-open'),
  ];
  const openWork = [bead('bd-open', { description: 'blocked on bd-cited' })];

  it('splits deletable, kept-open and kept-referenced', () => {
    const p = derivePreview('willie-b7e3', session, openWork, 'prune');
    expect(p.deletable.map((c) => c.id)).toEqual(['bd-closed']);
    expect(p.keptOpen.map((c) => c.id)).toEqual(['bd-open']);
    expect(p.keptReferenced).toEqual([
      { id: 'bd-cited', title: 'title bd-cited', status: 'done', referencedBy: ['bd-open'] },
    ]);
  });

  it('never lists an open bead as deletable — prune cannot touch one', () => {
    const p = derivePreview('willie-b7e3', [bead('bd-open')], [], 'prune');
    expect(p.deletable).toEqual([]);
    expect(p.keptOpen).toHaveLength(1);
  });
});

describe('parseDryRunJson', () => {
  it('reads a structured dry run', () => {
    const parsed = parseDryRunJson({
      would_delete: ['bd-1', 'bd-2'],
      kept: [{ id: 'bd-3', reason: 'referenced', referenced_by: ['bd-9'] }, { id: 'bd-4', reason: 'open' }],
      estimated_bytes: 4_300_000,
    });
    expect(parsed?.deletable).toEqual(['bd-1', 'bd-2']);
    expect(parsed?.keptReferenced.get('bd-3')).toEqual(['bd-9']);
    expect(parsed?.keptOpen).toEqual(['bd-4']);
    expect(parsed?.estimatedBytes).toBe(4_300_000);
  });

  it('returns null when the object says nothing useful', () => {
    expect(parseDryRunJson({ unrelated: true })).toBeNull();
  });
});

describe('parseDryRunText', () => {
  const known = ['bd-a1b2', 'bd-c3d4', 'bd-e5f6', 'bd-open1'];

  it('classifies IDs by the section they appear under', () => {
    const text = [
      'Dry run: bd prune --label willie-b7e3',
      '',
      'Would delete 2 closed issues:',
      '  bd-a1b2  Wire the transport filter',
      '  bd-c3d4  Add the ready query',
      '',
      'Kept (referenced by open work):',
      '  bd-e5f6  cited by bd-open1',
      '',
      'Estimated space reclaimed: 4.1 MB',
    ].join('\n');

    const parsed = parseDryRunText(text, known);
    expect(parsed.deletable).toEqual(['bd-a1b2', 'bd-c3d4']);
    expect(parsed.keptReferenced.get('bd-e5f6')).toEqual(['bd-open1']);
    expect(parsed.estimatedBytes).toBe(4_100_000);
  });

  it('only matches IDs the session actually has, so titles cannot fake one', () => {
    const parsed = parseDryRunText('Would delete:\n  bd-a1b2  rename bd-ghost to something else', known);
    expect(parsed.deletable).toEqual(['bd-a1b2']);
  });

  it('returns nothing rather than guessing when the format is unrecognised', () => {
    const parsed = parseDryRunText('¯\\_(ツ)_/¯', known);
    expect(parsed.deletable).toEqual([]);
    expect(parsed.keptOpen).toEqual([]);
  });
});

describe('parseSize', () => {
  it.each([['4.1 MB', 4_100_000], ['512 B', 512], ['2 GiB', 2 * 1024 ** 3], ['nothing', null]])(
    '%s -> %s', (input, expected) => expect(parseSize(input)).toBe(expected),
  );
});

describe('mergePreview', () => {
  const session = [
    bead('bd-closed', { status: 'closed' }),
    bead('bd-cited', { status: 'closed' }),
    bead('bd-open'),
  ];
  const byId = new Map(session.map((b) => [b.id, b]));
  const derived = derivePreview('willie-b7e3', session, [bead('bd-open', { description: 'needs bd-cited' })], 'prune');

  it('keeps the local derivation when the CLI said nothing parseable', () => {
    const merged = mergePreview(derived, { deletable: [], keptOpen: [], keptReferenced: new Map(), estimatedBytes: null }, byId);
    expect(merged.deletable.map((c) => c.id)).toEqual(['bd-closed']);
    expect(merged.keptReferenced.map((c) => c.id)).toEqual(['bd-cited']);
  });

  it('never demotes a CLI-protected bead to deletable', () => {
    const merged = mergePreview(
      derived,
      { deletable: ['bd-closed', 'bd-cited'], keptOpen: [], keptReferenced: new Map([['bd-cited', ['bd-elsewhere']]]), estimatedBytes: null },
      byId,
    );
    expect(merged.deletable.map((c) => c.id)).toEqual(['bd-closed']);
    expect(merged.keptReferenced.find((k) => k.id === 'bd-cited')?.referencedBy).toEqual(['bd-elsewhere']);
  });

  it('never lists an open bead as deletable, whatever the text said', () => {
    const merged = mergePreview(derived, { deletable: ['bd-open'], keptOpen: [], keptReferenced: new Map(), estimatedBytes: null }, byId);
    expect(merged.deletable.map((c) => c.id)).not.toContain('bd-open');
  });

  it('prefers the CLI`s size estimate', () => {
    const merged = mergePreview(derived, { deletable: ['bd-closed'], keptOpen: [], keptReferenced: new Map(), estimatedBytes: 999 }, byId);
    expect(merged.estimatedBytes).toBe(999);
  });
});
