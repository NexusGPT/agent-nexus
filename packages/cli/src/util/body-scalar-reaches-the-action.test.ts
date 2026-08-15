import http from "node:http";
import type { AddressInfo } from "node:net";

import { Command } from "commander";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildRootProgram } from "../index";
import {
  applyBodySatisfiesRequired,
  resolveBodyField,
  scalarAsFlagValue
} from "./body-satisfies-required";
import {
  commandPath,
  deferredPopulation,
  MINIMUM_DEFERRED_COMMANDS,
  MINIMUM_DEFERRED_OPTIONS,
  TREE_TIMEOUT_MS
} from "./deferred-requirements.testkit";

/**
 * A FIELD SUPPLIED IN `--body` MUST REACH THE ACTION, WHATEVER ITS JSON TYPE.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * THE DEFECT THIS GATES
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `applyBodySatisfiesRequired` does two things: it lets a required field be
 * satisfied from the body, and it BACKFILLS that value into the option store so
 * `opts.<field>` reads what the flag would have given. The second half is not
 * optional — a required flag is not always a body field. `access-card create
 * --credential-id` is a URL SEGMENT, and with the requirement deferred and
 * nothing backfilled the command stopped erroring and started sending
 *
 *   POST /api/public/v1/credentials/undefined/cards
 *
 * The backfill was written as `if (typeof fromBody === "string")`, which closed
 * that for a string and left it wide open for every other scalar. A body
 * spelling the same id as a number — `{"credentialId":12345}`, which is what a
 * JSON author writes for something that looks numeric — satisfied the check,
 * backfilled nothing, and sent the identical `undefined` path.
 *
 * The failure reads as success. The CLI exits 0 on a 2xx, so the only surface
 * that shows it is the REQUEST, which is why the end-to-end case below asserts
 * on the URL a real server receives rather than on the CLI's exit code.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHY A COMPOSITE IS STILL LEFT ALONE
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * The line is not "string versus not a string" — it is whether the FLAG HAS A
 * FORM for the value. Commander hands an action a string for every value-taking
 * option, so a number and a boolean have exact flag spellings and an array does
 * not: `String(["a","b"])` is a coincidence rather than a conversion, and
 * writing it where an action expects a comma-separated string turns a clear
 * failure into a `TypeError`. So scalars are converted, composites are refused,
 * and both halves are asserted here — a gate that only checked the conversion
 * would pass a fix that coerced everything.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * POPULATION FIRST
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Every assertion over an empty population is vacuously true, so the population
 * is floored before anything is asserted about it. The floors live in
 * `deferred-requirements.testkit.ts` beside the derivation they bound.
 */

describe("the population this gate reasons about is real", () => {
  it(
    "defers a substantial number of commands, and every one of their flags",
    async () => {
      const population = await deferredPopulation();
      const options = population.flatMap((entry) => entry.options);

      // CONTROL. A collapsed population and a working fix are the same empty
      // result, and `toBeGreaterThan(0)` survives a collapse from dozens to one.
      expect(population.length).toBeGreaterThanOrEqual(MINIMUM_DEFERRED_COMMANDS);
      expect(options.length).toBeGreaterThanOrEqual(MINIMUM_DEFERRED_OPTIONS);

      // The command that carries the URL-segment case must be IN the population,
      // or the end-to-end assertion below is testing a path nothing else reaches.
      expect(population.map((entry) => commandPath(entry.command))).toContain("access-card create");
    },
    TREE_TIMEOUT_MS
  );

  it(
    "resolves a body key for every deferred flag, so every refusal can name one",
    async () => {
      const unresolved: string[] = [];
      for (const entry of await deferredPopulation()) {
        for (const option of entry.options) {
          const { field } = resolveBodyField(option);
          if (field.length === 0) unresolved.push(`${commandPath(entry.command)} ${option.flags}`);
        }
      }
      expect(unresolved).toEqual([]);
    },
    TREE_TIMEOUT_MS
  );

  it(
    "leaves no mandatory option behind on those commands in the REAL tree",
    async () => {
      // The real object `index.ts` parses with. A command still holding a
      // mandatory option here is one commander refuses before `--body` is read.
      const deferred = new Set(
        (await deferredPopulation()).map((entry) => commandPath(entry.command))
      );

      const survivors: string[] = [];
      const walk = (command: Command): void => {
        if (deferred.has(commandPath(command))) {
          const mandatory = command.options.filter(
            (option) => option.mandatory && option.long !== "--body" && option.long !== "--data"
          );
          for (const option of mandatory) survivors.push(`${commandPath(command)} ${option.flags}`);
        }
        for (const child of command.commands) walk(child);
      };
      walk(buildRootProgram());

      expect(survivors).toEqual([]);
    },
    TREE_TIMEOUT_MS
  );
});

