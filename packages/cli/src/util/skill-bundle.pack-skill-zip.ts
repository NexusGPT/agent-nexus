import { formatBytes } from "./skill-bundle.format-bytes";
import { SKILL_ZIP_LIMITS } from "./skill-bundle.limits";
import { createZip, type ZipEntry } from "./zip";

/**
 * Validate a collected file set against the server's ZIP limits and pack it.
 *
 * `label` names the source (a preset name or a directory) so an over-limit
 * bundle says which one blew the budget when several are packed in one command.
 */
export function packSkillZip(files: readonly ZipEntry[], label: string): Buffer {
  if (files.length > SKILL_ZIP_LIMITS.maxFiles) {
    throw new Error(
      `${label}: ${files.length} files exceeds the ${SKILL_ZIP_LIMITS.maxFiles}-file limit for a skill.`
    );
  }

  let total = 0;
  for (const file of files) {
    if (file.path.length > SKILL_ZIP_LIMITS.maxPathLength) {
      throw new Error(
        `${label}: path longer than ${SKILL_ZIP_LIMITS.maxPathLength} characters — ${file.path}`
      );
    }
    if (file.content.length > SKILL_ZIP_LIMITS.maxFileBytes) {
      throw new Error(
        `${label}: "${file.path}" is ${formatBytes(file.content.length)}, over the ` +
          `${formatBytes(SKILL_ZIP_LIMITS.maxFileBytes)} per-file limit.`
      );
    }
    total += file.content.length;
  }
  if (total > SKILL_ZIP_LIMITS.maxTotalBytes) {
    throw new Error(
      `${label}: ${formatBytes(total)} uncompressed, over the ` +
        `${formatBytes(SKILL_ZIP_LIMITS.maxTotalBytes)} limit for a skill.`
    );
  }

  const zip = createZip(files);
  if (zip.length > SKILL_ZIP_LIMITS.maxUploadBytes) {
    throw new Error(
      `${label}: the packed archive is ${formatBytes(zip.length)}, over the ` +
        `${formatBytes(SKILL_ZIP_LIMITS.maxUploadBytes)} upload limit. Remove large assets from the skill.`
    );
  }
  return zip;
}
