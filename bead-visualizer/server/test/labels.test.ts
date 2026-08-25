import { describe, expect, it } from 'vitest';
import { LabelReader, groupBySession } from '../src/bd/labels.js';
import { normalizeBead, type Bead } from '../src/bd/normalize.js';
import { loadConfig } from '../src/config.js';

const cfg = loadConfig('/tmp/beadviz-test-does-not-exist', []);
const reader = new LabelReader(cfg);
const bead = (labels: string[], extra: Record<string, unknown> = {}): Bead =>
  normalizeBead({ id: 'bd-1', title: 't', labels, ...extra })!;

describe('session labels (§10.1)', () => {
  it('finds the willie-XXXX session tag', () => {
    expect(reader.sessionsOf(bead(['willie', 'willie-b7e3', 'branch:main']))).toEqual(['willie-b7e3']);
  });

  it('does not mistake the bare agent label for a session', () => {
    expect(reader.sessionsOf(bead(['willie', 'flanders']))).toEqual([]);
  });

  it('groups a bead into every session it carries', () => {
    const grouped = groupBySession([bead(['willie-b7e3', 'willie-6e01'])], reader);
    expect([...grouped.keys()].sort()).toEqual(['willie-6e01', 'willie-b7e3']);
  });
});

describe('branch labels', () => {
  it('keeps slashes in the branch name', () => {
    expect(reader.branchOf(bead(['branch:feature/auth-refactor']))).toBe('feature/auth-refactor');
  });

  it('is null when the bead is backlog', () => {
    expect(reader.branchOf(bead(['backlog']))).toBeNull();
  });
});

describe('agent identity (§10.2)', () => {
  it('picks the recipient, not the author', () => {
    // Willie's convention: origin `willie` + `from-willie`, recipient `flanders`.
    expect(reader.agentOf(bead(['willie', 'from-willie', 'flanders', 'branch:main']))).toBe('flanders');
  });

  it('handles a self-addressed bead', () => {
    expect(reader.agentOf(bead(['willie', 'from-willie', 'willie']))).toBe('willie');
  });

  it('prefers an explicit assignee when the database has one', () => {
    expect(reader.agentOf(bead(['willie', 'from-willie', 'flanders'], { assignee: 'tod' }))).toBe('tod');
  });

  it('ignores an assignee that is not on the roster', () => {
    expect(reader.agentOf(bead(['flanders'], { assignee: 'someone-else' }))).toBe('flanders');
  });

  it('is null when no agent label is present', () => {
    expect(reader.agentOf(bead(['branch:main']))).toBeNull();
  });

  it('reports the origin separately', () => {
    expect(reader.originOf(bead(['bart', 'from-bart', 'drnick']))).toBe('bart');
  });
});

describe('gates (§10.3)', () => {
  it('treats an exit emit as a gate and names it', () => {
    const g = bead(['flanders', 'exit:BEAD-DONE']);
    expect(reader.isGate(g)).toBe(true);
    expect(reader.gateNameOf(g)).toBe('BEAD-DONE');
  });

  it('treats a foundation bead as a gate', () => {
    expect(reader.isGate(bead(['foundation']))).toBe(true);
  });

  it('leaves an ordinary bead alone', () => {
    expect(reader.isGate(bead(['core', 'flanders']))).toBe(false);
  });
});
