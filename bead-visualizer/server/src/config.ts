import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';

/**
 * Everything here has a default that matches this repo's `bead-conventions.md`,
 * and every default is overridable — the conventions are a convention, not a
 * schema, and the next database will label things differently.
 */
export interface AppConfig {
  /** Directory containing `.beads/`; `bd` runs with this as cwd. */
  repoRoot: string;
  bdBinary: string;
  port: number;
  avatarsDir: string;
  prefsFile: string;

  /**
   * Which label carries the session ID. Willie tags every bead in a planning
   * session with `willie-{4-hex}` (bead-conventions.md §7 "Session Tags").
   */
  sessionLabelPattern: string;

  /**
   * The agent roster. A bead carries its origin as a bare name plus `from-<name>`,
   * and its recipient as a second bare name; the avatar is the recipient — whoever
   * has to act — with the origin as the fallback for self-addressed beads.
   */
  agentLabels: string[];

  /** Prefix carrying the branch, e.g. `branch:feature/auth`. */
  branchLabelPrefix: string;

  /**
   * Gates. This database has no gate bead type, so it is a heuristic: a bead that
   * closes a session names its successor with `exit:<EMIT>`, and `foundation`
   * beads are the ones everything else waits on. Both read as structural.
   */
  gateLabels: string[];
  gateLabelPrefixes: string[];

  /**
   * `bd list` flags have moved around between releases. The first candidate that
   * exits cleanly wins, so an upgrade is a config edit rather than a patch.
   */
  listCandidates: string[][];
  /** Applied to a scoped prune/purge. `{session}` is substituted, never interpolated into a shell. */
  scopeArgsTemplate: string[];

  timeoutMs: number;
  /** Serve a JSON fixture instead of shelling out. Demo and test only; flagged in the UI. */
  fixture: string | null;
}

const DEFAULTS: Omit<AppConfig, 'repoRoot' | 'avatarsDir' | 'prefsFile'> = {
  bdBinary: 'bd',
  port: 5177,
  sessionLabelPattern: '^willie-[0-9a-f]{4}$',
  agentLabels: ['willie', 'frink', 'drnick', 'flanders', 'tod', 'bart', 'lisa'],
  branchLabelPrefix: 'branch:',
  gateLabels: ['gate', 'foundation'],
  gateLabelPrefixes: ['exit:'],
  listCandidates: [
    ['list', '--all', '--json'],
    ['list', '--status', 'all', '--json'],
    ['list', '--json'],
  ],
  scopeArgsTemplate: ['--label', '{session}'],
  timeoutMs: 20_000,
  fixture: null,
};

export interface UiPrefs {
  lastSessionId: string | null;
  collapseDone: boolean;
  avatarsDir: string | null;
}

const PREF_DEFAULTS: UiPrefs = { lastSessionId: null, collapseDone: false, avatarsDir: null };

function envInt(name: string): number | undefined {
  const raw = process.env[name];
  if (!raw) return undefined;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : undefined;
}

export function loadConfig(appDir: string, argv: string[] = process.argv.slice(2)): AppConfig {
  const flags = parseFlags(argv);
  const configPath = flags.config
    ? resolve(appDir, flags.config)
    : resolve(appDir, 'beadviz.config.json');

  let fromFile: Partial<AppConfig> = {};
  if (existsSync(configPath)) {
    try {
      fromFile = JSON.parse(readFileSync(configPath, 'utf8')) as Partial<AppConfig>;
    } catch (e) {
      throw new Error(`${configPath} is not valid JSON: ${(e as Error).message}`);
    }
  }

  const repoRoot = resolve(
    flags.repo ?? process.env.BEADVIZ_REPO ?? fromFile.repoRoot ?? process.cwd(),
  );

  const merged: AppConfig = {
    ...DEFAULTS,
    ...fromFile,
    repoRoot,
    bdBinary: process.env.BEADVIZ_BD ?? fromFile.bdBinary ?? DEFAULTS.bdBinary,
    port: flags.port ?? envInt('BEADVIZ_PORT') ?? fromFile.port ?? DEFAULTS.port,
    avatarsDir: resolveIn(appDir, flags.avatars ?? process.env.BEADVIZ_AVATARS ?? fromFile.avatarsDir ?? 'avatars'),
    prefsFile: resolveIn(appDir, fromFile.prefsFile ?? '.beadviz-prefs.json'),
    fixture: flags.fixture ?? process.env.BEADVIZ_FIXTURE ?? fromFile.fixture ?? null,
  };

  if (merged.fixture) merged.fixture = resolveIn(appDir, merged.fixture);
  try {
    new RegExp(merged.sessionLabelPattern);
  } catch {
    throw new Error(`sessionLabelPattern is not a valid regex: ${merged.sessionLabelPattern}`);
  }
  return merged;
}

function resolveIn(base: string, p: string): string {
  return isAbsolute(p) ? p : resolve(base, p);
}

interface Flags {
  config?: string;
  repo?: string;
  avatars?: string;
  fixture?: string;
  port?: number;
}

export function parseFlags(argv: string[]): Flags {
  const flags: Flags = {};
  for (let i = 0; i < argv.length; i++) {
    const [name, inlineValue] = splitFlag(argv[i]!);
    const take = (): string | undefined => inlineValue ?? argv[++i];
    switch (name) {
      case '--config': flags.config = take(); break;
      case '--repo': flags.repo = take(); break;
      case '--avatars': flags.avatars = take(); break;
      case '--fixture': flags.fixture = take(); break;
      case '--port': {
        const v = take();
        if (v) flags.port = Number.parseInt(v, 10);
        break;
      }
      default: break;
    }
  }
  return flags;
}

function splitFlag(arg: string): [string, string | undefined] {
  const eq = arg.indexOf('=');
  return eq === -1 ? [arg, undefined] : [arg.slice(0, eq), arg.slice(eq + 1)];
}

/** UI preference is the only state this app owns — a plain file, never the bead database (§1.1). */
export function readPrefs(file: string): UiPrefs {
  if (!existsSync(file)) return { ...PREF_DEFAULTS };
  try {
    return { ...PREF_DEFAULTS, ...(JSON.parse(readFileSync(file, 'utf8')) as Partial<UiPrefs>) };
  } catch {
    return { ...PREF_DEFAULTS };
  }
}

export function writePrefs(file: string, patch: Partial<UiPrefs>): UiPrefs {
  const next = { ...readPrefs(file), ...patch };
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  return next;
}
