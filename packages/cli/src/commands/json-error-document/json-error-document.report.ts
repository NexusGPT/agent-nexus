export interface ProseRefusal {
  /** `<file>:<line>`, relative to the scanned root. */
  readonly where: string;
  /** What the walk saw, in one line. */
  readonly detail: string;
}

export interface StaticScanReport {
  readonly filesScanned: number;
  /**
   * Every non-zero exit statement the walk reached.
   *
   * The POPULATION, and the control on the walk itself: a parser that silently
   * stopped matching reports zero violations over zero exits, which reads
   * exactly like a clean tree.
   */
  readonly exitSites: number;
  /** Exits whose code is an emitter's return value. Compliant by construction. */
  readonly exitsThroughEmitter: number;
  /** Helper names classified prose-only, across every scanned file. */
  readonly proseHelpers: readonly string[];
  readonly violations: readonly ProseRefusal[];
}
