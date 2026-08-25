import { describe, expect, it } from 'vitest';
import { assertIdentifier, isSafeRelativePath } from '../src/validate.js';
import { classifyStderr } from '../src/bd/exec.js';
import { AppError } from '../src/errors.js';

describe('assertIdentifier', () => {
  it('accepts a session tag', () => {
    expect(assertIdentifier('willie-b7e3', 'session id')).toBe('willie-b7e3');
  });

  it.each([
    ['; rm -rf /'], ['$(whoami)'], ['../../etc/passwd'], ['a b'], [''], ['x'.repeat(65)], ['--force'.concat(' x')],
  ])('rejects %s', (input) => {
    expect(() => assertIdentifier(input, 'session id')).toThrow(AppError);
  });

  it('rejects a non-string', () => {
    expect(() => assertIdentifier(42, 'session id')).toThrow(/Invalid session id/);
  });
});

describe('isSafeRelativePath', () => {
  it.each([['yellow-01.png', true], ['sub/dir/a.png', true], ['../secrets', false], ['/etc/passwd', false], ['a\\b', false], ['', false]] as const)(
    '%s -> %s', (input, expected) => expect(isSafeRelativePath(input)).toBe(expected),
  );
});

describe('error classification (§7)', () => {
  it('names the fix for a Dolt outage', () => {
    const err = classifyStderr('dial tcp 127.0.0.1:3306: connect: connection refused', 'bd list', '/repo');
    expect(err.kind).toBe('dolt-down');
    expect(err.hint).toMatch(/bd dolt start/);
  });

  it('names the fix for a missing database', () => {
    const err = classifyStderr('error: no .beads directory found', 'bd list', '/repo');
    expect(err.kind).toBe('no-beads-dir');
    expect(err.hint).toMatch(/--repo/);
  });

  it('falls back to a generic CLI error that still says what to do', () => {
    const err = classifyStderr('panic: something odd', 'bd list', '/repo');
    expect(err.kind).toBe('cli-error');
    expect(err.hint.length).toBeGreaterThan(0);
  });
});
