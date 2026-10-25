import { describe, expect, it, vi } from "vitest";

import { askLine } from "./ask";

/** An interface whose question never settles on its own, as Node 18's does on Ctrl-C and Ctrl-D. */
type FakeInterface = { emit(event: string): boolean; close: () => void };
const rl = vi.hoisted(() => ({ current: null as FakeInterface | null }));
vi.mock("node:readline/promises", async () => {
  const { EventEmitter: Emitter } = await import("node:events");
  return {
    createInterface: () => {
      const fake = Object.assign(new Emitter(), {
        question: () => new Promise<string>(() => undefined),
        close: vi.fn()
      });
      rl.current = fake;
      return fake;
    }
  };
});

describe("askLine — a question Ctrl-C or Ctrl-D ends is never left pending", () => {
  it.each(["SIGINT", "close"])(
    "rejects with an AbortError when the interface emits %s",
    async (event) => {
      const asked = askLine("q? ", process.stderr);
      await vi.waitFor(() => expect(rl.current).not.toBeNull());
      rl.current?.emit(event);
      await expect(asked).rejects.toMatchObject({ name: "AbortError" });
      expect(rl.current?.close).toHaveBeenCalled();
      rl.current = null;
    }
  );
});
