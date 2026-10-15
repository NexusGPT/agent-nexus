import type { PathCandidate } from "../../../util/resolve-on-path";

/**
 * Everything the upgrade touches outside itself, in one injectable surface.
 *
 * It exists so the SHIPPED path and the TESTED path are the same code. The
 * defect being fixed here was not a missing branch — it was a claim printed
 * without a check, and a spec can only catch that class by driving the real
 * action and reading what it actually printed. Stubbing the registry, the
 * installer and the PATH lookup is what makes that possible with no network and
 * no global write.
 */
export interface UpgradeEnvironment {
  /** The version of the CLI making this call. */
  readonly currentVersion: string;
  /** The newest published version, or null when the registry was unreachable. */
  fetchLatest(): Promise<string | null>;
  /** The exact command line the install will run — printed on every failure. */
  installCommand(): string;
  /** Runs that command. Throws on a non-zero exit. */
  install(command: string): void;
  /** `which -a nexus`, every hit probed for the version it reports. */
  resolve(): readonly PathCandidate[];
  /**
   * The user who invoked `sudo`, or null when this is not an elevated run.
   *
   * 🚨 IT IS ON THE SEAM RATHER THAN READ INLINE, because the whole point is
   * that this process's environment is NOT the one the answer is about. A spec
   * cannot re-enter `sudo`, so the fact has to be injectable or the elevated
   * outcomes are unreachable and therefore untested.
   */
  readonly elevatedBy: string | null;
}

/**
 * Build a hint block from lines, flattening any group of lines passed in.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 AN ARRAY ELEMENT INSIDE `[...].join("\n  ")` STRINGIFIES WITH COMMAS, AND
 *    THE BLOCK COLLAPSES ONTO ONE LINE.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * That regression shipped once in this namespace, on the resolution list — the
 * entire diagnostic this change exists to print came out comma-separated on a
 * single line. Every test still passed, because they matched SUBSTRINGS rather
 * than structure, and a one-line render contains every substring a multi-line
 * one does.
 *
 * The remedy is not a spread anyone has to remember. `flat()` makes a group of
 * lines a legal argument, so the misuse is unrepresentable rather than reviewed.
 */
export function hintLines(...parts: Array<string | readonly string[]>): string {
  return parts.flat().join("\n  ");
}
