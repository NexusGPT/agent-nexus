import fs from "node:fs";
import path from "node:path";

import type { CorpusSourceKind } from "../skills-corpus/resolve";

/**
 * WHAT THIS CLI WROTE, SO IT CAN TELL ITS OWN FILE FROM THE USER'S.
 *
 * ── The defect ───────────────────────────────────────────────────────────────
 *
 * `skills update` / `claude-code install` refreshed skills, hooks and agents
 * "in place": any on-disk file whose bytes differed from the bundle was
 * overwritten, with no prompt, no `--force`, and no way back. The only signal
 * was a counter — "Installed 41 skills (612 files)" — which is identical whether
 * those files were stale copies of our own output or hand-edited guardrails the
 * operator wrote. `.claude/hooks/**` is executable Python that can DENY the
 * user's tool calls; `.claude/agents/**` is their subagent definitions. Editing
 * those is the normal reason to have them.
 *
 * ── Why a checksum ledger, and not the alternatives ──────────────────────────
 *
 * The question is "did the USER change this", and the only honest way to answer
 * it is to know what WE last wrote. Three candidates:
 *
 *   - **mtime** — can produce a false "unmodified", which is the one error that
 *     destroys work. `cp -p`, `git checkout`, `rsync --times`, a restore from a
 *     backup and an unpacked archive all reinstate an old mtime over new bytes.
 *   - **compare against the bundle** — this is what the code did. It cannot
 *     distinguish "the user edited it" from "the bundle moved on", because both
 *     are simply "differs".
 *   - **a checksum of what we wrote** — a hash mismatch means the bytes changed
 *     after our write, whatever touched them. No false "unmodified" exists: the
 *     only way to hash equal is to hold the exact bytes we left.
 *
 * ── The one case it genuinely cannot answer, and which way it fails ──────────
 *
 * A tree installed BEFORE this ledger shipped has no entry for any file. Then
 * "user-edited" and "written by an older CLI" are indistinguishable, and the
 * choice is which error to make. It preserves — an unnecessary `--force` costs
 * one re-run, and a wrong overwrite costs work that has no copy. The message
 * names the files and the flag, so the cost is bounded and visible.
 *
 * `skipped` files are recorded too, which is how a legacy tree heals: every file
 * that already matches the bundle enters the ledger on the first run, and only
 * the genuinely-divergent ones ever need the flag.
 */
export const INSTALL_MANIFEST_BASENAME = ".nexus-install-manifest.json";

/**
 * Which corpus the last install wrote. Read by a person — "which skills am I
 * running" — and by nothing in this CLI, so a manifest without it (every install
 * before this field existed) is simply one that does not say.
 */
export interface InstalledCorpusRecord {
  /** The skills repository commit the files were cut from. */
  commitSha: string;
  source: CorpusSourceKind;
  /** The CLI that wrote them. */
  cliVersion: string;
  installedAt: string;
}

interface InstallManifestFile {
  version: 1;
  files: Record<string, string>;
  corpus?: InstalledCorpusRecord;
}

export interface InstallLedger {
  /** Absolute `.claude` directory the manifest lives in and keys are relative to. */
  readonly claudeDir: string;
  /** What the previous install recorded. */
  readonly previous: Readonly<Record<string, string>>;
  /** What this install has written so far — becomes the next manifest. */
  readonly next: Record<string, string>;
}

export function installManifestPath(claudeDir: string): string {
  return path.join(claudeDir, INSTALL_MANIFEST_BASENAME);
}

/** Read the manifest for `claudeDir`. A missing or unreadable one is an empty ledger. */
export function openInstallLedger(claudeDir: string): InstallLedger {
  const resolved = path.resolve(claudeDir);
  let previous: Record<string, string> = {};
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(installManifestPath(resolved), "utf-8"));
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      (parsed as InstallManifestFile).version === 1
    ) {
      const files = (parsed as InstallManifestFile).files;
      // Only string→string entries survive; a hand-mangled manifest degrades to
      // "we do not recognise this file", never to "this file is ours".
      if (typeof files === "object" && files !== null) {
        previous = Object.fromEntries(
          Object.entries(files).filter(([, v]) => typeof v === "string")
        );
      }
    }
  } catch {
    /* absent, unreadable or malformed — an empty ledger preserves rather than overwrites */
  }
  return { claudeDir: resolved, previous, next: {} };
}

/** Persist what this install wrote. Best-effort: a manifest we cannot write must not fail an install. */
export function commitInstallLedger(ledger: InstallLedger, corpus: InstalledCorpusRecord): void {
  const body: InstallManifestFile = {
    version: 1,
    files: Object.fromEntries(Object.entries(ledger.next).sort(([a], [b]) => a.localeCompare(b))),
    corpus
  };
  try {
    fs.mkdirSync(ledger.claudeDir, { recursive: true });
    fs.writeFileSync(installManifestPath(ledger.claudeDir), `${JSON.stringify(body, null, 2)}\n`);
  } catch {
    /* the next install simply falls back to "unrecognised" and preserves */
  }
}
