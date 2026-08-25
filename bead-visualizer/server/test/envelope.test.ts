import { describe, expect, it } from 'vitest';
import {
  parseJsonStdout, parseRecords, pick, pickNumber, pickString, pickStringArray, unwrapEnvelope,
} from '../src/bd/envelope.js';
import { AppError } from '../src/errors.js';

describe('parseJsonStdout', () => {
  it('parses a plain array', () => {
    expect(parseJsonStdout('[{"id":"bd-1"}]', 'x')).toEqual([{ id: 'bd-1' }]);
  });

  it('returns null for empty output', () => {
    expect(parseJsonStdout('   \n', 'x')).toBeNull();
  });

  it('skips log noise printed ahead of the JSON', () => {
    const out = 'connecting to dolt server...\n{"ok":true,"data":[]}';
    expect(parseJsonStdout(out, 'x')).toEqual({ ok: true, data: [] });
  });

  it('parses JSONL', () => {
    const out = '{"id":"bd-1"}\n{"id":"bd-2"}\n';
    expect(parseJsonStdout(out, 'x')).toEqual([{ id: 'bd-1' }, { id: 'bd-2' }]);
  });

  it('throws an AppError with a hint when nothing parses', () => {
    try {
      parseJsonStdout('not json at all', 'bd list');
      expect.unreachable('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(AppError);
      expect((e as AppError).kind).toBe('bad-json');
      expect((e as AppError).hint).toMatch(/BD_JSON_ENVELOPE/);
    }
  });
});

describe('unwrapEnvelope', () => {
  it.each([
    ['ok/data', { ok: true, data: [{ id: 'a' }] }],
    ['success/result', { success: true, result: [{ id: 'a' }] }],
    ['issues', { issues: [{ id: 'a' }] }],
    ['beads', { beads: [{ id: 'a' }] }],
    ['nested', { ok: true, data: { issues: [{ id: 'a' }] } }],
  ])('unwraps %s', (_name, input) => {
    expect(unwrapEnvelope(input, 'x')).toEqual([{ id: 'a' }]);
  });

  it('passes a bare array straight through', () => {
    expect(unwrapEnvelope([{ id: 'a' }], 'x')).toEqual([{ id: 'a' }]);
  });

  it('treats an in-band failure as an error rather than an empty result', () => {
    expect(() => unwrapEnvelope({ ok: false, error: 'dolt is down' }, 'bd list')).toThrow(/dolt is down/);
  });
});

describe('parseRecords', () => {
  it('wraps a single object into a list', () => {
    expect(parseRecords('{"ok":true,"data":{"id":"bd-1"}}', 'x')).toEqual([{ id: 'bd-1' }]);
  });

  it('is empty for empty stdout', () => {
    expect(parseRecords('', 'x')).toEqual([]);
  });
});

describe('field pickers', () => {
  it('matches snake_case and camelCase interchangeably', () => {
    expect(pickString({ updatedAt: '2026-01-01' }, 'updated_at')).toBe('2026-01-01');
    expect(pickString({ updated_at: '2026-01-01' }, 'updatedAt')).toBe('2026-01-01');
  });

  it('falls through null values to the next candidate name', () => {
    expect(pickString({ title: null, summary: 'real' }, 'title', 'summary')).toBe('real');
  });

  it('reads numbers from strings', () => {
    expect(pickNumber({ bytes: '4096' }, 'bytes')).toBe(4096);
    expect(pickNumber({ bytes: 'lots' }, 'bytes')).toBeNull();
  });

  it('reads labels as an array, a comma string, or objects', () => {
    expect(pickStringArray({ labels: ['a', 'b'] }, 'labels')).toEqual(['a', 'b']);
    expect(pickStringArray({ labels: 'a, b' }, 'labels')).toEqual(['a', 'b']);
    expect(pickStringArray({ labels: [{ name: 'a' }, { label: 'b' }] }, 'labels')).toEqual(['a', 'b']);
  });

  it('leaves unknown fields undefined', () => {
    expect(pick({}, 'nope')).toBeUndefined();
  });
});
