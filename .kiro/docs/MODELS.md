# Model allocation

## The rule

| Problem | Context window it needs | Model |
|---|---|---|
| Complex | small — a focused evidence set | **GPT-5.6 Sol** |
| Complex | long — dialogue, fan-out, whole documents | **Claude Opus 5** |
| Simple, well-defined | any | **Claude Sonnet 5** |

Two axes, not one. "Hard problem" does not imply "big model" here — it implies a capable one, and
capable-over-a-narrow-view is a different purchase from capable-over-a-large-view.

## The roster

| Agent | Model | Complexity | Context | Why |
|---|---|---|---|---|
| **Frink** | Opus 5 | complex | long | multi-turn design dialogue, 4–8 oracle returns, and a whole design document held at once |
| **Dr. Nick** | Opus 5 | complex | long | the co-design conversation is the long part, even though his *artifacts* are small |
| **Willie** | Opus 5 | complex | long | stigmergic scan, parallel Lisa returns, a ≤500-line plan, and package allocation across the tree |
| **Flanders** | Sonnet 5 | mostly simple | medium | the bead defines the work; **the one seat where escalation matters** — see below |
| **Tod** | Sol | complex | small | gate judgement and adjudication over five short report files. He never reads code |
| **Bart** | Sol | complex | medium | the `ADAPTED` vs `DID-NOT-FOLLOW` call — hard judgement over close reasons and diffs |
| **Lisa** | Sonnet 5 | simple | medium | one scoped question in, a structured answer out |
| **Comic Book Guy** | Sol | complex | small | a contract clause plus an anchor plus a gap; he greps the corpus rather than loading it |
| **recon-todbot** | Sol | complex | small–medium | diagnosis under uncertainty, over a deliberately focused evidence set |
| **sim-todbot** | Sol | complex | small | test-design judgement — the anti-naive rubric — over a repro guide and one test file |
| **terminator-todbot** | Sonnet 5 | simple | small | the origin is named, the test is given, make it green without touching it |

Three Opus seats, five Sol, three Sonnet.

## Why so little Opus

**The one-task rule is what makes the cheap models viable.** An agent that does exactly one job, and
receives its inputs as *paths to artifacts* rather than as pasted content, has a small context by
construction. That is not a happy accident — it is what the durable-artifact discipline buys.

Look at what the three Opus seats have in common: every one of them holds a **long, multi-turn
conversation with a human**. Frink and Dr. Nick co-design with the user; Willie negotiates a plan
until it's approved. Nothing else in the roster does that. Tod supervises bots through files, Bart
reads closed beads, the todbots each answer one question.

So the check when you are tempted to put a new agent on Opus is: *does it talk with a person for a
long time, or does it read one thing and decide?* The second is a Sol seat.

## Escalation

**Flanders is the only seat where a session's difficulty changes underneath you.** Most beads are
well-defined — implement what the bead says, test it live, commit. But the debug loop is open-ended,
and a bead that looked simple can turn into an afternoon of tracing.

Run him on Sonnet 5 and escalate the session when the loop deepens. The signal is concrete: **two
failed fix attempts.** That is also the trigger for handing the bug to Tod, so the decision is the
same one either way — escalate the model, or escalate to the bug graph.

Everything else has a fixed difficulty because it has a fixed job.

## What to watch

The Sol seats are the ones this allocation is betting on, so they are where you would notice first
if the rule is wrong for this workload:

| Seat | The failure that would tell you to move it to Opus |
|---|---|
| **Bart** | calling everything `ADAPTED` — collapsing the judgement rather than making it. That distinction is the entire value of the harvest |
| **recon-todbot** | reading code instead of running the system, or log volume genuinely blowing the context on a multi-deploy hunt |
| **sim-todbot** | tests that pass the rubric on paper but are coupled to the fix — a counterfactual clause written as a formality |
| **Tod** | opening a gate on a promise, or granting an iteration past a cap |

None of those are subtle. They show up in the artifacts, which is why the artifacts exist.

## Allocating a new agent

1. **Is the problem well-defined?** Does the agent receive a specification of what to do, or does it
   have to work out what to do? Well-defined → Sonnet 5, stop here.
2. **Does it hold a long conversation with a person, or fan out to several sub-agents and synthesize
   their returns?** → Opus 5.
3. **Otherwise** — complex judgement over a bounded set of artifacts → Sol.

If step 2 is a close call, that is usually a sign the agent is doing two jobs. Splitting it is the
better fix, and it will land both halves on cheaper models.

## Identifiers

```
claude-opus-5      Frink, Dr. Nick, Willie
claude-sonnet-5    Flanders, Lisa, terminator-todbot
gpt-5.6-sol        Tod, Bart, Comic Book Guy, recon-todbot, sim-todbot
```

> ⚠️ **`gpt-5.6-sol` is inferred from the naming convention, not confirmed against the deployment.**
> Check it once against whatever your Kiro install actually accepts and correct the five JSONs if it
> differs — nothing else in the module depends on the string, so it is a one-line fix per file.

Model IDs live only in `.kiro/agents/*.json`. No prompt, skill, or script reads them.
