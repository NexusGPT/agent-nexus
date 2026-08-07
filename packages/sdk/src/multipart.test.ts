import { describe, expect, it } from "vitest";

import { appendFilePart } from "./multipart";

/**
 * 🔴 These tests assert the ARITY of the `FormData.append` call, not the
 * resulting filename — and that choice is the whole reason they are worth
 * having.
 *
 * The defect is that `append(field, file, undefined)` sent the literal name
 * `"undefined"`, because undici resolved the optional argument by
 * `arguments.length === 3` and then ran `String(undefined)` on it. That is
 * FIXED in the undici bundled with Node 24, which is what this suite runs on:
 * measured here, `append(f, file)` and `append(f, file, undefined)` both return
 * the `File`'s own name.
 *
 * So a test that asserted "the name survives" would pass against the BROKEN
 * two-argument-vs-three-argument code on this machine, and would only ever have
 * failed on the Node 18 and 20 that `engines: >=18` also promises. It would have
 * been a green test protecting nothing, on the only platform CI runs.
 *
 * Arity is the property that is actually under our control and is the same on
 * every runtime: pass three arguments only when there is a third thing to say.
 * `recordAppendArity` below fails the moment the helper goes back to forwarding
 * `undefined` positionally, on any Node.
 */

interface AppendCall {
  argc: number;
  field: string;
  fileName: string | undefined;
}

/**
 * A real `FormData` with `append` wrapped so the call's ARGUMENT COUNT is
 * observable. A plain object stand-in would not do: the helper is typed against
 * `FormData`, and the whole point is what reaches the genuine method.
 */
function recordAppendArity(): { formData: FormData; calls: AppendCall[] } {
  const formData = new FormData();
  const calls: AppendCall[] = [];
  const original = formData.append.bind(formData);

  formData.append = function (...args: unknown[]): void {
    calls.push({
      argc: args.length,
      field: args[0] as string,
      fileName: args[2] as string | undefined
    });
    (original as (...a: unknown[]) => void)(...args);
  } as FormData["append"];

  return { formData, calls };
}

const file = (name: string) => new File([new Uint8Array([1, 2, 3])], name, { type: "text/csv" });

describe("appendFilePart", () => {
  it("passes TWO arguments when there is no filename — never `undefined` as a third", () => {
    // THE REGRESSION. Forwarding `undefined` positionally is what made undici
    // stringify it to "undefined" and overwrite the File's real name.
    const { formData, calls } = recordAppendArity();

    appendFilePart(formData, "file", file("dataset.json"));

    expect(calls).toHaveLength(1);
    expect(calls[0].argc).toBe(2);
  });

  it("passes THREE arguments when a filename is given", () => {
    // The control. Without it, `append(field, file)` unconditionally would also
    // pass the test above while silently dropping every caller-supplied name.
    const { formData, calls } = recordAppendArity();

    appendFilePart(formData, "file", file("blob"), "report.csv");

    expect(calls).toHaveLength(1);
    expect(calls[0].argc).toBe(3);
    expect(calls[0].fileName).toBe("report.csv");
  });

  it("treats an explicitly-passed `undefined` exactly like an omitted argument", () => {
    // How every affected resource method calls it: `fileName?: string` forwarded
    // straight through, arriving as an explicit `undefined`.
    const { formData, calls } = recordAppendArity();
    const fileName: string | undefined = undefined;

    appendFilePart(formData, "file", file("icon.png"), fileName);

    expect(calls[0].argc).toBe(2);
  });

  it("passes an empty-string filename through rather than discarding it", () => {
    // `""` is a value, not an absence. Guarding on falsiness instead of on
    // `undefined` would silently swallow it and re-enter the arity bug.
    const { formData, calls } = recordAppendArity();

    appendFilePart(formData, "file", file("thing.bin"), "");

    expect(calls[0].argc).toBe(3);
    expect(calls[0].fileName).toBe("");
  });

  it("honours the field name it is given", () => {
    const { formData, calls } = recordAppendArity();

    appendFilePart(formData, "attachment", file("a.txt"));

    expect(calls[0].field).toBe("attachment");
  });

  it("leaves a File's own name intact when no filename is supplied", () => {
    // The user-visible consequence, asserted on the real FormData. It passes on
    // Node 24 either way — that is precisely why the arity cases above exist —
    // but it pins the behaviour callers actually depend on.
    const { formData } = recordAppendArity();

    appendFilePart(formData, "file", file("original-name.json"));

    expect((formData.get("file") as File).name).toBe("original-name.json");
  });

  it("lets a supplied filename win over the File's own", () => {
    const { formData } = recordAppendArity();

    appendFilePart(formData, "file", file("original-name.json"), "renamed.csv");

    expect((formData.get("file") as File).name).toBe("renamed.csv");
  });
});
