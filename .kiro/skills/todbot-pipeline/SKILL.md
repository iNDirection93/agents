---
name: todbot-pipeline
description: Runs a todbot's test through GitLab CI with the glab CLI, under an explicit push policy. Use when a sim-todbot needs an integration or system test executed by the pipeline rather than locally, when a todbot needs to check whether its pushed job passed, when reading a failing job's log, or when Tod needs to decide whether a push to a protected branch is allowed. Provides push.sh (the only sanctioned push path) and the glab commands for watching and tracing jobs. Do not use for local test runs, for merge requests, or for pushing anything a human has not scoped to the mission.
---

# todbot-pipeline

Most of a sim-todbot's work runs locally. Sometimes the failure only appears in the deployed
topology, and then the test has to run in CI. This skill is that path — and the guardrail on it.

## Push policy

One rule, enforced in `push.sh` rather than restated in three prompts:

| Situation | Behaviour |
|---|---|
| pushing the **current mission branch** | allowed by default (`TODBOT_PUSH_MODE=auto`) |
| pushing a **protected** branch (`main`, `master`, `dev`, `develop`, `release`) | **always** needs explicit human approval, once per mission, recorded in `99-mission-log.md` |
| publishing this HEAD onto another branch (`--head-to dev`) | needs the same explicit approval; never implicit |
| `TODBOT_PUSH_MODE=ask` | every push asks |
| `TODBOT_PUSH_MODE=off` | no pushes at all; sim returns `NEEDS-PIPELINE` |

The default is deliberate. A bot pushing to the branch its own mission is on is doing exactly what
the human asked for. A bot pushing to `dev` is touching everyone's work, so a human says yes first —
and says it in a way that is recorded.

```bash
P=.kiro/skills/todbot-pipeline

$P/push.sh                       # current branch, policy-checked
$P/push.sh --dry-run             # show what would happen, change nothing
$P/push.sh --head-to dev         # exits 3 until approval is granted
TODBOT_PUSH_APPROVED=1 $P/push.sh --head-to dev     # after Tod records the user's yes
```

| Exit | Meaning | What the bot does |
|---|---|---|
| 0 | pushed | continue; watch the pipeline |
| 3 | approval required | print `TODBOT-DONE:sim:NEEDS-PIPELINE`, stop, let Tod ask |
| 4 | pushing disabled | same — this is not a puzzle to route around |
| 2 | error (dirty index, wrong branch, no remote) | fix it, or report it |

`push.sh` also refuses to push a branch you are not on. That check exists because "push my work to
dev" and "push the branch I'm on" look identical in a hurry and are not the same operation.

**Never** `git push --force`, `--force-with-lease`, or push to a branch outside the mission. If a
push is rejected, that is a `BLOCKED` — report it, don't invent a way around it.

## Getting a test into CI

```bash
git add <test files only>
git commit -m "WIP: add failing test reproducing tool URN resolution"   # WIP: per .kiro/skills/commit
.kiro/skills/todbot-pipeline/push.sh
```

`WIP:` is the right prefix — this commit is a red test, deliberately. It gets squashed or amended
when the terminator lands the fix.

## Watching it

```bash
glab ci status                      # pipelines for the current branch
glab ci status --live               # follow to completion
glab ci list --per-page 5
glab ci view                        # the pipeline's job graph
```

## Reading a failure

Do not report "the pipeline failed". Read the job:

```bash
glab ci get --pipeline-id <id>            # which job failed
glab ci trace <job-id>                    # the actual log
glab ci trace <job-id> | tail -n 200      # usually where the truth is
glab ci artifact <ref> <job-name>         # surefire/gotest reports, when published
```

Three questions, in this order:

1. **Did the job even reach the test?** Checkout, dependency resolution, and image pull failures are
   not your test failing — they are the pipeline being unwell. Say so and don't rewrite the test.
2. **Did the test fail for the reason in the repro guide?** Same rule as locally: the failure output
   must correspond to the failure signature. Different reason means it's a different defect, and
   nobody has reproduced the original one yet.
3. **Is it deterministic?** Re-run once (`glab ci retry <job-id>`). A test that fails intermittently
   is not a reproduction — it is a second bug that will haunt whoever inherits it.

## Cost discipline

A pipeline run costs minutes and a shared runner; a local run costs seconds. Before pushing, be able
to say what the pipeline gives you that the local run cannot — the deployed topology, real LCP, a
service you cannot mock. "It's easier to let CI run it" is not a reason, and it turns a five-minute
loop into a thirty-minute one.

`glab` not authenticated? `glab auth login` is interactive — the user runs it in their own terminal.
That is a `BLOCKED:ENV`, not something to work around with raw `curl` against the API.
