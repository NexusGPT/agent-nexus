import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { exitCodeForHttpStatus } from "./exit-codes";

const SRC_DIR = dirname(fileURLToPath(import.meta.url));

/**
 * `nexus admin --help` RESTATES THE HTTP MAP, AND A SECOND COPY IS A SECOND
 * THING TO DRIFT.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 THAT TABLE IS THE ORIGINAL SIN OF THIS WHOLE CHANGE, IN MINIATURE.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * The admin namespace published `2 → 401, 3 → 403, 4 → 404, 5 → 400/422,
 * 6 → 5xx` as prose beside a function that decided the same thing in code, and
 * nothing compared them. It is exactly how the CLI came to hold four maps that
 * disagreed. Deleting the table would be worse — an operator reading `--help`
 * needs it — so it is JOINED to `exitCodeForHttpStatus` instead.
 *
 * Parsed from the help text rather than from the source, because the help text
 * is what a reader acts on. A row whose status this cannot parse is REPORTED as
 * unparsed, never skipped: a regex that silently matches nothing would make an
 * empty comparison look like agreement, which is this file's own failure mode.
 */
describe("the admin --help exit table agrees with the one HTTP rule", () => {
  const adminHelp = (): string => readFileSync(join(SRC_DIR, "commands", "admin.ts"), "utf8");

  /**
   * Each row classified, never silently dropped. A row is EXACT (it names
   * statuses), a RANGE (`5xx`), or UNPARSED — and unparsed is a failure, so a
   * regex that stops matching cannot read as agreement.
   */
  const rows = (): readonly {
    code: number;
    exact: readonly number[];
    ranges: readonly string[];
  }[] => {
    const help = adminHelp();
    const table = help.slice(help.indexOf("Exit codes"));
    return [...table.matchAll(/^ {2}(\d+) {2}[^\n(]*\(HTTP ([^)]+)\)/gm)].map(([, code, raw]) => {
      const parts = raw.split("/").map((part) => part.trim());
      return {
        code: Number(code),
        exact: parts.filter((part) => /^\d+$/.test(part)).map(Number),
        ranges: parts.filter((part) => /^\dxx$/.test(part))
      };
    });
  };

  it("finds a non-empty table — an unparsed table must not read as agreement", () => {
    expect(rows().length).toBeGreaterThan(0);
  });

  it("classifies every row it found — nothing is silently dropped", () => {
    const unparsed = rows()
      .filter((row) => row.exact.length === 0 && row.ranges.length === 0)
      .map((row) => row.code);
    expect(unparsed).toEqual([]);
  });

  it("agrees with exitCodeForHttpStatus on every status it names", () => {
    const disagreements = rows().flatMap((row) =>
      row.exact
        .filter((status) => exitCodeForHttpStatus(status) !== row.code)
        .map(
          (status) =>
            `--help says HTTP ${String(status)} exits ${String(row.code)}, the code says ${String(
              exitCodeForHttpStatus(status)
            )}`
        )
    );
    expect(disagreements).toEqual([]);
  });

  it("agrees on every range row, at both ends of the range", () => {
    const ranged = rows().flatMap((row) => row.ranges.map((r) => ({ code: row.code, r })));
    // The table names exactly one range today. Asserting it is non-empty stops
    // a reworded row from turning this case into a green that checks nothing.
    expect(ranged.length).toBeGreaterThan(0);

    const disagreements = ranged.flatMap(({ code, r }) => {
      const hundred = Number(r[0]) * 100;
      return [hundred, hundred + 99]
        .filter((status) => exitCodeForHttpStatus(status) !== code)
        .map(
          (status) =>
            `--help says HTTP ${r} exits ${String(code)}, the code says ${String(
              exitCodeForHttpStatus(status)
            )} for ${String(status)}`
        );
    });
    expect(disagreements).toEqual([]);
  });

  it("no longer tells the reader this table is namespace-only", () => {
    // It said "every other command in this CLI exits 0 or 1 and nothing else",
    // which instructed a reader to distrust the one table that became universal.
    expect(adminHelp()).not.toContain("THIS NAMESPACE ONLY");
  });
});
