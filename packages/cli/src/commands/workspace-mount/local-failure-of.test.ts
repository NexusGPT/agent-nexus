import { describe, expect, it } from "vitest";

import { failure } from "../../errors";
import { localFailureOf } from "./local-failure-of";

describe("localFailureOf — every failure of the install exits local-failed", () => {
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

  it("no failure: the work's value comes back", async () => {
    await expect(localFailureOf("The question", "hint", async () => true)).resolves.toBe(true);
  });
});
