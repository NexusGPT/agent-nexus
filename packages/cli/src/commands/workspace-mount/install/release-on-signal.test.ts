import { afterEach, describe, expect, it, vi } from "vitest";

import { releasingOnSignal } from "./release-on-signal";

/** Our listener, the last one added, delivered only while it is still listening — like a real signal. */
function deliverLater(signal: NodeJS.Signals): void {
  const listening = process.listeners(signal);
  const ours = listening[listening.length - 1];
  setImmediate(() => {
    if (ours !== undefined && process.listeners(signal).includes(ours)) ours(signal);
  });
}

describe("releasingOnSignal — a cancelled install releases, then ends as before", () => {
  afterEach(() => vi.restoreAllMocks());

  it("a signal that lands while the work finishes synchronously (an execFileSync child) still releases and re-raises", async () => {
    const kill = vi.spyOn(process, "kill").mockImplementation(() => true);
    const release = vi.fn();
    const before = process.listeners("SIGINT").length;
    await releasingOnSignal(release, async () => {
      // The child returned; the signal is still queued in the event loop.
      deliverLater("SIGINT");
      return "done";
    });
    expect(release).toHaveBeenCalledTimes(1);
    expect(kill).toHaveBeenCalledWith(process.pid, "SIGINT");
    expect(process.listeners("SIGINT").length).toBe(before);
  });

  it("no signal: the work's value comes back, nothing is released or raised, no listener is left", async () => {
    const kill = vi.spyOn(process, "kill").mockImplementation(() => true);
    const release = vi.fn();
    const before = process.listeners("SIGTERM").length;
    await expect(releasingOnSignal(release, async () => "value")).resolves.toBe("value");
    expect(release).not.toHaveBeenCalled();
    expect(kill).not.toHaveBeenCalled();
    expect(process.listeners("SIGTERM").length).toBe(before);
  });
});
