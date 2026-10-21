import { z } from 'zod';
import { ROLES } from '@nagiyu/common';

/**
 * ユーザー関連 API のリクエストボディ検証メッセージ
 *
 * Zod の既定メッセージは英語で、そのままレスポンスの details に載ると利用者に英語が見える。
 * z.config でグローバルに差し替えると他のスキーマへ影響するため、スキーマごとに error で指定する。
 */
export const USER_VALIDATION_ERROR_MESSAGES = {
  BODY_NOT_OBJECT: 'リクエストボディは JSON オブジェクトで指定してください',
  UNKNOWN_FIELD: '指定できない項目が含まれています',
  NAME_NOT_STRING: '名前は文字列で指定してください',
  NAME_TOO_SHORT: '名前は1文字以上で入力してください',
  NAME_TOO_LONG: '名前は100文字以内で入力してください',
  ROLES_NOT_ARRAY: 'roles は配列で指定してください',
  ROLE_NOT_STRING: 'roles の各要素は文字列で指定してください',
  ROLE_INVALID: 'roles に無効なロールが含まれています',
} as const;

// 有効なロールIDの配列を動的に生成
const validRoleIds = Object.keys(ROLES) as [string, ...string[]];

/**
 * ユーザー更新リクエストのバリデーションスキーマ
 */
export const UpdateUserSchema = z
  .object(
    {
      name: z
        .string({ error: USER_VALIDATION_ERROR_MESSAGES.NAME_NOT_STRING })
        .min(1, { error: USER_VALIDATION_ERROR_MESSAGES.NAME_TOO_SHORT })
        .max(100, { error: USER_VALIDATION_ERROR_MESSAGES.NAME_TOO_LONG })
        .optional(),
      roles: z
        .array(z.enum(validRoleIds, { error: USER_VALIDATION_ERROR_MESSAGES.ROLE_INVALID }), {
          error: USER_VALIDATION_ERROR_MESSAGES.ROLES_NOT_ARRAY,
        })
        .optional(),
    },
    {
      error: (issue) =>
        issue.code === 'unrecognized_keys'
          ? USER_VALIDATION_ERROR_MESSAGES.UNKNOWN_FIELD
          : USER_VALIDATION_ERROR_MESSAGES.BODY_NOT_OBJECT,
    }
  )
  .strict(); // 定義外のフィールドを許可しない
