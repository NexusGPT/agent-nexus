import ts from "typescript";

import { resolveCommandPath } from "./json-shape.command-path";

/**
 * THE PATH ABOVE A NESTED REGISTRAR'S PARAMETER, READ OFF ITS CALL SITE.
 *
 * A registration resolves to a path RELATIVE to its registrar's `Command`
 * parameter. For a registrar handed a namespace — `registerRoleListCommand(role,
 * program)` with `role = program.command("role")` — that path is the bare leaf
 * name, `list`, and a bare name suffix-matches every `… list` leaf in the tree.
 * A leaf with no registration of its own then adopts a stranger's shape: that
 * is how moving `role list` into its own file handed `mcp tools list` a `--json`
 * line nobody measured.
 *
 * So the parameter is resolved through the registrar's CALL SITE, and the path
 * found there is prepended — recursively, since the caller may be nested too.
 * Prepending only ever adds TRUE segments, so it narrows a suffix match and can
 * never widen one.
 *
 * 🚨 EVERY UNCERTAINTY ANSWERS `[]`, WHICH IS THE OLD BEHAVIOUR, NEVER A GUESS:
 * a name declared twice, a registrar never called directly, a call site whose
 * argument does not resolve, or two call sites that disagree.
 */

interface Site {
  readonly call: ts.CallExpression;
  readonly source: ts.SourceFile;
}

/** The nearest named function declaration enclosing a node, or null. */
function enclosingFunction(node: ts.Node): ts.FunctionDeclaration | null {
  for (let cursor = node.parent; cursor !== undefined; cursor = cursor.parent) {
    if (ts.isFunctionDeclaration(cursor)) return cursor.name === undefined ? null : cursor;
  }
  return null;
}

/** Which parameter of `fn` is named `name`, or -1. */
function parameterIndex(fn: ts.FunctionDeclaration, name: string): number {
  return fn.parameters.findIndex((p) => ts.isIdentifier(p.name) && p.name.text === name);
}

/** Resolves the prefix of every registrar parameter in one parsed source tree. */
export class RegistrarPrefixes {
  private readonly declarations = new Map<string, number>();
  private readonly sites = new Map<string, Site[]>();
  private readonly memo = new Map<string, readonly string[]>();

  constructor(parsed: readonly { source: ts.SourceFile }[]) {
    for (const { source } of parsed) {
      const visit = (node: ts.Node): void => {
        if (ts.isFunctionDeclaration(node) && node.name !== undefined) {
          const name = node.name.text;
          this.declarations.set(name, (this.declarations.get(name) ?? 0) + 1);
        }
        if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
          const list = this.sites.get(node.expression.text) ?? [];
          list.push({ call: node, source });
          this.sites.set(node.expression.text, list);
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
    }
  }

  /** The segments above `base`, where `base` is what a registration at `node` bottomed out at. */
  above(node: ts.Node, base: string): readonly string[] {
    const fn = enclosingFunction(node);
    if (fn?.name === undefined) return [];
    const index = parameterIndex(fn, base);
    return index < 0 ? [] : this.ofParameter(fn.name.text, index, new Set());
  }

  private ofParameter(fn: string, index: number, visiting: Set<string>): readonly string[] {
    const key = `${fn}#${String(index)}`;
    const known = this.memo.get(key);
    if (known !== undefined) return known;
    if (visiting.has(key) || this.declarations.get(fn) !== 1) return [];
    visiting.add(key);

    const answers = (this.sites.get(fn) ?? []).map((site) => this.atSite(site, index, visiting));
    const first = answers[0] ?? [];
    const agreed = answers.every((a) => a.join(" ") === first.join(" ")) ? first : [];

    this.memo.set(key, agreed);
    return agreed;
  }

  private atSite(site: Site, index: number, visiting: Set<string>): readonly string[] {
    const arg = site.call.arguments[index];
    if (arg === undefined) return [];
    const resolved = resolveCommandPath(arg, site.source);
    if (resolved === null) return [];

    const caller = enclosingFunction(site.call);
    const outer = caller?.name === undefined ? -1 : parameterIndex(caller, resolved.base);
    const prefix =
      caller?.name === undefined || outer < 0
        ? []
        : this.ofParameter(caller.name.text, outer, visiting);
    return [...prefix, ...resolved.segments];
  }
}
