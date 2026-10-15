import path from "node:path";

import { failure } from "../../../errors";
import { fetchWithHeaderDeadline } from "./fetch-with-header-deadline";
import { writeBody } from "./write-body";

/** One named file's bytes, by its presigned link, written by base name under `out`. */
export async function pullFile(
  link: { path: string; url: string },
  out: string
): Promise<{ path: string; local: string; bytes: number }> {
  const local = path.join(out, path.basename(link.path));
  const res = await fetchWithHeaderDeadline(link.url, link.path);
  if (!res.ok) {
    throw failure("remote-error", `Download of ${link.path} answered HTTP ${res.status}`);
  }
  const bytes = await writeBody(res.body, local);
  return { path: link.path, local, bytes };
}
