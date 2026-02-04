/**
 * DynamoDB Repository バリデーション関数
 *
 * DynamoDBからマッピングする際の型安全なバリデーションを提供
 */

import { InvalidEntityDataError } from './errors.js';

/**
 * 文字列フィールドをバリデーション
 *
 * @param value - 検証する値
 * @param fieldName - フィールド名（エラーメッセージ用）
 * @param options - バリデーションオプション
 * @param options.allowEmpty - 空文字列を許可するか（デフォルト: false）
 * @param options.minLength - 最小文字数
 * @param options.maxLength - 最大文字数
 * @throws InvalidEntityDataError バリデーション失敗時
 */
export function validateStringField(
  value: unknown,
  fieldName: string,
  options: {
    allowEmpty?: boolean;
    minLength?: number;
    maxLength?: number;
  } = {}
): string {
  const { allowEmpty = false, minLength, maxLength } = options;

  if (typeof value !== 'string') {
    throw new InvalidEntityDataError(`フィールド "${fieldName}" が文字列ではありません`);
  }

  if (!allowEmpty && value.length === 0) {
    throw new InvalidEntityDataError(`フィールド "${fieldName}" が空です`);
  }

  if (minLength !== undefined && value.length < minLength) {
    throw new InvalidEntityDataError(
      `フィールド "${fieldName}" は${minLength}文字以上である必要があります`
    );
  }

  if (maxLength !== undefined && value.length > maxLength) {
    throw new InvalidEntityDataError(
      `フィールド "${fieldName}" は${maxLength}文字以下である必要があります`
    );
  }

  return value;
}

/**
 * 数値フィールドをバリデーション
 *
 * @param value - 検証する値
 * @param fieldName - フィールド名（エラーメッセージ用）
 * @param options - バリデーションオプション
 * @param options.min - 最小値
 * @param options.max - 最大値
 * @param options.integer - 整数のみ許可するか（デフォルト: false）
 * @throws InvalidEntityDataError バリデーション失敗時
 */
export function validateNumberField(
  value: unknown,
  fieldName: string,
  options: {
    min?: number;
    max?: number;
    integer?: boolean;
  } = {}
): number {
  const { min, max, integer = false } = options;

  if (typeof value !== 'number') {
    throw new InvalidEntityDataError(`フィールド "${fieldName}" が数値ではありません`);
  }

  if (isNaN(value)) {
    throw new InvalidEntityDataError(`フィールド "${fieldName}" が不正な数値です (NaN)`);
  }

  if (!isFinite(value)) {
    throw new InvalidEntityDataError(`フィールド "${fieldName}" が不正な数値です (Infinity)`);
  }

  if (integer && !Number.isInteger(value)) {
    throw new InvalidEntityDataError(`フィールド "${fieldName}" は整数である必要があります`);
  }

  if (min !== undefined && value < min) {
    throw new InvalidEntityDataError(`フィールド "${fieldName}" は${min}以上である必要があります`);
  }

  if (max !== undefined && value > max) {
    throw new InvalidEntityDataError(`フィールド "${fieldName}" は${max}以下である必要があります`);
  }

  return value;
}

/**
 * 列挙型フィールドをバリデーション
 *
 * @param value - 検証する値
 * @param fieldName - フィールド名（エラーメッセージ用）
 * @param allowedValues - 許可される値の配列
 * @throws InvalidEntityDataError バリデーション失敗時
 */
export function validateEnumField<T extends string | number>(
  value: unknown,
  fieldName: string,
  allowedValues: readonly T[]
): T {
  if (!allowedValues.includes(value as T)) {
    throw new InvalidEntityDataError(
      `フィールド "${fieldName}" が不正です。許可される値: ${allowedValues.join(', ')}`
    );
  }

  return value as T;
}

/**
 * 真偽値フィールドをバリデーション
 *
 * @param value - 検証する値
 * @param fieldName - フィールド名（エラーメッセージ用）
 * @throws InvalidEntityDataError バリデーション失敗時
 */
export function validateBooleanField(value: unknown, fieldName: string): boolean {
  if (typeof value !== 'boolean') {
    throw new InvalidEntityDataError(`フィールド "${fieldName}" が真偽値ではありません`);
  }

  return value;
}

/**
 * タイムスタンプフィールドをバリデーション
 *
 * @param value - 検証する値（数値またはISO形式の文字列）
 * @param fieldName - フィールド名（エラーメッセージ用）
 * @param options - バリデーションオプション
 * @param options.allowFuture - 未来の日時を許可するか（デフォルト: true）
 * @throws InvalidEntityDataError バリデーション失敗時
 * @returns Unix タイムスタンプ（ミリ秒）
 *
 * @remarks
 * 文字列形式のタイムスタンプ（ISO 8601形式など）が渡された場合、
 * 自動的にUnixタイムスタンプ（ミリ秒）に変換します。
 * これにより、レガシーデータとの互換性を保ちます。
 */
export function validateTimestampField(
  value: unknown,
  fieldName: string,
  options: {
    allowFuture?: boolean;
  } = {}
): number {
  const { allowFuture = true } = options;

  let timestamp: number;

  // 文字列形式のタイムスタンプを数値に変換
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (isNaN(parsed)) {
      throw new InvalidEntityDataError(
        `フィールド "${fieldName}" が有効なタイムスタンプ形式ではありません`
      );
    }
    timestamp = parsed;
  } else if (typeof value === 'number') {
    timestamp = value;
  } else {
    throw new InvalidEntityDataError(
      `フィールド "${fieldName}" がタイムスタンプ（数値または文字列）ではありません`
    );
  }

  if (!Number.isInteger(timestamp)) {
    throw new InvalidEntityDataError(
      `フィールド "${fieldName}" が整数のタイムスタンプではありません`
    );
  }

  if (timestamp < 0) {
    throw new InvalidEntityDataError(`フィールド "${fieldName}" が負の値のタイムスタンプです`);
  }

  if (!allowFuture && timestamp > Date.now()) {
    throw new InvalidEntityDataError(`フィールド "${fieldName}" が未来のタイムスタンプです`);
  }

  return timestamp;
}
