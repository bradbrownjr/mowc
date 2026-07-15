import { HealthzResponseSchema, type HealthzResponse } from "@mowc/shared";

export const healthState = $state<{ health: HealthzResponse | null; status: "loading" | "ready" | "offline" }>({
  health: null,
  status: "loading"
});

let initStarted = false;

/** Idempotent: call once from the root layout on mount. */
export async function initHealth(): Promise<void> {
  if (initStarted) return;
  initStarted = true;
  try {
    const res = await fetch("/healthz");
    healthState.health = HealthzResponseSchema.parse(await res.json());
    healthState.status = "ready";
  } catch {
    healthState.status = "offline";
  }
}
