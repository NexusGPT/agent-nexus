import type { MountPlatform } from "./mount-platform";

/**
 * Why a path cannot be written into the credential_process value, or into the
 * `renew.cmd` wrapper the value names on Windows.
 *
 * The AWS SDK's ini reader tokenises the value before any shell sees it: a
 * double quote ends a quoted token, a newline ends the line, and a space or tab
 * followed by `#` or `;` starts a comment that swallows the rest. A path
 * carrying any of these would produce a line that parses to a different
 * command than the one written, so the writer refuses instead.
 *
 * macOS and Linux: the SDK hands the value to `sh -c`, where `$`, a backtick
 * and a backslash are still interpreted inside the double quotes the paths are
 * written in.
 *
 * Windows: the SDK hands the value to `cmd.exe /C`. cmd.exe expands `%VAR%` on
 * the command line and inside a batch file, quoted or not, so a `%` is refused
 * in every path. The wrapper path is the whole value, the only path the ini
 * reader sees, and cmd.exe keeps Go's quotes around it only while no
 * `& | < > ( ) @ ^` sits between them; a `!` there meets delayed expansion when
 * the registry turns it on, before `renew.cmd` can turn it off; and Go quotes
 * the path only when it holds a space, so in a space-free one a `,` `;` or `=`
 * is a separator that cuts the command name. So the ini tests and those
 * characters apply to that path alone; inside `renew.cmd` the
 * node and entry paths sit in quotes that keep them literal. A backslash, `$`
 * and a backtick are ordinary path characters there.
 */
export type AwsConfigRefusal = {
  readonly field: "execPath" | "entry" | "renewCmd";
  readonly because:
    | "double-quote"
    | "newline"
    | "comment-start"
    | "shell-special"
    | "percent"
    | "cmd-special";
};

type Because = AwsConfigRefusal["because"];

function shRefusalFor(value: string): Because | null {
  if (value.includes('"')) return "double-quote";
  if (/[\r\n]/.test(value)) return "newline";
  if (/[ \t][#;]/.test(value)) return "comment-start";
  if (/[$`\\]/.test(value)) return "shell-special";
  return null;
}

function cmdRefusalFor(value: string, field: AwsConfigRefusal["field"]): Because | null {
  if (value.includes('"')) return "double-quote";
  if (/[\r\n]/.test(value)) return "newline";
  if (value.includes("%")) return "percent";
  if (field !== "renewCmd") return null;
  if (/[ \t][#;]/.test(value)) return "comment-start";
  if (/[&|<>()@^!,;=]/.test(value)) return "cmd-special";
  return null;
}

const REFUSAL_FOR = {
  darwin: shRefusalFor,
  linux: shRefusalFor,
  win32: cmdRefusalFor
} as const satisfies Record<
  MountPlatform,
  (value: string, field: AwsConfigRefusal["field"]) => Because | null
>;

export function awsConfigRefusalFor(
  value: string,
  field: AwsConfigRefusal["field"],
  platform: MountPlatform
): Because | null {
  return REFUSAL_FOR[platform](value, field);
}

/** What a refusal to write the line says about the character it found. */
export const AWS_CONFIG_REFUSAL_TEXT = {
  "double-quote": 'a double quote (") — the ini reader would end the quoted path there',
  newline: "a line break — the ini reader would end the line there",
  "comment-start":
    "a space or tab followed by # or ; — the ini reader would read a comment from there",
  "shell-special": "a $, a backtick or a backslash — the shell would expand it inside the quotes",
  percent: "a % — cmd.exe would expand it as a variable",
  "cmd-special":
    "one of & | < > ( ) @ ^ ! , ; = — cmd.exe would read it as an operator or a separator"
} as const satisfies Record<AwsConfigRefusal["because"], string>;
