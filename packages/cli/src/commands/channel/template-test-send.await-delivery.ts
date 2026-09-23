import {
  pollForTerminalState,
  type PollReading,
  type PollWindow
} from "../../util/poll-for-terminal-state";

/** The delivery fields `getTestSendStatus` answers with, as this poll reads them. */
export interface DeliveryStatusResponse {
  readonly status: string;
  readonly errorCode?: unknown;
  readonly errorMessage?: unknown;
}

/** How long `test-send --wait` watches a message, and how often it asks. */
export const DELIVERY_POLL_WHEN_WAITING: PollWindow = {
  budgetMs: 120_000,
  intervalMs: 5_000
};

/** Twilio has delivered it. Nothing further will happen. */
export function isDeliverySucceeded(status: string): boolean {
  return status === "delivered" || status === "read";
}

/** Twilio has given up on it. The send was still billed. */
export function isDeliveryFailed(status: string): boolean {
  return status === "failed" || status === "undelivered";
}

/** Delivery has stopped moving, one way or the other. */
export function isDeliveryTerminal(status: string): boolean {
  return isDeliverySucceeded(status) || isDeliveryFailed(status);
}

/** What `test-send --wait`'s poll arrived at. */
export interface DeliveryOutcome {
  /** The last status observed, falling back to the one the send itself returned. */
  readonly status: string;
  /** Twilio's error fields. Only ever set alongside a FAILED status. */
  readonly errorCode: unknown;
  readonly errorMessage: unknown;
  /**
   * A probe actually SAW a terminal status — as opposed to the send's own status
   * already being one. Only the renderer's success and failure lines are
   * entitled to this; the still-in-transit line keys off the status itself.
   */
  readonly observedTerminal: boolean;
}

/**
 * Read one delivery probe into a poll reading.
 *
 * The error fields are carried ONLY for a failed status. A non-terminal reading
 * that happens to carry an `errorCode` does not put one in the document, because
 * a transient code on a still-moving message is not the reason it failed.
 */
export function readDeliveryStatus(
  response: DeliveryStatusResponse
): PollReading<DeliveryStatusResponse> {
  return { value: response, terminal: isDeliveryTerminal(response.status) };
}

/**
 * Watch a test send until Twilio settles it or `--wait`'s budget runs out.
 *
 * Probe failures are SWALLOWED: the message is already sent and already billed,
 * so a transient status read must not turn that into a non-zero exit. The cost
 * is that a persistently failing read reports as "still in transit".
 */
export async function awaitDeliveryOutcome(
  probeStatus: () => Promise<DeliveryStatusResponse>,
  sentStatus: string
): Promise<DeliveryOutcome> {
  const reading = await pollForTerminalState(
    DELIVERY_POLL_WHEN_WAITING,
    async () => readDeliveryStatus(await probeStatus()),
    "swallow"
  );

  const status = reading?.value.status ?? sentStatus;
  const failed = reading?.terminal === true && isDeliveryFailed(status);

  return {
    status,
    errorCode: failed ? reading?.value.errorCode : undefined,
    errorMessage: failed ? reading?.value.errorMessage : undefined,
    observedTerminal: reading?.terminal === true
  };
}
