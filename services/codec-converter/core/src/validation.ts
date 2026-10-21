import { MAX_FILE_SIZE, ALLOWED_MIME_TYPES, ALLOWED_FILE_EXTENSIONS } from './constants.js';

/**
 * バリデーション結果
 */
export interface ValidationResult {
  /** バリデーション成功フラグ */
  isValid: boolean;
  /** エラーメッセージ（バリデーション失敗時） */
  errorMessage?: string;
}

/**
 * ファイルサイズをバリデーション
 * @param fileSize ファイルサイズ（バイト）
 * @returns バリデーション結果
 */
export function validateFileSize(fileSize: number): ValidationResult {
  if (fileSize <= 0) {
    return {
      isValid: false,
      errorMessage: 'ファイルサイズが不正です',
    };
  }

  if (fileSize > MAX_FILE_SIZE) {
    return {
      isValid: false,
      errorMessage: 'ファイルサイズは500MB以下である必要があります',
    };
  }

  return { isValid: true };
}

/**
 * MIMEタイプをバリデーション
 * @param mimeType MIMEタイプ
 * @returns バリデーション結果
 */
export function validateMimeType(mimeType: string): ValidationResult {
  if (!ALLOWED_MIME_TYPES.includes(mimeType as (typeof ALLOWED_MIME_TYPES)[number])) {
    return {
      isValid: false,
      errorMessage: 'MP4ファイルのみアップロード可能です',
    };
  }

  return { isValid: true };
}

/**
 * ファイル名の拡張子をバリデーション
 * @param fileName ファイル名
 * @returns バリデーション結果
 */
export function validateFileExtension(fileName: string): ValidationResult {
  const extension = fileName.toLowerCase().substring(fileName.lastIndexOf('.'));

  if (!ALLOWED_FILE_EXTENSIONS.includes(extension as (typeof ALLOWED_FILE_EXTENSIONS)[number])) {
    return {
      isValid: false,
      errorMessage: 'MP4ファイルのみアップロード可能です',
    };
  }

  return { isValid: true };
}

/**
 * ファイルを総合的にバリデーション
 * @param fileName ファイル名
 * @param fileSize ファイルサイズ（バイト）
 * @param mimeType MIMEタイプ
 * @returns バリデーション結果
 */
export function validateFile(
  fileName: string,
  fileSize: number,
  mimeType: string
): ValidationResult {
  const extensionResult = validateFileExtension(fileName);
  if (!extensionResult.isValid) {
    return extensionResult;
  }

  const mimeTypeResult = validateMimeType(mimeType);
  if (!mimeTypeResult.isValid) {
    return mimeTypeResult;
  }

  const fileSizeResult = validateFileSize(fileSize);
  if (!fileSizeResult.isValid) {
    return fileSizeResult;
  }

  return { isValid: true };
}
