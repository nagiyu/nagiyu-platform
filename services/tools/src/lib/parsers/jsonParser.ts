import { JsonFormatterResult } from '@/types/tools';

export const ERROR_MESSAGES = {
  INVALID_JSON: 'JSONとして正しくない形式です。',
  EMPTY_INPUT: '入力が空です。JSON文字列を入力してください。',
  UNKNOWN_ERROR: '予期しないエラーが発生しました。',
} as const;

/**
 * JSON の有効性を検証する
 */
export function validateJson(input: string): { valid: boolean; error?: string } {
  // 空チェック
  if (!input || input.trim() === '') {
    return {
      valid: false,
      error: ERROR_MESSAGES.EMPTY_INPUT,
    };
  }

  // JSON として有効かチェック
  try {
    JSON.parse(input);
    return { valid: true };
  } catch {
    return {
      valid: false,
      error: ERROR_MESSAGES.INVALID_JSON,
    };
  }
}

/**
 * JSON 文字列をパースしてオブジェクトを返す
 */
export function parseJson(input: string): JsonFormatterResult {
  // 空チェック
  if (!input || input.trim() === '') {
    return {
      formatted: '',
      isValid: false,
      error: ERROR_MESSAGES.EMPTY_INPUT,
    };
  }

  try {
    // JSON としてパース
    const parsed = JSON.parse(input);

    // 整形された JSON 文字列を生成（インデント2スペース）
    const formatted = JSON.stringify(parsed, null, 2);

    return {
      formatted,
      isValid: true,
    };
  } catch {
    return {
      formatted: '',
      isValid: false,
      error: ERROR_MESSAGES.INVALID_JSON,
    };
  }
}
