/**
 * Live table play (ROADMAP 0.6.1): subscribe to a campaign's Server-Sent Events
 * stream and pull on every wake. The server emits a bare `sync` event (carrying
 * only a seq) whenever a committed push or migration advances the campaign; the
 * client reacts by running its normal authz-filtered `pull`, so liveness needs
 * no new read path and can never receive an entity it may not see.
 *
 * SSE is a strict enhancement over the existing polling/`online`-event sync
 * (docs/SYNC.md "When sync runs"): if EventSource is unavailable or the
 * connection drops, play still works, only less live. EventSource reconnects
 * natively; on each (re)connect the server sends an initial `sync` event, so a
 * client that missed events while offline pulls to catch up (docs/SYNC.md "on
 * SSE reconnect").
 */

/**
 * Opens the campaign's SSE stream and calls `onSync` on every server event
 * (including the initial connect event and each native reconnect). Returns a
 * disposer that closes the stream; safe to call when EventSource is absent (SSR
 * or an old browser), where it is a no-op.
 */
export function connectCampaignEvents(campaignId: string, onSync: () => void): () => void {
  if (typeof EventSource === "undefined") {
    return () => {};
  }
  // Same-origin request: the session cookie is sent automatically, which is the
  // only auth the stream accepts (docs/SECURITY.md section 2).
  const source = new EventSource(`/api/campaigns/${campaignId}/events`);
  source.addEventListener("sync", () => onSync());
  return () => source.close();
}
