/**
 * ファイルサイズ上限 (500MB)
 */
export const MAX_FILE_SIZE = 500 * 1024 * 1024; // 524,288,000 bytes

/**
 * 変換処理タイムアウト (2時間)
 */
export const CONVERSION_TIMEOUT_SECONDS = 7200;

/**
 * ジョブの有効期限 (24時間)
 */
export const JOB_EXPIRATION_SECONDS = 86400;

/**
 * 許可されるMIMEタイプ
 */
export const ALLOWED_MIME_TYPES = ['video/mp4'] as const;

/**
 * 許可されるファイル拡張子
 */
export const ALLOWED_FILE_EXTENSIONS = ['.mp4'] as const;

/**
 * コーデックごとの出力ファイル拡張子
 */
export const CODEC_FILE_EXTENSIONS = {
  h264: '.mp4',
  vp9: '.webm',
  av1: '.webm',
} as const;
