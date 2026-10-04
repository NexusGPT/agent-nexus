/**
 * Where the SDK writes each frame's resume cursor as the turn streams.
 *
 * `null` until the first frame carrying an `id:` arrives — and it stays `null`
 * for a frame the server SYNTHESISED, which is the design rather than a gap: a
 * resumed stream re-announces the block the cursor landed inside without
 * recording a new event, so that frame must not move the reader's position.
 */
export interface StreamCursor {
  lastEventId: string | null;
}
