import path from "node:path";

import { color, isJsonMode } from "../../output";
import { fetchTarball } from "../../util/fetch-tarball";
import { extractPresetFromTarball } from "../../util/skill-bundle.extract-preset-from-tarball";
import { packSkillZip } from "../../util/skill-bundle.pack-skill-zip";
import { presetTarballUrl } from "../../util/skill-bundle.preset-tarball-url";
import { readSkillDirectory } from "../../util/skill-bundle.read-skill-directory";
import type { resolvePresets } from "../../util/skill-bundle.resolve-presets";
import type { ZipEntry } from "../../util/zip";

/** One of the baseline skills `add-preset` knows how to fetch. */
export type SkillPreset = ReturnType<typeof resolvePresets>[number];

/** A preset packed and ready to send, with the file count that produced it. */
export interface PresetBundle {
  preset: SkillPreset;
  zip: Buffer;
  fileCount: number;
}

/** Where `add-preset` reads the preset sources from. */
export interface PresetSource {
  ref: string;
  repo: string;
  fromDir?: string;
  /**
   * The global `--timeout`, in SECONDS — {@link fetchTarball} converts it.
   *
   * 🚨 THE UNIT IS IN THE NAME BECAUSE THIS SLOT IS A BOUNDARY AND BOTH UNITS
   * ARE `number`. A bare `timeout` here is the NEX-3707 shape:
   * `timeout-values-carry-their-unit.test.ts` classifies every `timeout:`
   * property that is not an argument to `createClient` as MILLISECONDS, and the
   * remedy it prescribes — wrap it in `timeoutSecondsToMs(…)` — would convert a
   * value `fetchTarball` converts again, a 1000× deadline through the one gate
   * written to stop exactly that.
   */
  timeoutSeconds?: number;
}

/**
 * Pack every requested preset into a ZIP.
 *
 * One download serves every requested preset — they all live in the same
 * repository, and re-fetching per preset would multiply a 3 MB transfer by the
 * size of an "office" bundle for nothing.
 */
export async function buildPresetBundles(
  presets: readonly SkillPreset[],
  source: PresetSource
): Promise<PresetBundle[]> {
  let tarball: Buffer | undefined;
  if (!source.fromDir) {
    const url = presetTarballUrl(source.repo, source.ref);
    if (!isJsonMode()) console.log(color.dim(`Fetching ${url} …`));
    tarball = await fetchTarball(url, source.timeoutSeconds);
  }

  return presets.map((preset) => {
    const files: ZipEntry[] = source.fromDir
      ? readSkillDirectory(path.join(source.fromDir, preset.repoPath))
      : extractPresetFromTarball(tarball as Buffer, preset.repoPath);
    return { preset, zip: packSkillZip(files, preset.name), fileCount: files.length };
  });
}
