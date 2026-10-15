import { invalidInput } from "../../errors";
import type { Engine, MountRecord } from "../../mount-registry";
import { isEngine } from "./engine-name";

/**
 * The row's engine, VALIDATED rather than trusted.
 *
 * `mount` reaches its engine through `resolveEngine`/`isEngine`; `remount`
 * reads it off a registry row that `readMounts` parses and CASTS. An
 * unrecognised value — a row written by a newer CLI, a hand edit — walked past
 * `refuseEngineOffPlatform`'s if-chain and reached the dispatch switch, whose
 * `satisfies never` arm RETURNS at runtime. `mounted.record` was then
 * undefined, the spread wrote nothing, the registry was rewritten, and the
 * command printed "Remounted" having mounted nothing — a False Green on the one
 * verb whose job is bringing a dead drive back.
 */
export function remountableEngine(record: MountRecord, slug: string): Engine {
  const engine = record.engine;
  if (isEngine(engine)) return engine;
  throw invalidInput(
    `The registry row for "${slug}" names engine "${String(engine)}", which this CLI does not have. It was probably written by a newer one.`,
    `Run: nexus workspace unmount ${slug}, then mount it again with this CLI — or upgrade: npm install -g @agent-nexus/cli@latest.`
  );
}

/**
 * The mode the row RECORDS, refusing the silence of a row written before one
 * was stored.
 *
 * 🔴 A row written before the mode was recorded says NOTHING about what was
 * asked for, and `status` prints `Mode ?` for exactly that reason. `?? false`
 * would resolve that silence to the MORE PERMISSIVE answer: a drive
 * deliberately mounted `--read-only` comes back writable, and the row is then
 * rewritten claiming `rw`, so the honest unknown is gone too. Nobody is granted
 * anything they lack — the server still grades the credential — but a guardrail
 * the caller chose disappears without a word. The silence is refused instead,
 * and the pair that can state a mode is named.
 */
export function recordedReadOnly(record: MountRecord, slug: string): boolean {
  if (record.readOnly !== undefined) return record.readOnly;
  throw invalidInput(
    `The registry row for "${slug}" records no read-only mode — it was written before the CLI stored one, so remount cannot know whether you asked for a read-only drive.`,
    `Run: nexus workspace unmount ${slug}, then nexus workspace mount ${slug} (add --read-only to keep it read-only).`
  );
}
