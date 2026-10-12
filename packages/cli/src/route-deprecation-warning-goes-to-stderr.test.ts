import type { DeprecationNotice } from "@agent-nexus/sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  apiDeprecationWarningsEnabled,
  createApiDeprecationReporter
} from "./route-deprecation-warnings";
import {
  API_DEPRECATION_WARNINGS_ENV,
  reportApiDeprecationOnStderr,
  resetApiDeprecationWarnings
} from "./route-deprecation-warnings.report";

/**
 * A ROUTE-RETIREMENT WARNING MUST REACH THE USER WITHOUT CORRUPTING `--json`.
 *
 * `--json` promises exactly one parseable document on stdout. A warning written
 * there breaks every `| jq` in every script this CLI was put into — and it
 * breaks it on the announcement that existed to give that script LEAD TIME,
 * which would make the announcement itself the breaking change, one sunset
 * early. So the assertion is not "it printed something": it is that stdout
 * received NOTHING, on every case, which is the half a happy-path test skips.
 *
 * ── THE SECOND CLAIM: THE DEDUPE ────────────────────────────────────────────
 *
 * 🔴 A WARNING THAT FIRES ONCE BECAUSE ONE REQUEST WAS MADE PROVES NOTHING
 * ABOUT DEDUPE. The case that matters is a paginated walk: N requests to ONE
 * route differing only in the query string. Keyed on the concrete URL, every
 * page prints its own line and the user learns the warning is noise — which is
 * the failure `contract-warnings.ts` already keys around. There is an arm for
 * that below, and it issues two notices rather than one.
 *
 * And the opposite half: two DIFFERENT schedules must not collapse. More than
 * one is live at a time, so a single once-per-process flag would print the first
 * sunset date it met and silently swallow the second — this warning's own
 * failure mode reproduced inside it.
 */

function capture() {
  const stdout: string[] = [];
  const stderr: string[] = [];
  vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
    stdout.push(String(chunk));
    return true;
  });
  vi.spyOn(process.stderr, "write").mockImplementation((chunk: unknown) => {
    stderr.push(String(chunk));
    return true;
  });
  return { stdout, stderr };
}

/** The values the server actually sends, verbatim. */
const DEPRECATION_VALUE = "@1788048000";
const SUNSET_VALUE = "Sat, 28 Nov 2026 00:00:00 GMT";

const BASE: DeprecationNotice = {
  method: "GET",
  url: "https://api.nexusgpt.io/api/public/v1/agents/abc/versions?limit=20",
  deprecation: DEPRECATION_VALUE,
  sunset: SUNSET_VALUE,
  deprecatedAt: new Date(1_788_048_000_000),
  sunsetAt: new Date("2026-11-28T00:00:00.000Z")
};

/** Pinned, so "in N days" is arithmetic rather than a reading of the clock. */
const NOW = new Date("2026-10-11T00:00:00.000Z");

beforeEach(() => {
  resetApiDeprecationWarnings();
});

afterEach(() => {
  vi.restoreAllMocks();
  resetApiDeprecationWarnings();
});

describe("the route-retirement warning", () => {
  it("leaves stdout completely untouched", () => {
    const { stdout } = capture();

    reportApiDeprecationOnStderr(BASE, NOW);

    expect(stdout).toEqual([]);
  });

  it("writes to stderr", () => {
    const { stderr } = capture();

    reportApiDeprecationOnStderr(BASE, NOW);

    expect(stderr.length).toBeGreaterThan(0);
  });

  it("names the route", () => {
    const { stderr } = capture();

    reportApiDeprecationOnStderr(BASE, NOW);

    expect(stderr.join("")).toContain("GET /api/public/v1/agents/abc/versions");
  });

  it("names the sunset date the server stated, verbatim", () => {
    const { stderr } = capture();

    reportApiDeprecationOnStderr(BASE, NOW);

    expect(stderr.join("")).toContain(SUNSET_VALUE);
  });

  it("says how long is left", () => {
    const { stderr } = capture();

    reportApiDeprecationOnStderr(BASE, NOW);

    // 2026-10-11 to 2026-11-28 is 48 days.
    expect(stderr.join("")).toContain("in 48 days");
  });

  it("names the switch that silences it", () => {
    const { stderr } = capture();

    reportApiDeprecationOnStderr(BASE, NOW);

    expect(stderr.join("")).toContain(`${API_DEPRECATION_WARNINGS_ENV}=off`);
  });

  it("drops the query string, which is noise in a warning", () => {
    const { stderr } = capture();

    reportApiDeprecationOnStderr(BASE, NOW);

    // Paired with the positive route arm above, so this cannot be satisfied by
    // an empty haystack: that arm proves the path IS printed.
    expect(stderr.join("")).not.toContain("limit=20");
  });

  it("says the route is deprecated in words, not only by implication", () => {
    const { stderr } = capture();

    reportApiDeprecationOnStderr(BASE, NOW);

    expect(stderr.join("").toLowerCase()).toContain("deprecated");
  });
});

