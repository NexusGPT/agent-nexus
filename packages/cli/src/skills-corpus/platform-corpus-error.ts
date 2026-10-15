import type { FailureCause } from "../errors";

/**
 * Why the platform's corpus could not be used, and which failure category that is.
 *
 * It sits in its own module because BOTH halves of a platform read throw it — the
 * transport in `platform.ts` and the interpretation in `corpus-document.ts` — and the
 * transport calls into the interpretation. Holding the class in either half would make
 * the two import each other, which `import/no-cycle` reports and which makes the
 * initialisation order of a `class` declaration depend on which module node loads first.
 *
 * 🔴 EVERY REFUSAL ON THIS PATH HAS TO BE ONE OF THESE. `resolve.ts` catches exactly
 * this class to decide whether to install the corpus bundled with the CLI instead, and
 * rethrows anything else — so an ordinary `Error` escaping from here is the difference
 * between a complete install of a known commit and a failed install.
 */
export class PlatformCorpusError extends Error {
  readonly failure: FailureCause;

  constructor(failure: FailureCause, message: string) {
    super(message);
    this.failure = failure;
    this.name = "PlatformCorpusError";
  }
}
