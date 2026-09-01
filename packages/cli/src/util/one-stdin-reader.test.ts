import { Command, CommanderError } from "commander";
import { describe, expect, it } from "vitest";

import { buildRootProgram } from "../index";
import { refuseMultipleStdinReaders, tooManyStdinReadersMessage } from "./one-stdin-reader";

interface Harness {
  program: Command;
  ran: () => boolean;
  errors: () => string;
}

function harness(declare: (c: Command) => Command): Harness {
  let ran = false;
  const errors: string[] = [];
  const program = new Command()
    .name("t")
    .exitOverride()
    .configureOutput({ writeErr: (s) => errors.push(s), writeOut: () => {} });
  declare(program.command("go")).action(() => {
    ran = true;
  });
  refuseMultipleStdinReaders(program);
  return { program, ran: () => ran, errors: () => errors.join("") };
}

const twoReaders = (c: Command): Command =>
  c
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .option("--prompt <file-or-->", "System prompt (file path, or '-' for stdin)");

describe("one stdin, one claimant", () => {
  it("refuses two flags both set to -, naming both", async () => {
    const h = harness(twoReaders);
    await expect(
      h.program.parseAsync(["go", "--body", "-", "--prompt", "-"], { from: "user" })
    ).rejects.toThrow(CommanderError);

    expect(h.errors()).toContain("--body and --prompt both read standard input");
    // The refusal must land BEFORE anything consumes the stream.
    expect(h.ran()).toBe(false);
  });

  it("allows either one alone", async () => {
    for (const argv of [
      ["go", "--body", "-"],
      ["go", "--prompt", "-"]
    ]) {
      const h = harness(twoReaders);
      await h.program.parseAsync(argv, { from: "user" });
      expect(h.ran()).toBe(true);
      expect(h.errors()).toBe("");
    }
  });

  it("allows both when only one asks for stdin", async () => {
    const h = harness(twoReaders);
    await h.program.parseAsync(["go", "--body", "-", "--prompt", "./p.md"], { from: "user" });
    expect(h.ran()).toBe(true);
    expect(h.errors()).toBe("");
  });

  it("ignores a NON-stdin flag that happens to hold a dash", async () => {
    // `-` is a legal value for an ordinary option. Only flags that DECLARE
    // stdin capability count as claimants, or this would refuse working
    // commands — which is how a guard gets switched off.
    const h = harness((c) =>
      c
        .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
        .option("--name <n>", "a name")
    );
    await h.program.parseAsync(["go", "--body", "-", "--name", "-"], { from: "user" });
    expect(h.ran()).toBe(true);
    expect(h.errors()).toBe("");
  });

  it("recognises every stdin placeholder spelling the package uses", async () => {
    // <text-or->, <text-or-->, <json-or-file-or--> are all live in src/commands.
    for (const flags of [
      "--message <text-or->",
      "--content <text-or-->",
      "--x <json-or-file-or-->"
    ]) {
      const h = harness((c) =>
        c
          .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
          .option(flags, "d")
      );
      const long = flags.split(" ")[0] as string;
      await expect(
        h.program.parseAsync(["go", "--body", "-", long, "-"], { from: "user" })
      ).rejects.toThrow(CommanderError);
      expect(h.errors()).toContain(long);
    }
  });
});

describe("the real CLI carries the refusal", () => {
  it("has more than one stdin-capable flag on a real command, so the guard has a population", () => {
    // Control: a guard installed over an empty population is indistinguishable
    // from a guard that works.
    const program = buildRootProgram();
    const agent = program.commands.find((c) => c.name() === "agent");
    const create = agent?.commands.find((c) => c.name() === "create");
    const stdinCapable = (create?.options ?? []).filter(
      (o) => /-or-{1,2}>/.test(o.flags) || /'-' for stdin/.test(o.description)
    );
    expect(stdinCapable.map((o) => o.long)).toEqual(expect.arrayContaining(["--prompt", "--body"]));
  });
});

describe("the message", () => {
  it("names every claimant and says what to do", () => {
    const m = tooManyStdinReadersMessage(["--body", "--prompt"]);
    expect(m).toContain("--body and --prompt");
    expect(m).toContain("only one");
    expect(m).toContain("at most one");
  });
});
