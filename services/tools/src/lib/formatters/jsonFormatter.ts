import { JsonFormatterResult } from '@/types/tools';

export const ERROR_MESSAGES = {
  INVALID_JSON: 'JSONとして正しくない形式です。',
  EMPTY_INPUT: '入力が空です。JSON文字列を入力してください。',
} as const;

/**
 * JSON を整形する（Pretty Print）
 * インデント2スペースで整形されたJSON文字列を返す
 */
export function formatJson(input: string): JsonFormatterResult {
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

/**
 * JSON を圧縮する（Minify）
 * 不要な空白・改行を削除し、1行に圧縮されたJSON文字列を返す
 */
export function minifyJson(input: string): JsonFormatterResult {
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

    // 圧縮された JSON 文字列を生成（インデントなし）
    const formatted = JSON.stringify(parsed);

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
