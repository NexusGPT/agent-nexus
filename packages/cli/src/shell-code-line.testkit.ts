/**
 * The per-line lexer behind `shellCode` in `shell-code.testkit.ts`, which says
 * what it blanks and why. It imports only the context types beside it.
 */

import type { PendingHeredoc, ShellContext } from "./shell-code-context.testkit";

/** The word after `<<` or `<<-`: quoted, or bare (`\EOF` is bare and quoted). */
const HEREDOC_WORD = /^[ \t]*(?:'([^']*)'|"([^"]*)"|\\?([A-Za-z_][A-Za-z0-9_]*))/;

/** The script's own context: never popped, so the stack is never empty. */
const TOP: ShellContext = { kind: "code", depth: 0 };

/** A character after which a `#` opens a word, and so a comment. */
const WORD_BREAK = /[\s;&|()<>]/;

type StringContext = Extract<ShellContext, { kind: "single" | "double" | "ansi" }>;
type ArithContext = Extract<ShellContext, { kind: "arith" }>;

/** One line being read: the position, and the code kept so far. */
interface Cursor {
  readonly line: string;
  readonly lineNo: number;
  readonly stack: ShellContext[];
  readonly heredocs: PendingHeredoc[];
  at: number;
  kept: string;
  /** A comment started, so the rest of the line is not code. */
  cut: boolean;
}

/** Keep the next `count` characters, or blank them to spaces. */
function emit(cur: Cursor, count: number, blank = false): void {
  const chunk = cur.line.slice(cur.at, cur.at + count);
  cur.kept += blank ? " ".repeat(chunk.length) : chunk;
  cur.at += count;
}

const opens = (cur: Cursor, token: string): boolean => cur.line.startsWith(token, cur.at);

/** One line of `shellCode`, carrying the open contexts across lines. */
export function shellCodeLine(
  line: string,
  lineNo: number,
  stack: ShellContext[],
  heredocs: PendingHeredoc[]
): string {
  const cur: Cursor = { line, lineNo, stack, heredocs, at: 0, kept: "", cut: false };
  while (cur.at < line.length && !cur.cut) {
    const ctx = stack[stack.length - 1] ?? TOP;
    const c = line[cur.at] ?? "";
    if (ctx.kind === "code") codeStep(cur, ctx, c);
    else if (ctx.kind === "arith") arithStep(cur, ctx, c);
    else if (ctx.kind === "param") paramStep(cur, c);
    else stringStep(cur, ctx, c);
  }
  const code = cur.cut ? cur.kept.trimEnd() : cur.kept;
  return code.trim() === "" ? "" : code;
}

/** Inside a quoted string: blanked when the string opened on an earlier line. */
function stringStep(cur: Cursor, ctx: StringContext, c: string): void {
  const blank = ctx.line < cur.lineNo;
  if (c === "\\" && ctx.kind !== "single") emit(cur, 2, blank);
  else if (c === (ctx.kind === "double" ? '"' : "'")) {
    cur.stack.pop();
    emit(cur, 1, blank);
  } else if (ctx.kind !== "double" || !openNested(cur)) emit(cur, 1, blank);
}

/** Inside `${…}`: quotes and `#` are operators here. */
function paramStep(cur: Cursor, c: string): void {
  if (c === "\\") emit(cur, 2);
  else if (c === "}") {
    cur.stack.pop();
    emit(cur, 1);
  } else if (!openNested(cur)) emit(cur, 1);
}

/** Inside `$((…))` or `((…))`, which ends at the `)` that balances it. */
function arithStep(cur: Cursor, ctx: ArithContext, c: string): void {
  if (c === ")" && ctx.depth === 0) {
    cur.stack.pop();
    emit(cur, cur.line[cur.at + 1] === ")" ? 2 : 1);
    return;
  }
  if (c === "(") ctx.depth += 1;
  else if (c === ")") ctx.depth -= 1;
  emit(cur, 1);
}

function codeStep(cur: Cursor, ctx: Extract<ShellContext, { kind: "code" }>, c: string): void {
  const closes =
    ctx.closer === "`" ? c === "`" : ctx.closer === ")" && c === ")" && ctx.depth === 0;
  if (c === "\\") emit(cur, 2);
  else if (closes) {
    cur.stack.pop();
    emit(cur, 1);
  } else if (opens(cur, "$'")) {
    cur.stack.push({ kind: "ansi", line: cur.lineNo });
    emit(cur, 2);
  } else if (c === "'" || c === '"') {
    cur.stack.push({ kind: c === "'" ? "single" : "double", line: cur.lineNo });
    emit(cur, 1);
  } else if (openNested(cur)) return;
  else if (opens(cur, "((")) {
    cur.stack.push({ kind: "arith", depth: 0 });
    emit(cur, 2);
  } else if (c === "#" && (cur.at === 0 || WORD_BREAK.test(cur.line[cur.at - 1] ?? ""))) {
    cur.cut = true;
  } else if (opens(cur, "<<<")) emit(cur, 3);
  else if (opens(cur, "<<")) heredocOperator(cur);
  else {
    if (ctx.closer === ")" && c === "(") ctx.depth += 1;
    else if (ctx.closer === ")" && c === ")") ctx.depth -= 1;
    emit(cur, 1);
  }
}

/** `<<WORD`, `<<'WORD'`, `<<"WORD"` or `<<-WORD`: its body starts on the next line. */
function heredocOperator(cur: Cursor): void {
  const stripTabs = cur.line[cur.at + 2] === "-";
  const after = cur.at + (stripTabs ? 3 : 2);
  const word = HEREDOC_WORD.exec(cur.line.slice(after));
  if (word === null) return emit(cur, 2);
  cur.heredocs.push({ word: word[1] ?? word[2] ?? word[3] ?? "", stripTabs });
  emit(cur, after - cur.at + word[0].length);
}

/** The tokens that open a nested context, longest first, and the context each opens. */
const NESTED: readonly (readonly [string, () => ShellContext])[] = [
  ["$((", () => ({ kind: "arith", depth: 0 })],
  ["$(", () => ({ kind: "code", closer: ")", depth: 0 })],
  ["${", () => ({ kind: "param" })],
  ["`", () => ({ kind: "code", closer: "`", depth: 0 })]
];

/** Open the context a `$((`, `$(`, `${` or backquote starts here, if one does. */
function openNested(cur: Cursor): boolean {
  const hit = NESTED.find(([token]) => opens(cur, token));
  if (hit === undefined) return false;
  cur.stack.push(hit[1]());
  emit(cur, hit[0].length);
  return true;
}
