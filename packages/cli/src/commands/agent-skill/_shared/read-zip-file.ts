import { formatBytes } from "../../../util/skill-bundle.format-bytes";
import { SKILL_ZIP_LIMITS } from "../../../util/skill-bundle.limits";
import { readUploadBuffer, resolveUploadPath } from "../../../util/upload-file";

/** Read a user-supplied `.zip` and bounce it off the upload limit before the wire. */
export function readZipFile(filePath: string): Buffer {
  const absolute = resolveUploadPath(filePath);
  const buffer = readUploadBuffer(absolute);
  if (buffer.length > SKILL_ZIP_LIMITS.maxUploadBytes) {
    throw new Error(
      `${absolute} is ${formatBytes(buffer.length)}, over the ` +
        `${formatBytes(SKILL_ZIP_LIMITS.maxUploadBytes)} upload limit.`
    );
  }
  // Local file headers start with "PK\x03\x04"; an empty archive starts "PK\x05\x06".
  // Catching this here turns "the server rejected your archive" into a message
  // naming the file the user actually passed.
  if (buffer.length < 4 || buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
    throw new Error(`${absolute} is not a ZIP archive.`);
  }
  return buffer;
}
