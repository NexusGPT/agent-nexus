import { Command } from "commander";
import { describe, expect, it } from "vitest";

import { applyBodySatisfiesRequired } from "./body-satisfies-required";
import {
  buildCommandTree,
  collectShadowedOptions,
  globalOptionFlags,
  SHADOWED_OPTION_EXCEPTIONS,
  undeclaredShadowedOptions
} from "./global-option-shadowing";

describe("global option shadowing", () => {
  // CONTROLS. Everything below is an absence claim over a derived population, so
  // the derivation must first be shown to produce something. A tree that
  // registered nothing, or an option list that came back empty, would make this
  // gate pass by having nothing to check.
  it("derives the globals from the real program, including the ones .option() never declares", () => {
    const globals = globalOptionFlags(buildCommandTree());

    expect(globals).toEqual(
      expect.arrayContaining(["--json", "--api-key", "--base-url", "--timeout"])
    );
    // `--version` comes from `.version()`. It is in `program.options` and it was
    // invisible to the source scan this replaced — the reason that scan is gone.
    expect(globals).toContain("--version");
    expect(globals.length).toBeGreaterThanOrEqual(9);
  });

  it("derives a tree with the namespaces and subcommands the binary has", () => {
    const program = buildCommandTree();
    expect(program.commands.length).toBeGreaterThan(20);
    const custom = program.commands.find((c) => c.name() === "custom-model");
    expect(custom?.commands.map((c) => c.name())).toEqual(
      expect.arrayContaining(["create", "update"])
    );
  });

  it("finds a shadow when one exists", () => {
    // The detector, proven against a tree that HAS one. Without this the two
    // assertions below are satisfied by a walker that never descends.
    const root = new Command().name("nexus").option("--base-url <url>", "global");
    root.command("thing").command("do").option("--base-url <url>", "local");

    expect(collectShadowedOptions(root, globalOptionFlags(root))).toEqual([
      { commandPath: "thing do", flag: "--base-url" }
    ]);
  });

  it("every shadowed option is declared with a reason", () => {
    const program = buildCommandTree();
    const undeclared = undeclaredShadowedOptions(
      collectShadowedOptions(program, globalOptionFlags(program))
    );

    expect(
      undeclared.map((s) => `${s.commandPath} ${s.flag}`),
      "A subcommand option sharing a long name with a global NEVER receives a value: " +
        "the root parses its options across the whole of argv. A required one is refused " +
        "outright; an optional one is silently dropped from the body and applied to the " +
        "CLI's own transport instead — which is how a provider key reached a third-party " +
        "host. Rename the flag when it means something different from the global (see " +
        "custom-model's --endpoint-url / --endpoint-key), or, when it means the SAME thing, " +
        "merge optsWithGlobals() in the action and declare it in SHADOWED_OPTION_EXCEPTIONS."
    ).toEqual([]);
  });

  it("declares no exception for a shadow that no longer exists", () => {
    // A stale exception is the other direction of rot: it reads as "handled"
    // while the code it describes has been renamed away.
    const program = buildCommandTree();
    const live = new Set(
      collectShadowedOptions(program, globalOptionFlags(program)).map(
        (s) => `${s.commandPath} ${s.flag}`
      )
    );
    expect(Object.keys(SHADOWED_OPTION_EXCEPTIONS).filter((k) => !live.has(k))).toEqual([]);
  });

  it("counts the same options after the body-satisfies-required pass as before it", () => {
    // That pass runs INSIDE buildRootProgram, so the tree this gate walks has
    // always been through it. It calls `makeOptionMandatory(false)` and adds a
    // `preAction` hook — neither adds, removes nor renames an option. Asserted,
    // because a seam that rebuilt or re-registered options would make this walk
    // silently undercount and the gate would go green by seeing less.
    const before = new Command().name("nexus").option("--base-url <url>", "global");
    const leaf = before.command("thing").command("do");
    leaf.requiredOption("--base-url <url>", "local").option("--body <json>", "body");

    const shadowsBefore = collectShadowedOptions(before, globalOptionFlags(before));
    applyBodySatisfiesRequired(before);
    const shadowsAfter = collectShadowedOptions(before, globalOptionFlags(before));

    expect(shadowsBefore).toEqual([{ commandPath: "thing do", flag: "--base-url" }]);
    expect(shadowsAfter).toEqual(shadowsBefore);
    // And the pass really did fire, so the equality above is not vacuous.
    expect(leaf.options.find((o) => o.long === "--base-url")?.mandatory).toBe(false);
  });
});