describe("a sunset that has already passed", () => {
  it("says so rather than reporting a negative countdown", () => {
    const { stderr } = capture();

    reportApiDeprecationOnStderr(BASE, new Date("2026-12-01T00:00:00.000Z"));

    expect(stderr.join("")).toContain("may already be gone");
  });
});

/**
 * 🔴 BOTH SIDES OF ZERO, IN SEPARATE BLOCKS.
 *
 * `Math.trunc` collapses toward zero from both directions, so a whole-day count
 * of `0` is two opposite facts: a sunset twelve hours away, and one that passed
 * eleven hours ago. Reported on the truncated count, the elapsed side was
 * announced as "within 24 hours" — a route whose deadline had already arrived,
 * described as still live. Found by review on #7872.
 *
 * One arm cannot defend this. The two sides are the SAME code path under the
 * defect, so an arm on the upcoming side passes either way; only the pair
 * discriminates. They sit in separate `it` blocks because a failing assertion
 * throws and aborts the rest of its own block — two properties in one block
 * means a mutant that moves both scores one of them and the other never runs.
 */
describe("the sub-day boundary", () => {
  /** 12 hours BEFORE the sunset: genuinely upcoming. */
  const TWELVE_HOURS_EARLY = new Date("2026-11-27T12:00:00.000Z");
  /** 11 hours AFTER it: elapsed, and under a day, so the truncated count is 0. */
  const ELEVEN_HOURS_LATE = new Date("2026-11-28T11:00:00.000Z");

  it("calls a sunset twelve hours away upcoming", () => {
    const { stderr } = capture();

    reportApiDeprecationOnStderr(BASE, TWELVE_HOURS_EARLY);

    expect(stderr.join("")).toContain("within 24 hours");
  });

  it("calls a sunset eleven hours PAST elapsed", () => {
    const { stderr } = capture();

    reportApiDeprecationOnStderr(BASE, ELEVEN_HOURS_LATE);

    expect(stderr.join("")).toContain("may already be gone");
  });

  it("does not call a sunset eleven hours PAST upcoming", () => {
    const { stderr } = capture();

    reportApiDeprecationOnStderr(BASE, ELEVEN_HOURS_LATE);

    // Paired with the upcoming arm above, which proves this exact wording DOES
    // reach stderr — so this cannot be satisfied by an empty haystack.
    expect(stderr.join("")).not.toContain("within 24 hours");
  });

  it("treats a sunset exactly NOW as elapsed, not as a day of headroom", () => {
    const { stderr } = capture();

    // The instant RFC 8594 names is the instant the resource may stop
    // answering. Early costs the reader nothing; late costs them the outage.
    reportApiDeprecationOnStderr(BASE, new Date("2026-11-28T00:00:00.000Z"));

    expect(stderr.join("")).toContain("may already be gone");
  });

  it("still counts whole days on the upcoming side at the 1-day boundary", () => {
    const { stderr } = capture();

    reportApiDeprecationOnStderr(BASE, new Date("2026-11-26T12:00:00.000Z"));

    expect(stderr.join("")).toContain("in 1 day");
  });

  it("still counts whole days on the elapsed side at the 1-day boundary", () => {
    const { stderr } = capture();

    reportApiDeprecationOnStderr(BASE, new Date("2026-11-29T12:00:00.000Z"));

    expect(stderr.join("")).toContain("1 day ago");
  });
});

