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
}

function loadConfig(): Config {
  const port = Number(process.env["MOWC_PORT"] ?? "7120");
  const dataDir = process.env["MOWC_DATA_DIR"] ?? "/data";
  const adminEmail = process.env["MOWC_ADMIN_EMAIL"];
  return { port, dataDir, adminEmail };
}

export const config: Config = loadConfig();