describe("which body values the flag has a form for", () => {
  it("converts every scalar to the string a flag would have carried", () => {
    expect(scalarAsFlagValue("cred_abc")).toBe("cred_abc");
    expect(scalarAsFlagValue(12345)).toBe("12345");
    expect(scalarAsFlagValue(0)).toBe("0");
    expect(scalarAsFlagValue(true)).toBe("true");
    expect(scalarAsFlagValue(false)).toBe("false");
  });

  it("refuses a composite rather than coercing it", () => {
    // `String(["a","b"])` is "a,b", which LOOKS like the comma-separated form
    // some flags take. Relying on that is how an array reaches an action that
    // will index it as a string.
    expect(scalarAsFlagValue(["a", "b"])).toBeUndefined();
    expect(scalarAsFlagValue({ a: 1 })).toBeUndefined();
    // `null` is not missing — the action reads it from the merged body, where it
    // still means what the operator wrote.
    expect(scalarAsFlagValue(null)).toBeUndefined();
  });
});

interface Harness {
  program: Command;
  seen: () => Record<string, unknown> | undefined;
}

function harness(): Harness {
  let seen: Record<string, unknown> | undefined;
  const program = new Command()
    .name("t")
    .exitOverride()
    .configureOutput({
      writeErr: () => {},
      writeOut: () => {}
    });
  program
    .command("go")
    .requiredOption("--credential-id <id>", "credential id")
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .action((opts: Record<string, unknown>) => {
      seen = opts;
    });
  applyBodySatisfiesRequired(program);
  return { program, seen: () => seen };
}

describe("a scalar in --body reaches the action", () => {
  it("backfills a number as the string the flag would have carried", async () => {
    const h = harness();
    await h.program.parseAsync(["go", "--body", '{"credentialId":12345}'], { from: "user" });
    expect(h.seen()?.credentialId).toBe("12345");
  });

  it("backfills a boolean", async () => {
    const h = harness();
    await h.program.parseAsync(["go", "--body", '{"credentialId":false}'], { from: "user" });
    expect(h.seen()?.credentialId).toBe("false");
  });

  it("still lets an explicit flag win over a scalar body field", async () => {
    const h = harness();
    await h.program.parseAsync(
      ["go", "--credential-id", "flag_wins", "--body", '{"credentialId":12345}'],
      { from: "user" }
    );
    expect(h.seen()?.credentialId).toBe("flag_wins");
  });

  it("leaves a composite unbackfilled, for the action to read from the body", async () => {
    const h = harness();
    await h.program.parseAsync(["go", "--body", '{"credentialId":["a","b"]}'], { from: "user" });
    // Present, so the command runs; not coerced, so nothing indexes an array as
    // a string. The action reads the real value out of the merged body.
    expect(h.seen()).toBeDefined();
    expect(h.seen()?.credentialId).toBeUndefined();
  });
});

/**
 * THE END-TO-END HALF, AGAINST A REAL SERVER.
 *
 * The unit cases above prove the option store. They cannot prove the URL, and
 * the URL is where this defect actually bit — a check on the CLI's own exit code
 * reads GREEN on `POST /credentials/undefined/cards`, because the CLI exits 0 on
 * any 2xx. So one leaf of the REAL root program is driven against a stub server
 * and the path it requests is read off the wire.
 *
 * `access-card create` is chosen because it is the one measured instance and
 * because it is safe to execute: it POSTs to a loopback server this file owns,
 * reads no stdin, opens no browser and installs nothing. That is not true of
 * every leaf — `auth login` blocks on readline and `upgrade` shells out to a
 * global npm install — which is why this is one named command rather than a
 * sweep of the population.
 */
describe("the request that reaches a server carries the id", () => {
  let server: http.Server;
  let port: number;
  const requested: string[] = [];

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      requested.push(req.url ?? "");
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ success: true, data: { id: "card_1" } }));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    port = (server.address() as AddressInfo).port;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  const create = async (data: string): Promise<string> => {
    requested.length = 0;
    const written: string[] = [];
    const log = console.log;
    console.log = (...args: unknown[]) => written.push(args.join(" "));
    try {
      await buildRootProgram().parseAsync(
        [
          "--base-url",
          `http://127.0.0.1:${String(port)}`,
          "--api-key",
          "k",
          "access-card",
          "create",
          "--data",
          data
        ],
        { from: "user" }
      );
    } finally {
      console.log = log;
    }
    return requested.join(" | ");
  };

  it(
    "sends the id from a NUMERIC body field, never the string 'undefined'",
    async () => {
      const url = await create('{"credentialId":12345,"name":"N"}');
      expect(url).toContain("/credentials/12345/cards");
      expect(url).not.toContain("undefined");
    },
    TREE_TIMEOUT_MS
  );

  it(
    "still sends the id from a STRING body field",
    async () => {
      // CONTROL: the case that already worked must keep working, or the fix
      // above traded one path for the other.
      const url = await create('{"credentialId":"cred_abc","name":"N"}');
      expect(url).toContain("/credentials/cred_abc/cards");
      expect(url).not.toContain("undefined");
    },
    TREE_TIMEOUT_MS
  );
});
