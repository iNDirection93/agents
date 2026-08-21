---
name: todbot-tmux
description: Runs and supervises todbots in tmux windows for a Tod bug mission. Use when Tod needs to spawn a recon-todbot, sim-todbot, or terminator-todbot, check on one, nudge one that has stalled, wait for one to finish, hand a stuck bot over to the human, or tear a mission down. Provides mission-init.sh, spawn.sh, peek.sh, wait.sh, nudge.sh, and teardown.sh plus the sentinel protocol the bots use to report verdicts. Do not use for Kiro sub-agent spawning, for running application services (that is NedOps), or for any agent other than a todbot.
---

# todbot-tmux

Todbots run in tmux windows, not as Kiro sub-agents. Three reasons, and they are the whole
justification for this skill:

1. **A stuck bot can be corrected.** `nudge.sh` types into the live session; the bot keeps its
   context. A sub-agent can only be waited on or killed.
2. **A human can take over.** `tmux attach` puts the user in the same conversation, mid-run. This is
   the escape hatch that makes long autonomous runs safe to attempt.
3. **A crash costs the tail, not the session.** The pane is piped to a log and the bot writes its
   report as it goes; a sub-agent that dies at summary time takes everything with it.

The cost: nothing supervises the bots automatically. Tod does, using these scripts.

## Layout

```
.kiro/tod/<bd-id>/            mission directory (gitignored except the repro guide)
  <window>.log                redacted pane transcript
  .nudges-<window>            nudge counter
  99-mission-log.md           gate decisions, nudges, approvals
tmux session: tod-<bd-id>     one window per bot
```

Config — `.kiro/todbots.config.sh`, overridable per machine in
`.kiro/todbots.config.local.sh` (gitignored). The values you are most likely to change:
`TODBOT_CLI` / `TODBOT_CLI_ARGS` (how the CLI is invoked), `TODBOT_STUCK_SECS`, `TODBOT_NUDGE_MAX`.

## The scripts

```bash
S=.kiro/skills/todbot-tmux

$S/mission-init.sh bd-a1b2                    # create the mission dir + skeleton files
$S/spawn.sh    bd-a1b2 recon                  # window "recon" running recon-todbot
$S/spawn.sh    bd-a1b2 recon verify           # a SECOND recon, in window "verify" (G4)
$S/peek.sh     bd-a1b2 recon [lines]          # read the pane; never sends keys
$S/wait.sh     bd-a1b2 recon --timeout 900    # block until a terminal condition
$S/nudge.sh    bd-a1b2 recon "Add the failure signature, then continue."
$S/teardown.sh bd-a1b2                        # end of mission
```

`spawn.sh` requires the brief to exist first: `mission-<window>.md` in the mission directory. A bot
launched without a brief has no mission, and improvising one is exactly the failure this system
exists to prevent.

### wait.sh exit codes — the branch table

| Output | Code | What Tod does |
|---|---|---|
| `DONE:<VERDICT>` | 0 | read the artifact, judge the gate |
| `BLOCKED:<REASON>` | 10 | resolve (auth, env) or escalate; does not count against the nudge cap |
| `STUCK` | 11 | `peek.sh`, diagnose, `nudge.sh` |
| `TIMEOUT` | 12 | `peek.sh`, then nudge or terminate and re-brief |
| `GONE` | 13 | the window died — read the log tail and the report file, then decide |

```bash
if out=$($S/wait.sh bd-a1b2 recon --timeout 900); then
  verdict=${out#DONE:}
else
  case $? in
    11) $S/peek.sh bd-a1b2 recon; $S/nudge.sh bd-a1b2 recon "<specific correction>" ;;
    20) : ;;   # nudge cap — escalate to the human, do not retry
  esac
fi
```

## The sentinel protocol

Bots report verdicts by printing a single line. Tod polls for it; he does not parse prose, and he
does not decide a bot is finished because the pane looks quiet.

```
TODBOT-DONE:<bot>:<VERDICT>
TODBOT-BLOCKED:<bot>:<REASON>
```

The last sentinel in the log wins — a bot may block on auth, get unblocked, and then finish.

| Bot | Verdicts | Blocked reasons |
|---|---|---|
| recon (G1) | `REPRODUCED` `NO-REPRO` | `AUTH` `ENV` `SCOPE` `NO-BRIEF` |
| recon (G4) | `CLEAN` `STILL-BROKEN` `NEW-SYMPTOM` | same |
| sim | `TEST-RED` `CANNOT-EXPRESS` `NEEDS-PIPELINE` | `ENV` `NO-BRIEF` |
| terminator | `TEST-GREEN` `TEST-WRONG` `FIX-EXCEEDS-SCOPE` | `ENV` `NO-BRIEF` |

**A sentinel is a claim, not proof.** `TODBOT-DONE:recon:REPRODUCED` means "I believe I am finished".
The gate opens on the artifact, which Tod reads.

## Log redaction

`spawn.sh` pipes the pane through `redact.sh` before anything touches disk: bearer tokens, JWTs
(`eyJ…`), `X-Api-Key`, and `Authorization:` values are replaced. It is deliberately over-eager — a
redacted log is recoverable, a leaked token is not.

This is defence in depth, not permission. Bots are still forbidden from printing credentials: the
redactor only sees what reaches the pane, and it will not catch a token a bot has base64'd,
reformatted, or split across lines.

## Handing over to a human

Two unanswered nudges and `nudge.sh` refuses with exit 20 and prints the attach command. Give the
user three things:

```
tmux attach -t tod-bd-a1b2 \; select-window -t recon
```

1. the command, verbatim;
2. what the bot is stuck on, specifically;
3. what would unblock it — a credential, a decision, a service restart.

The user can type directly at the bot; it will treat their input as Tod's. When they say it's
unblocked, `wait.sh` again — the counter stays where it is, so a bot that stalls twice more escalates
again rather than looping forever.

To detach without killing anything: `Ctrl-b d`.

## Notes

- **One bot at a time.** The gates are sequential — sim needs recon's signature, terminator needs
  sim's test. Two bots running means one is working from an artifact that doesn't exist yet.
- **Never `send-keys` by hand.** Use `nudge.sh` so the counter and the mission log stay honest.
- **`teardown.sh` refuses** while `10-repro-guide.md` is missing. Recover the artifact from the pane
  first; `--force` only when the mission ended at `NO-REPRO`.
- **The window outlives the CLI.** When the agent exits, the pane drops to a shell so its last output
  and any crash survive for inspection.
