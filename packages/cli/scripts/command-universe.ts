/**
 * The bash-facing face of `src/command-universe.ts`.
 *
 * `sweep.sh` needs two things out of the derivation and cannot import
 * TypeScript: the leaves it should execute, and the drift verdict. Both come
 * from the same table the vitest gate asserts against, so the shell and the
 * spec cannot disagree about what the CLI contains.
 *
 * Usage:
 *   tsx scripts/command-universe.ts --print-safe-leaves     # one path per line
 *   tsx scripts/command-universe.ts --print-fixture-leaves  # the non-empty subset
 *   tsx scripts/command-universe.ts --check-drift         # report + exit code
 *   tsx scripts/command-universe.ts --check-drift --json  # machine-readable
 *
 * Exit code of --check-drift: 0 when clean, 1 when ANY drift exists.
 * Deliberately NOT the drift count: a process exit code is one byte, so a count
 * of 256 would arrive as 0 and read as clean. The old bash detector exited
 * `$((untested + stale))` and had exactly that false green in it.
 */
import { classifyCommandUniverse } from "../src/command-universe";

async function main(): Promise<void> {
  const args = new Set(process.argv.slice(2));
  const report = await classifyCommandUniverse();

  if (args.has("--print-safe-leaves")) {
    process.stdout.write(`${report.safe.join("\n")}\n`);
    return;
  }

  // The subset whose response must not be empty. sweep.sh reads this into a
  // lookup, so it is a separate mode rather than a column: bash has no record
  // type, and a two-column format would need a parser on the shell side.
  if (args.has("--print-fixture-leaves")) {
    process.stdout.write(
      report.fixtureBacked.length === 0 ? "" : `${report.fixtureBacked.join("\n")}\n`
    );
    return;
  }

  if (!args.has("--check-drift")) {
    process.stderr.write(
      "Usage: command-universe.ts --print-safe-leaves | --print-fixture-leaves | --check-drift [--json]\n"
    );
    process.exitCode = 2;
    return;
  }

  const drifted = report.unclassified.length + report.stale.length;

  if (args.has("--json")) {
    process.stdout.write(
      `${JSON.stringify(
        {
          drift: {
            unclassified: report.unclassified,
            stale: report.stale,
            observed: report.observed.length,
            safe: report.safe.length
          }
        },
        null,
        2
      )}\n`
    );
  } else {
    process.stdout.write(
      `command universe · ${report.observed.length} leaves derived from the commander tree · ${report.safe.length} safe\n\n`
    );
    if (report.unclassified.length > 0) {
      process.stdout.write(
        `Unclassified (${report.unclassified.length}) — registered in the CLI, named nowhere in COMMAND_CLASSIFICATION:\n`
      );
      process.stdout.write(`${report.unclassified.map((path) => `  · ${path}`).join("\n")}\n\n`);
    }
    if (report.stale.length > 0) {
      process.stdout.write(
        `Stale (${report.stale.length}) — classified, but the CLI no longer registers them:\n`
      );
      process.stdout.write(`${report.stale.map((path) => `  · ${path}`).join("\n")}\n\n`);
    }
    process.stdout.write(
      drifted === 0
        ? "Clean — every leaf the CLI registers is classified.\n"
        : `Drift: ${report.unclassified.length} unclassified + ${report.stale.length} stale\n`
    );
  }

  process.exitCode = drifted === 0 ? 0 : 1;
}

void main();
