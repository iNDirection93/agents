import type { AppConfig } from '../config.js';
import type { Bead } from './normalize.js';

/**
 * Label interpretation — the answer to §10's open questions, for *this* database.
 *
 * Nothing in `bd` marks a session, an agent, or a gate. All three are conventions
 * in `.kiro/prompts/bead-conventions.md`, so all three are read from labels here
 * and all three are configurable. When the conventions change, this file and
 * beadviz.config.json change; nothing else does.
 */
export class LabelReader {
  private readonly sessionRe: RegExp;
  private readonly agents: Set<string>;

  constructor(private readonly cfg: AppConfig) {
    this.sessionRe = new RegExp(cfg.sessionLabelPattern);
    this.agents = new Set(cfg.agentLabels);
  }

  /** §10.1 — the session ID is a label: Willie tags a planning session `willie-{4-hex}`. */
  sessionsOf(bead: Bead): string[] {
    return bead.labels.filter((l) => this.sessionRe.test(l));
  }

  branchOf(bead: Bead): string | null {
    const p = this.cfg.branchLabelPrefix;
    const hit = bead.labels.find((l) => l.startsWith(p) && l.length > p.length);
    return hit ? hit.slice(p.length) : null;
  }

  /**
   * §10.2 — who acts on this bead.
   *
   * A bead carries its author twice (`willie` and `from-willie`) and its recipient
   * once (`flanders`). So the origin is whichever name has a `from-` twin, and the
   * recipient is the other bare agent name. A self-addressed bead has only one name
   * and is its own recipient. An explicit assignee, if the database has one, wins
   * over all of it.
   */
  agentOf(bead: Bead): string | null {
    if (bead.assignee && this.agents.has(bead.assignee)) return bead.assignee;

    const present = bead.labels.filter((l) => this.agents.has(l));
    if (present.length === 0) return bead.assignee ?? null;

    const origins = new Set(
      bead.labels
        .filter((l) => l.startsWith('from-'))
        .map((l) => l.slice('from-'.length))
        .filter((n) => this.agents.has(n)),
    );
    const recipients = present.filter((l) => !origins.has(l));
    return recipients[0] ?? present[0] ?? null;
  }

  originOf(bead: Bead): string | null {
    const from = bead.labels.find((l) => l.startsWith('from-') && this.agents.has(l.slice(5)));
    return from ? from.slice(5) : null;
  }

  /**
   * §10.3 — gates are a heuristic here, because this database has no gate type.
   * A bead that names the session's successor (`exit:PLANNED`) or that everything
   * else waits on (`foundation`) is structural rather than a unit of work, and
   * those are the two the hexagon is worth spending on.
   */
  isGate(bead: Bead): boolean {
    return bead.labels.some(
      (l) => this.cfg.gateLabels.includes(l) || this.cfg.gateLabelPrefixes.some((p) => l.startsWith(p)),
    );
  }

  /** The emit a gate carries, for the hexagon's caption. */
  gateNameOf(bead: Bead): string | null {
    for (const p of this.cfg.gateLabelPrefixes) {
      const hit = bead.labels.find((l) => l.startsWith(p) && l.length > p.length);
      if (hit) return hit.slice(p.length);
    }
    const plain = bead.labels.find((l) => this.cfg.gateLabels.includes(l));
    return plain ? plain.toUpperCase() : null;
  }

  isAgentName(name: string | null): boolean {
    return !!name && this.agents.has(name);
  }
}

/** Groups beads by session label; a bead in two sessions legitimately appears in both. */
export function groupBySession(beads: Bead[], reader: LabelReader): Map<string, Bead[]> {
  const out = new Map<string, Bead[]>();
  for (const bead of beads) {
    for (const session of reader.sessionsOf(bead)) {
      const bucket = out.get(session);
      if (bucket) bucket.push(bead);
      else out.set(session, [bead]);
    }
  }
  return out;
}
