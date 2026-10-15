/** Server cap on parts per request (`MAX_BULK_FILES` on the backend). */
export const PACK_MAX_FILES = 100;

/** File bytes per request — under the edge's 52,428,800-byte body limit with room for the multipart framing. */
export const PACK_MAX_BYTES = 45 * 1024 * 1024;
