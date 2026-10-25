/** The one notification a recovery sends. */
export const RESTORED_NOTIFICATION = {
  title: "Access restored",
  body: "Access restored. Saved changes are uploading."
} as const;

export function notificationTitle(volumeName: string): string {
  return `Nexus drive "${volumeName}"`;
}

/** AppleScript string literal: backslash and double quote are the only escapes. */
function appleScriptString(text: string): string {
  return `"${text.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/** The `osascript` argv for one desktop notification. Pure, so a test can read it. */
export function notificationArgv(title: string, subtitle: string, body: string): string[] {
  return [
    "-e",
    `display notification ${appleScriptString(body)} with title ${appleScriptString(title)} ` +
      `subtitle ${appleScriptString(subtitle)}`
  ];
}
