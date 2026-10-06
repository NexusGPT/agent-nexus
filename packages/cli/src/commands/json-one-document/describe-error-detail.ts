import type { ErrorOutcome } from "./outcome";
import { preview } from "./preview";

/**
 * The one line a reader is shown for a failed run, quoting the stream that holds
 * the evidence for ITS outcome.
 *
 * Each outcome puts its evidence somewhere different, so the detail is decided
 * per outcome and never by one fallback over stderr. A shared fallback printed
 * `(nothing on either stream)` for an `error-masked` run whose document sat on
 * stdout, which sent the reader hunting for a mute command instead of a
 * mis-shaped document. Only `error-mute` has nothing on either stream.
 */
export function describeErrorDetail(input: {
  readonly errorOutcome: ErrorOutcome;
  readonly miscodeReason: string;
  readonly stdout: string;
  readonly stderr: string;
}): string {
  const { errorOutcome, miscodeReason, stdout, stderr } = input;
  switch (errorOutcome) {
    case "not-an-error":
    case "error-document":
      return "";
    case "error-miscoded":
      return miscodeReason;
    case "error-mute":
      return "(nothing on either stream)";
    case "error-masked": {
      const document = `stdout held a non-error document: ${preview(stdout)}`;
      return stderr === "" ? document : `${document} | stderr: ${preview(stderr)}`;
    }
    case "error-prose":
      // Two shapes reach here: prose on stderr with an empty stdout, and prose or
      // several documents on stdout during a failure. The second can leave
      // stderr empty, and then stdout is the only evidence there is.
      return stderr === "" ? `nothing on stderr; stdout held: ${preview(stdout)}` : preview(stderr);
  }
}