describe("a half-announced retirement", () => {
  it("says no date has been announced when `Sunset` is absent", () => {
    const { stderr } = capture();

    reportApiDeprecationOnStderr({ ...BASE, sunset: undefined, sunsetAt: undefined }, NOW);

    expect(stderr.join("")).toContain("No sunset date has been announced");
  });

  it("invents no countdown when `Sunset` could not be parsed", () => {
    const { stderr } = capture();

    reportApiDeprecationOnStderr({ ...BASE, sunset: "whenever", sunsetAt: undefined }, NOW);

    expect(stderr.join("")).not.toContain("days");
  });

  it("still shows the raw `Sunset` it could not parse", () => {
    const { stderr } = capture();

    reportApiDeprecationOnStderr({ ...BASE, sunset: "whenever", sunsetAt: undefined }, NOW);

    expect(stderr.join("")).toContain("whenever");
  });

  it("shows the obsolete `Deprecation: true` spelling raw", () => {
    const { stderr } = capture();

    reportApiDeprecationOnStderr({ ...BASE, deprecation: "true", deprecatedAt: undefined }, NOW);

    expect(stderr.join("")).toContain("Deprecation: true");
  });
});

describe("the dedupe is keyed by route AND schedule", () => {
  it("prints ONE line for a paginated walk over one deprecated route", () => {
    const { stderr } = capture();

    // The same route, two pages. Keyed on the concrete URL this would print
    // twice, and fifty times for a fifty-page walk.
    reportApiDeprecationOnStderr(BASE, NOW);
    reportApiDeprecationOnStderr({ ...BASE, url: `${BASE.url}&cursor=p2` }, NOW);

    expect(stderr.filter((line) => line.includes("agents/abc/versions"))).toHaveLength(1);
  });

  it("prints ONE line for the identical signal reported twice", () => {
    const { stderr } = capture();

    reportApiDeprecationOnStderr(BASE, NOW);
    reportApiDeprecationOnStderr(BASE, NOW);

    expect(stderr.filter((line) => line.includes("DEPRECATED"))).toHaveLength(1);
  });

  it("prints BOTH lines for two routes on two different schedules", () => {
    const { stderr } = capture();

    reportApiDeprecationOnStderr(BASE, NOW);
    reportApiDeprecationOnStderr(
      {
        ...BASE,
        url: "https://api.nexusgpt.io/api/public/v1/claude-code/skills",
        deprecation: "@1789344000",
        sunset: "Sun, 13 Dec 2026 00:00:00 GMT",
        deprecatedAt: new Date(1_789_344_000_000),
        sunsetAt: new Date("2026-12-13T00:00:00.000Z")
      },
      NOW
    );

    expect(stderr.filter((line) => line.includes("DEPRECATED"))).toHaveLength(2);
  });

  it("names the SECOND schedule's sunset date, which a single flag would swallow", () => {
    const { stderr } = capture();

    reportApiDeprecationOnStderr(BASE, NOW);
    reportApiDeprecationOnStderr(
      {
        ...BASE,
        url: "https://api.nexusgpt.io/api/public/v1/claude-code/skills",
        sunset: "Sun, 13 Dec 2026 00:00:00 GMT",
        sunsetAt: new Date("2026-12-13T00:00:00.000Z")
      },
      NOW
    );

    expect(stderr.join("")).toContain("Sun, 13 Dec 2026 00:00:00 GMT");
  });

  it("re-announces one route whose schedule MOVED", () => {
    const { stderr } = capture();

    reportApiDeprecationOnStderr(BASE, NOW);
    reportApiDeprecationOnStderr(
      { ...BASE, sunset: "Mon, 14 Dec 2026 00:00:00 GMT", sunsetAt: new Date("2026-12-14") },
      NOW
    );

    expect(stderr.filter((line) => line.includes("DEPRECATED"))).toHaveLength(2);
  });
});

describe("the switch", () => {
  it("is on by default", () => {
    expect(apiDeprecationWarningsEnabled({})).toBe(true);
  });

  it("installs no observer when switched off, so the SDK does no work either", () => {
    expect(createApiDeprecationReporter({ [API_DEPRECATION_WARNINGS_ENV]: "off" })).toBeUndefined();
  });

  it("accepts the value in any casing, with surrounding space", () => {
    expect(apiDeprecationWarningsEnabled({ [API_DEPRECATION_WARNINGS_ENV]: " OFF " })).toBe(false);
  });

  it("warns on a value that merely LOOKS like off", () => {
    // `=0` and `=false` are not the documented switch. Silencing on them would
    // make the warning disappear for a reader who never asked.
    expect(apiDeprecationWarningsEnabled({ [API_DEPRECATION_WARNINGS_ENV]: "0" })).toBe(true);
  });

  it("installs an observer that writes to stderr when on", () => {
    const { stdout, stderr } = capture();
    const report = createApiDeprecationReporter({});

    report?.(BASE);

    expect(stdout).toEqual([]);
    expect(stderr.length).toBeGreaterThan(0);
  });
});
