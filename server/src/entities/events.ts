/**
 * In-process pub/sub for live table play (docs/ARCHITECTURE.md "SSE, not
 * WebSockets"; ROADMAP 0.6.1). A committed sync push (or a migration) advances
 * a bucket's `seq`; this bus fans that fact out to every open SSE connection
 * for the same bucket as a bare wake signal ("seq advanced to N"), never a
 * payload. Each connected client then runs its own authz-filtered `pull`, so
 * the live path inherits the pull path's visibility filtering for free and can
 * never leak an unrevealed entity to a hunter (docs/SYNC.md invariant 4).
 *
 * Pure pub/sub, keyed by bucket id (a campaign id; the standalone owner-bucket
 * simply has no subscribers since it has no events endpoint). A factory, not a
 * shared singleton, so createApp() builds a fresh instance per app and tests
 * stay isolated (same convention as the rate limiters).
 */
export interface CampaignEventBus {
  /**
   * Registers a listener for a bucket. Returns an unsubscribe function that is
   * safe to call more than once.
   */
  subscribe(bucketId: string, listener: (seq: number) => void): () => void;
  /** Notifies every listener for a bucket that its committed seq advanced. */
  publish(bucketId: string, seq: number): void;
}

export function createCampaignEventBus(): CampaignEventBus {
  const listeners = new Map<string, Set<(seq: number) => void>>();

  return {
    subscribe(bucketId, listener) {
      let set = listeners.get(bucketId);
      if (!set) {
        set = new Set();
        listeners.set(bucketId, set);
      }
      set.add(listener);
      return () => {
        const current = listeners.get(bucketId);
        if (!current) {
          return;
        }
        current.delete(listener);
        if (current.size === 0) {
          listeners.delete(bucketId);
        }
      };
    },

    publish(bucketId, seq) {
      const set = listeners.get(bucketId);
      if (!set) {
        return;
      }
      // Copy before iterating so a listener that unsubscribes mid-fan-out cannot
      // disturb the walk. Each call is isolated: a write to a half-closed SSE
      // socket (racing its 'close' cleanup) must not stop the wake reaching the
      // other connected clients. The event is a best-effort wake, so a failed
      // delivery is dropped, not retried.
      for (const listener of [...set]) {
        try {
          listener(seq);
        } catch {
          // best-effort: one dead connection must not break the fan-out
        }
      }
    }
  };
}
