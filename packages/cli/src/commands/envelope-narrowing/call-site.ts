import type { EnvelopeNarrowing } from "./narrowing";

/** The printers whose payload argument decides what a `--json` document holds. */
export const NARROWING_PRINTERS: ReadonlySet<string> = new Set([
  "printTable",
  "printList",
  "printRecord"
]);

/**
 * Why a printer call site is NOT reported as a narrowing.
 *
 * The two `*-reaches-the-document` values and `inside-envelope` are the CURED
 * shapes. They are named separately from the "there was nothing to lose" ones
 * because a control asserts the scan can still recognise a cure — see
 * `envelope-narrowing.test.ts`, part 3.
 */
export type PrinterExemption =
  /** The call takes no payload argument at all. */
  | "no-payload-argument"
  /** Under `!isJsonMode()`: it writes no document, so it drops nothing from one. */
  | "human-only"
  /** Inside a `printEnvelope(...)` callback. THE CURE. */
  | "inside-envelope"
  /** The payload is not a property read off a resolvable response variable. */
  | "payload-is-not-a-response-key"
  /** The response declares one key; narrowing it loses nothing. */
  | "single-key-response"
  /** The whole response is handed to a printer somewhere. THE CURE. */
  | "whole-response-reaches-the-document"
  /** Every declared key is read somewhere the caller can still see. */
  | "every-key-reaches-the-document";

/**
 * One narrowing-printer call site the walk reached, and what the scan made of it.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * THIS POPULATION SURVIVES THE CURE, AND THAT IS THE WHOLE REASON IT EXISTS
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * The narrowings are MEANT to reach zero. So "the scan found a narrowing" cannot
 * be the control that proves the scan looked at anything — it dies on success,
 * and a control that dies on success takes the gate with it on the day somebody
 * fixes the last command.
 *
 * A cured command still calls `printTable`; it simply calls it inside
 * `printEnvelope`. So this population does not drain, and a zero here means the
 * walk broke rather than that the tree got clean.
 */
export interface PrinterCallSite {
  /** Path relative to `src/`, e.g. `commands/folder.ts`. */
  readonly file: string;
  /** 1-based line of the printer call. */
  readonly line: number;
  /** The printer that was called. */
  readonly printer: string;
  /** The narrowing this site was reported as, or `null` when it is exempt. */
  readonly narrowing: EnvelopeNarrowing | null;
  /** Why it is exempt, or `null` when it IS a narrowing. */
  readonly exempt: PrinterExemption | null;
}
