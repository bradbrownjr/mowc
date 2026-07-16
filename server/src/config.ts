/**
 * Server configuration loaded from environment variables. Names here must
 * match the Dockerfile / compose files exactly (see the "Docker volume env
 * var" gotcha in AGENTS.md): a mismatch silently writes the database
 * outside the mounted volume.
 */
export interface Config {
  port: number;
  dataDir: string;
  /** Email of the server-owner account; see server/src/authz/admin.ts. */
  adminEmail: string | undefined;
  /** Express `trust proxy` value; see parseTrustProxy. */
  trustProxy: number | false;
}

/**
 * docs/SECURITY.md section 8: when MOWC is behind a reverse proxy, rate
 * limiting and the fail2ban log lines must see the real client IP from
 * X-Forwarded-For; when it is exposed directly, that header is
 * client-controlled and must be ignored. There is no safe way to
 * auto-detect this, so the admin states it: MOWC_TRUST_PROXY unset/0/false
 * ignores the header (direct exposure, the default); a positive integer
 * trusts that many proxy hops (1 for the usual single nginx/caddy/traefik
 * in front); "true" is treated as 1 hop, never "trust everything", so a
 * spoofed X-Forwarded-For from the internet can not fake an IP.
 */
export function parseTrustProxy(raw: string | undefined): number | false {
  if (raw === undefined) {
    return false;
  }
  const normalized = raw.trim().toLowerCase();
  if (normalized === "" || normalized === "0" || normalized === "false") {
    return false;
  }
  if (normalized === "true") {
    return 1;
  }
  const hops = Number(normalized);
  return Number.isInteger(hops) && hops > 0 ? hops : false;
}

function loadConfig(): Config {
  const port = Number(process.env["MOWC_PORT"] ?? "7120");
  const dataDir = process.env["MOWC_DATA_DIR"] ?? "/data";
  const adminEmail = process.env["MOWC_ADMIN_EMAIL"];
  const trustProxy = parseTrustProxy(process.env["MOWC_TRUST_PROXY"]);
  return { port, dataDir, adminEmail, trustProxy };
}

export const config: Config = loadConfig();
