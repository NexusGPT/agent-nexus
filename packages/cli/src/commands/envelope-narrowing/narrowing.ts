import path from "node:path";
import { fileURLToPath } from "node:url";

/** One response key that never reaches `--json`. */
export interface EnvelopeNarrowing {
  /** Path relative to `src/`, e.g. `commands/folder.ts`. */
  readonly file: string;
  /** 1-based line of the printer call. */
  readonly line: number;
  /** The printer that received the narrowed payload. */
  readonly printer: string;
  /** The response variable the payload was taken off. */
  readonly source: string;
  /** The one key the printer was handed. */
  readonly taken: string;
  /** Keys of the response's declared type that no visible read reaches, sorted. */
  readonly lost: readonly string[];
}

/**
 * `src/` of this package, resolved from THIS file so the cwd cannot change it.
 *
 * 🚨 TWO `..` SEGMENTS, AND THE COUNT IS A PROPERTY OF THIS FILE'S DEPTH RATHER
 * THAN OF THE ANSWER. The resolver is module-relative, so moving it one
 * directory deeper moves the scan root with it — `src/` becomes
 * `src/commands/` — and EVERY COUNT STAYS IDENTICAL, because the printers this
 * scan is about all live under `commands/`. The only tell is a lost path prefix
 * in {@link EnvelopeNarrowing.file}. It read `..` while it sat in
 * `commands/envelope-narrowing.scan.ts`; it reads `.. , ..` here, which is the
 * same spelling `status-verdict/finding.ts` carries for the same reason.
 *
 * So a part that moves between this folder and `commands/` has to move this
 * segment count with it, and the proof is the emitted LIST — never its length.
 */
export function defaultScanRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
}

/** `commands/folder.ts printTable folders` — stable across an edit above it. */
export function narrowingKey(narrowing: EnvelopeNarrowing): string {
  return `${narrowing.file} ${narrowing.printer} ${narrowing.taken}`;
}
