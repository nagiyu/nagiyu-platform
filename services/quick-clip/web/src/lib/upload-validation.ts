/**
 * アップロード対象動画の検証。
 * サーバー (ジョブ作成 API) と画面で同じ判定・文言を使い、
 * 画面で通ったファイルがサーバーで拒否される食い違いを防ぐ。
 */

export const UPLOAD_VALIDATION_ERROR_MESSAGES = {
  INVALID_FILE_TYPE: 'MP4 形式の動画ファイルのみアップロードできます',
  INVALID_FILE_SIZE: 'ファイルサイズが不正です',
} as const;

/** アップロードできる動画の最大サイズ (20 GB) */
export const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024 * 1024;

const ACCEPTED_EXTENSION = '.mp4';
const ACCEPTED_CONTENT_TYPE = 'video/mp4';

/**
 * ファイル名の拡張子と Content-Type が MP4 として妥当かを判定する。
 * Content-Type は未指定 (undefined) なら拡張子のみで判定し、指定されたら video/mp4 のみ許可する。
 */
export const isValidMp4File = (fileName: string, contentType?: string): boolean =>
  fileName.trim().toLowerCase().endsWith(ACCEPTED_EXTENSION) &&
  (typeof contentType !== 'string' || contentType === ACCEPTED_CONTENT_TYPE);

/** ファイルサイズが 0 より大きく上限以下かを判定する。 */
export const isValidFileSize = (fileSize: number): boolean =>
  Number.isFinite(fileSize) && fileSize > 0 && fileSize <= MAX_FILE_SIZE_BYTES;

/**
 * アップロード対象の検証を行い、不正な場合はその理由 (日本語メッセージ) を返す。
 * 問題がなければ null を返す。
 */
export const validateUploadFile = (file: {
  name: string;
  size: number;
  type?: string;
}): string | null => {
  // ブラウザは OS が MIME を判別できないと空文字を返す。未指定として扱い拡張子で判定する
  if (!isValidMp4File(file.name, file.type || undefined)) {
    return UPLOAD_VALIDATION_ERROR_MESSAGES.INVALID_FILE_TYPE;
  }
  if (!isValidFileSize(file.size)) {
    return UPLOAD_VALIDATION_ERROR_MESSAGES.INVALID_FILE_SIZE;
  }
  return null;
};
