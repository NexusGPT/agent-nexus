/**
 * Run `work`; if Ctrl-C or SIGTERM arrives meanwhile, run `release`, then
 * raise the signal again so the process ends exactly as it would have.
 *
 * The installers run their children with `execFileSync`, so a signal that
 * lands during one waits in the event loop until the child returns. One turn
 * of the loop is let through BEFORE the listener comes off, so that pending
 * signal still reaches it — otherwise it is dropped, and a mount the person
 * cancelled carries on.
 */
export async function releasingOnSignal<T>(
  release: () => void,
  work: () => Promise<T>
): Promise<T> {
  const onSignal = (signal: NodeJS.Signals): void => {
    stop();
    release();
    process.kill(process.pid, signal);
  };
  function stop(): void {
    process.off("SIGINT", onSignal);
    process.off("SIGTERM", onSignal);
  }
  process.once("SIGINT", onSignal);
  process.once("SIGTERM", onSignal);
  try {
    return await work();
  } finally {
    await new Promise<void>((resolve) => setImmediate(resolve));
    stop();
  }
}
