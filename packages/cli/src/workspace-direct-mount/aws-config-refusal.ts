/**
 * Why a path cannot be written into the credential_process value.
 *
 * The AWS SDK's ini reader tokenises the value before the shell sees it: a
 * double quote ends a quoted token, a newline ends the line, and a space or tab
 * followed by `#` or `;` starts a comment that swallows the rest. The SDK then
 * hands the value to `sh -c`, where `$`, a backtick and a backslash are still
 * interpreted inside the double quotes the paths are written in. A path
 * carrying any of these would produce a line that parses to a different
 * command than the one written, so the writer refuses instead.
 */
export type AwsConfigRefusal = {
  readonly field: "execPath" | "entry";
  readonly because: "double-quote" | "newline" | "comment-start" | "shell-special";
};

export function awsConfigRefusalFor(value: string): AwsConfigRefusal["because"] | null {
  if (value.includes('"')) return "double-quote";
  if (/[\r\n]/.test(value)) return "newline";
  if (/[ \t][#;]/.test(value)) return "comment-start";
  if (/[$`\\]/.test(value)) return "shell-special";
  return null;
}

/** What a refusal to write the line says about the character it found. */
export const AWS_CONFIG_REFUSAL_TEXT = {
  "double-quote": 'a double quote (") — the ini reader would end the quoted path there',
  newline: "a line break — the ini reader would end the line there",
  "comment-start":
    "a space or tab followed by # or ; — the ini reader would read a comment from there",
  "shell-special": "a $, a backtick or a backslash — the shell would expand it inside the quotes"
} as const satisfies Record<AwsConfigRefusal["because"], string>;
