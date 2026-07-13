#!/bin/sh
# Prepare the data volume and drop from root to the requested PUID:PGID
# before starting the server. Runs under tini (PID 1). Defaults are the
# Unraid convention (nobody:users = 99:100).
set -e

PUID="${PUID:-99}"
PGID="${PGID:-100}"
DATA_DIR="${MOWC_DATA_DIR:-/data}"

# Ensure the mounted data dir exists and is owned by the runtime user so
# SQLite can write mowc.db there. gosu takes a numeric uid:gid directly, so
# no /etc/passwd entry is required.
mkdir -p "$DATA_DIR"
chown -R "$PUID:$PGID" "$DATA_DIR" 2>/dev/null || true

exec gosu "$PUID:$PGID" node /app/server/dist/index.js
