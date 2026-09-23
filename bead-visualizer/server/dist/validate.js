import { AppError } from './errors.js';
/**
 * Session and bead identifiers reach `execFile` as argv entries. execFile with an
 * argument array already keeps them out of a shell, but the allowlist is the part
 * that survives someone later "just adding a shell: true" — so it stays at the
 * boundary, ahead of every CLI call.
 */
export const IDENTIFIER_RE = /^[A-Za-z0-9._-]{1,64}$/;
/** Branch names legitimately contain slashes (`branch:feature/auth`), so they get their own rule. */
export const BRANCH_RE = /^[A-Za-z0-9._\-/]{1,120}$/;
export function assertIdentifier(value, what) {
    if (typeof value !== 'string' || !IDENTIFIER_RE.test(value)) {
        throw new AppError('bad-request', `Invalid ${what}.`, `${what} must match ${IDENTIFIER_RE.source}.`, typeof value === 'string' ? value.slice(0, 120) : typeof value);
    }
    return value;
}
/**
 * Avatar files are served from a configured folder; a request must not be able to
 * climb out of it. Fastify's static plugin guards this too — belt and braces,
 * because this one is a file-disclosure bug if it ever regresses.
 */
export function isSafeRelativePath(p) {
    if (p.length === 0 || p.length > 256)
        return false;
    if (p.startsWith('/') || p.includes('\0') || p.includes('\\'))
        return false;
    return p.split('/').every((seg) => seg.length > 0 && seg !== '.' && seg !== '..');
}
//# sourceMappingURL=validate.js.map