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
 *   tsx scripts/command-universe.ts --print-expected-skips  # skips the sweep accepts
 *   tsx scripts/command-universe.ts --print-pending-deploy  # leaf + route + cause
 *   tsx scripts/command-universe.ts --check-drift         # report + exit code
 *   tsx scripts/command-universe.ts --check-drift --json  # machine-readable
 *
 * Exit code of --check-drift: 0 when clean, 1 when ANY drift exists.
 * Deliberately NOT the drift count: a process exit code is one byte, so a count
 * of 256 would arrive as 0 and read as clean. The old bash detector exited
 * `$((untested + stale))` and had exactly that false green in it.
 */
import { classifyCommandUniverse } from "../src/command-universe";

/**
 * What a declared pending-deploy path may contain, kept byte-identical to
 * `scripts/route-not-deployed.sh`'s own `ROUTE_NOT_DEPLOYED_PATH_CHARSET`.
 *
 * Two copies, deliberately, and this is the one that fires FIRST. The matcher
 * refuses a malformed path per-leaf, mid-sweep, after every other leaf has
 * already run; this refuses before the sweep executes anything, so a typo in the
 * declaration costs a readable refusal rather than one red leaf among sixty. A
 * single copy is not available without a parser on one side or the other, so the
 * divergence is bounded instead: a path this accepts and the matcher refuses is
 * reported by the matcher as a REFUSAL rather than as "no match", and the spec
 * asserts that direction.
 */
const PENDING_DEPLOY_PATH = /^\/[A-Za-z0-9/_.~-]+$/;

/**
 * The three-column line `sweep.sh` reads, TAB-separated.
 *
 * ⚠️ A DEPARTURE FROM THE ONE-PATH-PER-LINE RULE THE OTHER MODES FOLLOW, AND IT
 * IS NOT A DRIFT. `--print-fixture-leaves` is one column because its second
 * column would have been a boolean already implied by membership; here the route
 * is the thing that makes the declaration BINDING, so membership without it is
 * an acceptance with nothing bound to it. One `IFS=$'\t' read` on the shell side
 * is the whole of the cost, which is not a parser.
 *
 * It REFUSES rather than emitting a line it cannot guarantee: a TAB or a newline
 * inside a field would split one declaration into two, and a path outside the
 * charset would be spliced into a regular expression.
 */
function pendingDeployLines(report: Awaited<ReturnType<typeof classifyCommandUniverse>>): string[] {
  return report.pendingDeploy.map(({ path, route, cause }) => {
    if (!PENDING_DEPLOY_PATH.test(route)) {
      throw new Error(
        `SWEEP_ROUTES_PENDING_DEPLOY["${path}"].route is ${JSON.stringify(route)}, which is not a ` +
          `literal path. It is spliced into a regular expression by ` +
          `scripts/route-not-deployed.sh, so a declaration like ".*" would accept every 404 there ` +
          `is. Allowed: ${PENDING_DEPLOY_PATH.source}`
      );
    }
    if (/[\t\n\r]/.test(cause)) {
      throw new Error(
        `SWEEP_ROUTES_PENDING_DEPLOY["${path}"].cause carries a tab or a newline. The sweep reads ` +
          `one TAB-separated line per declaration, so it would split this entry into two.`
      );
    }
    return `${path}\t${route}\t${cause}`;
  });
}

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

  // The skips the sweep accepts. Emptiness is legitimate — an environment that
  // answers every leaf declares nothing — so unlike the safe-leaf list this one
  // is never treated as a refusal by the caller.
  if (args.has("--print-expected-skips")) {
    process.stdout.write(
      report.expectedSkips.length === 0 ? "" : `${report.expectedSkips.join("\n")}\n`
    );
    return;
  }

  // The absences the sweep accepts, with the route each one is bound to.
  // Emptiness is legitimate — a branch introducing no route declares nothing —
  // so, like the two modes above, the caller never treats it as a refusal. A
  // malformed DECLARATION is a different matter and refuses here, loudly, before
  // the sweep executes a leaf.
  if (args.has("--print-pending-deploy")) {
    let lines: string[];
    try {
      lines = pendingDeployLines(report);
    } catch (error) {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      process.exitCode = 2;
      return;
    }
    process.stdout.write(lines.length === 0 ? "" : `${lines.join("\n")}\n`);
    return;
  }

  if (!args.has("--check-drift")) {
    process.stderr.write(
      "Usage: command-universe.ts --print-safe-leaves | --print-fixture-leaves | --print-expected-skips | --print-pending-deploy | --check-drift [--json]\n"
    );
    process.exitCode = 2;
    return;
  }

  const drifted =
    report.unclassified.length +
    report.stale.length +
    report.staleExpectedSkips.length +
    report.stalePendingDeploy.length;

  if (args.has("--json")) {
    process.stdout.write(
      `${JSON.stringify(
        {
          drift: {
            unclassified: report.unclassified,
            stale: report.stale,
            staleExpectedSkips: report.staleExpectedSkips,
            stalePendingDeploy: report.stalePendingDeploy,
            observed: report.observed.length,
            safe: report.safe.length,
            expectedSkips: report.expectedSkips.length,
            pendingDeploy: report.pendingDeploy.length
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
    if (report.staleExpectedSkips.length > 0) {
      process.stdout.write(
        `Stale expected-skips (${report.staleExpectedSkips.length}) — named in SWEEP_EXPECTED_SKIPS, but the sweep does not execute them:\n`
      );
      process.stdout.write(
        `${report.staleExpectedSkips.map((path) => `  · ${path}`).join("\n")}\n\n`
      );
    }
    if (report.stalePendingDeploy.length > 0) {
      process.stdout.write(
        `Stale pending-deploy (${report.stalePendingDeploy.length}) — named in SWEEP_ROUTES_PENDING_DEPLOY, but the sweep does not execute them:\n`
      );
      process.stdout.write(
        `${report.stalePendingDeploy.map((path) => `  · ${path}`).join("\n")}\n\n`
      );
    }
    process.stdout.write(
      drifted === 0
        ? "Clean — every leaf the CLI registers is classified.\n"
        : `Drift: ${report.unclassified.length} unclassified + ${report.stale.length} stale + ${report.staleExpectedSkips.length} stale expected-skip(s) + ${report.stalePendingDeploy.length} stale pending-deploy\n`
    );
  }

  process.exitCode = drifted === 0 ? 0 : 1;
}

void main();
