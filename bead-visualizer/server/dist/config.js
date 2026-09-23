import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
const DEFAULTS = {
    bdBinary: 'bd',
    port: 5177,
    sessionLabelPattern: '^willie-[0-9a-f]{4}$',
    agentLabels: ['willie', 'frink', 'drnick', 'flanders', 'tod', 'bart', 'lisa'],
    branchLabelPrefix: 'branch:',
    gateLabels: ['gate', 'foundation'],
    gateLabelPrefixes: ['exit:'],
    listCandidates: [
        // `--all` includes closed; `--limit 0` defeats bd's default 50-row cap;
        // `--include-gates` un-hides gate-type beads (this app renders them). Each
        // candidate strips one flag so an older bd that rejects it still gets served.
        ['list', '--all', '--limit', '0', '--include-gates', '--json'],
        ['list', '--all', '--limit', '0', '--json'],
        ['list', '--all', '--json'],
        ['list', '--json'],
    ],
    scopeArgsTemplate: ['--label', '{session}'],
    timeoutMs: 20_000,
    fixture: null,
};
const PREF_DEFAULTS = { lastSessionId: null, collapseDone: false, avatarsDir: null };
function envInt(name) {
    const raw = process.env[name];
    if (!raw)
        return undefined;
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) ? n : undefined;
}
export function loadConfig(appDir, argv = process.argv.slice(2)) {
    const flags = parseFlags(argv);
    const configPath = flags.config
        ? resolve(appDir, flags.config)
        : resolve(appDir, 'beadviz.config.json');
    let fromFile = {};
    if (existsSync(configPath)) {
        try {
            fromFile = JSON.parse(readFileSync(configPath, 'utf8'));
        }
        catch (e) {
            throw new Error(`${configPath} is not valid JSON: ${e.message}`);
        }
    }
    // A repoRoot from the config file is resolved against the config file's own
    // location (appDir), so it does not silently depend on the directory `npm start`
    // was launched from. A --repo flag or BEADVIZ_REPO stays relative to the caller.
    const repoRoot = flags.repo
        ? resolve(flags.repo)
        : process.env.BEADVIZ_REPO
            ? resolve(process.env.BEADVIZ_REPO)
            : fromFile.repoRoot
                ? resolveIn(appDir, fromFile.repoRoot)
                : process.cwd();
    const merged = {
        ...DEFAULTS,
        ...fromFile,
        repoRoot,
        bdBinary: process.env.BEADVIZ_BD ?? fromFile.bdBinary ?? DEFAULTS.bdBinary,
        port: flags.port ?? envInt('BEADVIZ_PORT') ?? fromFile.port ?? DEFAULTS.port,
        avatarsDir: resolveIn(appDir, flags.avatars ?? process.env.BEADVIZ_AVATARS ?? fromFile.avatarsDir ?? 'avatars'),
        prefsFile: resolveIn(appDir, fromFile.prefsFile ?? '.beadviz-prefs.json'),
        fixture: flags.fixture ?? process.env.BEADVIZ_FIXTURE ?? fromFile.fixture ?? null,
    };
    if (merged.fixture)
        merged.fixture = resolveIn(appDir, merged.fixture);
    try {
        new RegExp(merged.sessionLabelPattern);
    }
    catch {
        throw new Error(`sessionLabelPattern is not a valid regex: ${merged.sessionLabelPattern}`);
    }
    return merged;
}
function resolveIn(base, p) {
    return isAbsolute(p) ? p : resolve(base, p);
}
export function parseFlags(argv) {
    const flags = {};
    for (let i = 0; i < argv.length; i++) {
        const [name, inlineValue] = splitFlag(argv[i]);
        const take = () => inlineValue ?? argv[++i];
        switch (name) {
            case '--config':
                flags.config = take();
                break;
            case '--repo':
                flags.repo = take();
                break;
            case '--avatars':
                flags.avatars = take();
                break;
            case '--fixture':
                flags.fixture = take();
                break;
            case '--port': {
                const v = take();
                if (v)
                    flags.port = Number.parseInt(v, 10);
                break;
            }
            default: break;
        }
    }
    return flags;
}
function splitFlag(arg) {
    const eq = arg.indexOf('=');
    return eq === -1 ? [arg, undefined] : [arg.slice(0, eq), arg.slice(eq + 1)];
}
/** UI preference is the only state this app owns — a plain file, never the bead database (§1.1). */
export function readPrefs(file) {
    if (!existsSync(file))
        return { ...PREF_DEFAULTS };
    try {
        return { ...PREF_DEFAULTS, ...JSON.parse(readFileSync(file, 'utf8')) };
    }
    catch {
        return { ...PREF_DEFAULTS };
    }
}
export function writePrefs(file, patch) {
    const next = { ...readPrefs(file), ...patch };
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
    return next;
}
//# sourceMappingURL=config.js.map