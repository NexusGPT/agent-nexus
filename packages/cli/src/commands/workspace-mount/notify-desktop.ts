import { spawn } from "node:child_process";

import {
  notificationArgv,
  notificationTitle,
  RESTORED_NOTIFICATION
} from "../../workspace-direct-mount/notification-argv";
import {
  REFRESH_FAILURE_TABLE,
  type RefreshContext
} from "../../workspace-direct-mount/refresh-failure-table";
import type { RefreshRecord } from "../../workspace-direct-mount/refresh-record";

/**
 * Announce one refresh transition on the desktop, and never fail because of it.
 *
 * The caller has already DECIDED this should be announced — `shouldNotify` owns
 * the transition-and-debounce rule, and it reads the session. This takes only
 * what the message is built from, so it needs no session of its own.
 *
 * macOS only: `osascript` is the notifier, and there is no equivalent the CLI
 * can assume elsewhere. Both halves of a failed spawn are swallowed on purpose —
 * the asynchronous `error` event because an unhandled one tears the helper down
 * after it has already printed its document, and the synchronous throw because
 * there is nowhere to report it that the AWS SDK is not reading as the
 * credential document.
 */
export function notifyDesktop(
  volumeName: string,
  record: RefreshRecord,
  ctx: RefreshContext
): void {
  if (process.platform !== "darwin") return;
  const text =
    record.outcome === "ok"
      ? RESTORED_NOTIFICATION
      : {
          title: REFRESH_FAILURE_TABLE[record.reason].title,
          body: REFRESH_FAILURE_TABLE[record.reason].body(ctx)
        };
  try {
    const child = spawn(
      "osascript",
      notificationArgv(notificationTitle(volumeName), text.title, text.body),
      { detached: true, stdio: "ignore" }
    );
    child.on("error", () => undefined);
    child.unref();
  } catch {
    /* a mocked or refused spawn — nothing to report, and nowhere to report it */
  }
}
