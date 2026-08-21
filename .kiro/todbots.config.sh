# Todbot configuration — sourced by every .kiro/skills/todbot-*/ script.
#
# Every value can be overridden by:
#   1. the environment  (TODBOT_CLI=... ./spawn.sh ...)
#   2. .kiro/todbots.config.local.sh  (gitignored — your personal defaults)
#
# Nothing here is secret. Credentials live in <mission-dir>/.env.auth (mode 0600).

# --- how a todbot is launched -------------------------------------------------
# The window runs: $TODBOT_CLI $TODBOT_CLI_ARGS <bot-name>
# Default assumes the Kiro CLI's interactive chat with a named agent.
: "${TODBOT_CLI:=kiro-cli}"
: "${TODBOT_CLI_ARGS:=chat --agent}"

# Seconds to wait after opening the window before typing the first prompt,
# so the CLI has finished booting. Set to 0 in tests.
: "${TODBOT_READY_WAIT:=6}"

# --- supervision --------------------------------------------------------------
# A bot is "stuck" when its log has not grown for this many seconds.
: "${TODBOT_STUCK_SECS:=120}"

# How many nudges Tod may send before he must escalate to the human.
: "${TODBOT_NUDGE_MAX:=2}"

# Default ceiling for wait.sh, in seconds.
: "${TODBOT_WAIT_TIMEOUT:=1800}"

# --- layout -------------------------------------------------------------------
: "${TODBOT_MISSION_ROOT:=.kiro/tod}"
: "${TODBOT_SESSION_PREFIX:=tod-}"

# --- push policy (sim-todbot, pipeline runs) ----------------------------------
# auto : push to the mission branch without asking; protected branches still ask
# ask  : every push asks first
# off  : never push; sim-todbot returns NEEDS-PIPELINE instead
: "${TODBOT_PUSH_MODE:=auto}"

# Empty means "the branch that is currently checked out".
: "${TODBOT_PUSH_BRANCH:=}"

# Pushing to any of these always requires explicit human approval, recorded in
# the mission log, regardless of TODBOT_PUSH_MODE.
: "${TODBOT_PROTECTED_BRANCHES:=main master dev develop release}"

# --- observability ------------------------------------------------------------
# Filled in by .kiro/skills/todbot-observability/ — see that skill's SKILL.md.
# Put real values in .kiro/todbots.config.local.sh, not here.
: "${TODBOT_K8S_NAMESPACE:=tool-platform}"
: "${TODBOT_TRACE_SINK_URL:=}"     # e.g. http://otel-sink.tool-platform.svc.cluster.local:4319
: "${TODBOT_METRICS_URL:=}"        # Prometheus-compatible /api/v1/query base URL
: "${TODBOT_METRICS_TOKEN_FILE:=}" # path to a file holding a bearer token, if needed

# --- local overrides ----------------------------------------------------------
# shellcheck source=/dev/null
[ -f "$(dirname "${BASH_SOURCE[0]}")/todbots.config.local.sh" ] &&
  . "$(dirname "${BASH_SOURCE[0]}")/todbots.config.local.sh"

true
