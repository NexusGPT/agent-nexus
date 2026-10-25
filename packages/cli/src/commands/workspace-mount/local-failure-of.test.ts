import { describe, expect, it } from "vitest";

import { failure } from "../../errors";
import { Interrupted, localFailureOf } from "./local-failure-of";

describe("localFailureOf — every failure of the install exits local-failed; Ctrl-C at the question exits interrupted", () => {
  it("the CLI's own refusal passes through untouched: same object, same message, same hint", async () => {
    const held = failure("local-failed", "Another nexus mount is installing.", "remove the lock");
    const thrown = await localFailureOf("The install", "the install hint", async () => {
      throw held;
    }).catch((error: unknown) => error);
    expect(thrown).toBe(held);
  });

  it("a raw error becomes local-failed with the step named and the install hint", async () => {
    await expect(
      localFailureOf("The install", "the install hint", async () => {
        throw new Error("ENOSPC: no space left on device");
      })
    ).rejects.toMatchObject({
      code: "CLI_LOCAL_FAILED",
      message: "The install failed: ENOSPC: no space left on device. Nothing was mounted.",
      hint: "the install hint"
    });
  });

  it("Ctrl-C at a question (an AbortError) is Interrupted — its own class, exit 130, not a failure — so a fallback can let it through", async () => {
    const thrown = await localFailureOf("The question", "the install hint", async () => {
      throw Object.assign(new Error("Aborted with Ctrl+C"), { name: "AbortError" });
    }).catch((error: unknown) => error);
    expect(thrown).toBeInstanceOf(Interrupted);
    expect(thrown).toMatchObject({
      category: "interrupted",
      exitCode: 130,
      code: "CLI_INTERRUPTED",
      message: "The question was interrupted. Nothing was mounted.",
      hint: "the install hint"
    });
  });

  it("no failure: the work's value comes back", async () => {
    await expect(localFailureOf("The question", "hint", async () => true)).resolves.toBe(true);
  });
});
