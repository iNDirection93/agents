import { AppError } from '../errors.js';
/**
 * `bd`'s JSON output is explicitly still evolving, so nothing downstream of here
 * is allowed to assume a shape. This module turns whatever came back on stdout
 * into a plain array of records, and it is the most heavily tested file in the
 * app for exactly that reason (§8).
 *
 * Handles: `BD_JSON_ENVELOPE=1` wrappers, bare arrays, single objects, JSONL, and
 * output with log noise printed ahead of the JSON.
 */
const ENVELOPE_DATA_KEYS = ['data', 'result', 'results', 'issues', 'beads', 'items', 'rows'];
export function parseJsonStdout(stdout, what) {
    const trimmed = stdout.trim();
    if (trimmed.length === 0)
        return null;
    const direct = tryParse(trimmed);
    if (direct.ok)
        return direct.value;
    // A leading log line is common when a subcommand warms the Dolt connection.
    const sliced = sliceFromFirstJson(trimmed);
    if (sliced !== null) {
        const attempt = tryParse(sliced);
        if (attempt.ok)
            return attempt.value;
    }
    const lines = parseJsonLines(trimmed);
    if (lines !== null)
        return lines;
    throw new AppError('bad-json', `Could not parse ${what} as JSON.`, 'Run the command by hand with BD_JSON_ENVELOPE=1 and compare the output shape; the parsers in server/src/bd/envelope.ts may need a new case.', trimmed.slice(0, 400));
}
function tryParse(text) {
    try {
        return { ok: true, value: JSON.parse(text) };
    }
    catch {
        return { ok: false };
    }
}
function sliceFromFirstJson(text) {
    const brace = text.indexOf('{');
    const bracket = text.indexOf('[');
    const candidates = [brace, bracket].filter((i) => i >= 0);
    if (candidates.length === 0)
        return null;
    const start = Math.min(...candidates);
    return start === 0 ? null : text.slice(start);
}
/** JSONL: every non-blank line is its own object. All lines must parse, or it isn't JSONL. */
function parseJsonLines(text) {
    const lines = text.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
    if (lines.length < 2)
        return null;
    const out = [];
    for (const line of lines) {
        const attempt = tryParse(line);
        if (!attempt.ok)
            return null;
        out.push(attempt.value);
    }
    return out;
}
/**
 * Peel the envelope. An explicit `ok: false` / `success: false` is an error the CLI
 * chose to report in-band, and it must not be mistaken for an empty result set.
 */
export function unwrapEnvelope(value, what) {
    if (value === null || Array.isArray(value) || typeof value !== 'object')
        return value;
    const obj = value;
    if (obj.ok === false || obj.success === false) {
        const message = firstString(obj.error, obj.message) ?? `\`bd\` reported a failure for ${what}.`;
        throw new AppError('cli-error', message, 'Run the same command in a terminal to see the full output.', JSON.stringify(obj).slice(0, 400));
    }
    for (const key of ENVELOPE_DATA_KEYS) {
        if (key in obj) {
            const inner = obj[key];
            // Nested envelopes happen: { ok, data: { issues: [...] } }.
            return isPlainObject(inner) ? unwrapEnvelope(inner, what) : inner;
        }
    }
    return obj;
}
/** Everything downstream wants a list, including for the one-record case. */
export function toRecordArray(value) {
    if (value === null || value === undefined)
        return [];
    if (Array.isArray(value))
        return value.filter(isPlainObject);
    if (isPlainObject(value))
        return [value];
    return [];
}
export function parseRecords(stdout, what) {
    return toRecordArray(unwrapEnvelope(parseJsonStdout(stdout, what), what));
}
export function isPlainObject(v) {
    return typeof v === 'object' && v !== null && !Array.isArray(v);
}
function firstString(...vals) {
    for (const v of vals) {
        if (typeof v === 'string' && v.trim())
            return v.trim();
        if (isPlainObject(v) && typeof v.message === 'string')
            return v.message;
    }
    return null;
}
/* ------------------------------------------------------- field access helpers */
/** Field names arrive as snake_case or camelCase depending on the subcommand. */
export function pick(rec, ...names) {
    for (const name of names) {
        if (rec[name] !== undefined && rec[name] !== null)
            return rec[name];
        const camel = name.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
        if (rec[camel] !== undefined && rec[camel] !== null)
            return rec[camel];
        const snake = name.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
        if (rec[snake] !== undefined && rec[snake] !== null)
            return rec[snake];
    }
    return undefined;
}
export function pickString(rec, ...names) {
    const v = pick(rec, ...names);
    if (typeof v === 'string')
        return v;
    if (typeof v === 'number')
        return String(v);
    return null;
}
export function pickNumber(rec, ...names) {
    const v = pick(rec, ...names);
    if (typeof v === 'number' && Number.isFinite(v))
        return v;
    if (typeof v === 'string') {
        const n = Number.parseFloat(v);
        if (Number.isFinite(n))
            return n;
    }
    return null;
}
/** Labels come back as `["a","b"]`, `"a,b"`, or `[{name:"a"}]`. */
export function pickStringArray(rec, ...names) {
    const v = pick(rec, ...names);
    if (Array.isArray(v)) {
        return v
            .map((item) => (typeof item === 'string' ? item : isPlainObject(item) ? pickString(item, 'name', 'label', 'value') : null))
            .filter((s) => !!s && s.length > 0);
    }
    if (typeof v === 'string') {
        return v.split(/[,\s]+/).map((s) => s.trim()).filter((s) => s.length > 0);
    }
    return [];
}
//# sourceMappingURL=envelope.js.map