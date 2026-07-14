import type { Response } from "express";
import type { Authz } from "./index.js";

const KEEPER_ONLY = { errors: [{ path: "", message: "only the campaign's Keeper can do this" }] } as const;

/**
 * Guards a Keeper-only campaign action through the authz module. Sends 404 for
 * a non-member (so a probed UUID is indistinguishable from a real campaign the
 * user is not in) and 403 for a seated hunter, per docs/SECURITY.md section 3.
 * Returns true only when the caller is the Keeper and may proceed.
 *
 * notFound is a caller parameter because the two mount points label the id
 * path differently ("id" vs "campaignId"); the access decision itself does not
 * vary and lives entirely in authz.
 */
export function requireKeeper(
  authz: Authz,
  campaignId: string,
  userId: string,
  res: Response,
  notFound: unknown
): boolean {
  const role = authz.roleFor(campaignId, userId);
  if (role === "none") {
    res.status(404).json(notFound);
    return false;
  }
  if (role !== "keeper") {
    res.status(403).json(KEEPER_ONLY);
    return false;
  }
  return true;
}
