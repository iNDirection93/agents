#!/usr/bin/env bash
# Line-buffered credential scrubber for todbot pane transcripts.
#
# Reads the piped pane on stdin, writes the scrubbed line to stdout immediately.
#
# Why a read-loop and not `awk`/`sed`: awk and sed block-buffer their INPUT when
# it is a pipe or socket, so a live pane produces nothing on disk until several
# kilobytes have accumulated — which defeats both `wait.sh` (sentinel polling)
# and stuck detection. `read` on a non-seekable fd consumes a byte at a time, so
# each line lands as it is produced. One `sed` fork per line is irrelevant at
# chat-pane volumes and buys exact regex semantics on both GNU and BSD.
#
# Deliberately over-eager: a redacted log is recoverable, a leaked token is not.

while IFS= read -r line || [ -n "$line" ]; do
  printf '%s\n' "$line" | sed -E \
    -e 's/[Bb][Ee][Aa][Rr][Ee][Rr][[:space:]]+[A-Za-z0-9._~+\/=-]+/Bearer <REDACTED>/g' \
    -e 's/eyJ[A-Za-z0-9._-]{8,}/<JWT-REDACTED>/g' \
    -e 's/([Xx]-[Aa][Pp][Ii]-[Kk][Ee][Yy][:=][[:space:]]*)[^[:space:]"'"'"']+/\1<REDACTED>/g' \
    -e 's/([Aa][Uu][Tt][Hh][Oo][Rr][Ii][Zz][Aa][Tt][Ii][Oo][Nn]:[[:space:]]*)[^[:space:]"'"'"']+/\1<REDACTED>/g' \
    -e 's/(TODBOT_AUTH_HEADER|TODBOT_TOKEN|API_KEY|api_key)=[^[:space:]]+/\1=<REDACTED>/g'
done
