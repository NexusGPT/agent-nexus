/**
 * The shapes the resolution list is made of.
 *
 * Declared here rather than beside either reader because three modules need
 * them — the prober that fills a candidate in, the judge that reads the first
 * one, and the formatter that renders all of them. One declaration, three
 * importers, no copy to drift.
 */

/** One `nexus` on the PATH, and what it says it is. */
export interface PathCandidate {
  /** The path exactly as PATH resolution found it — symlinks NOT followed. */
  readonly path: string;
  /** The version it reports, or null when it could not be read. */
  readonly version: string | null;
  /** Why the version could not be read. Null when it was read. */
  readonly failure: string | null;
}

/** Runs a candidate and returns what it printed. Injected so specs need no disk. */
export type VersionProbe = (binary: string) => { version: string | null; failure: string | null };
