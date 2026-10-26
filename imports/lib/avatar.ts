export const MAX_AVATAR_BYTES = 64 * 1024;
export const AVATAR_DATA_PREFIX = "data:image/jpeg;base64,";

export const MAX_AVATAR_DATA_LENGTH =
  AVATAR_DATA_PREFIX.length + Math.ceil(MAX_AVATAR_BYTES / 3) * 4;
