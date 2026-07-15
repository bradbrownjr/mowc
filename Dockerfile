# MOWC image: multi-stage build, non-root at runtime (PUID/PGID), tini as
# PID 1. Serves the built SvelteKit client and the Express API from one
# Node process. Only $MOWC_DATA_DIR is written at runtime.
#
# Runtime layout matches what the server resolves at run time:
#   /app/server/dist/index.js   -> entrypoint
#   /app/client/build           -> static client (app.ts resolves ../../client/build)
#   /app/shared/dist            -> @mowc/shared (node_modules symlink target)
#   /app/server/dist/db/migrations -> SQL migrations copied by the build

# ---- Build stage -----------------------------------------------------------
# bookworm (not slim) ships the C toolchain needed to compile the
# better-sqlite3 native addon. Runtime uses bookworm-slim on the same glibc,
# so the compiled .node is ABI-compatible.
FROM node:20-bookworm AS build
WORKDIR /app

# Install dependencies first for layer caching. Copy every workspace's
# manifest so npm can resolve the workspace graph, then npm ci.
COPY package.json package-lock.json ./
COPY shared/package.json ./shared/
COPY server/package.json ./server/
COPY client/package.json ./client/
RUN npm ci

# Copy the rest of the source and build shared -> server -> client (the
# root build script enforces that dependency order).
COPY . .
RUN npm run build

# ---- Runtime stage ---------------------------------------------------------
FROM node:20-bookworm-slim AS runtime
ENV NODE_ENV=production \
    MOWC_PORT=7120 \
    MOWC_DATA_DIR=/data \
    PUID=99 \
    PGID=100

# tini (PID 1, reaps zombies), gosu (drop to PUID:PGID at start), and
# poppler-utils (pdftotext/pdfinfo for the admin PDF-to-pack conversion
# endpoint, ADR 0001). poppler-utils ships no game content, only the tool.
RUN apt-get update \
    && apt-get install -y --no-install-recommends tini gosu poppler-utils \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy only what the server needs to run. node_modules carries the compiled
# better-sqlite3 and the @mowc/shared workspace symlink, whose target
# (/app/shared) is copied alongside it.
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/shared/package.json ./shared/package.json
COPY --from=build /app/shared/dist ./shared/dist
COPY --from=build /app/server/package.json ./server/package.json
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/client/build ./client/build

COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

EXPOSE 7120
VOLUME ["/data"]

# Health check hits the API on loopback (kept allowed by design). Uses the
# global fetch so no extra tooling is needed in the slim image, and so it
# works regardless of whether node -e is treated as ESM or CommonJS.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD ["node", "--no-warnings", "-e", "fetch('http://127.0.0.1:'+(process.env.MOWC_PORT||7120)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]

# tini is PID 1; the entrypoint prepares the data dir and drops to PUID:PGID.
ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/entrypoint.sh"]
