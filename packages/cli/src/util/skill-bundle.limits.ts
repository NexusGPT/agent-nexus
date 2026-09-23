/**
 * The server-side ZIP limits, mirrored here so the CLI can name the offending
 * file.
 *
 * Rejected at the API they come back as one sentence about the archive with no
 * path in it, which is unactionable when the archive was assembled from a
 * directory the user never zipped by hand.
 */
export const SKILL_ZIP_LIMITS = {
  /** `CodeInterpreterSkillsService.MAX_ZIP_FILE_COUNT` */
  maxFiles: 500,
  /** `CodeInterpreterSkillsService.MAX_ZIP_SINGLE_FILE_SIZE` */
  maxFileBytes: 2 * 1024 * 1024,
  /** `CodeInterpreterSkillsService.MAX_ZIP_TOTAL_UNCOMPRESSED_SIZE` */
  maxTotalBytes: 20 * 1024 * 1024,
  /** `FileInterceptor` limit on the upload routes — applies to the ZIP itself. */
  maxUploadBytes: 5 * 1024 * 1024,
  /** `CodeInterpreterSkillsService.MAX_ZIP_PATH_LENGTH` */
  maxPathLength: 255
} as const;
