import { z } from 'zod';
import { ROLES } from '@nagiyu/common';

// 有効なロールIDの配列を動的に生成
const validRoleIds = Object.keys(ROLES) as [string, ...string[]];

/**
 * ユーザー更新リクエストのバリデーションスキーマ
 */
export const UpdateUserSchema = z
  .object({
    name: z
      .string()
      .min(1, '名前は1文字以上で入力してください')
      .max(100, '名前は100文字以内で入力してください')
      .optional(),
    roles: z.array(z.enum(validRoleIds)).optional(),
  })
  .strict(); // 定義外のフィールドを許可しない

/**
 * ユーザー一覧取得のクエリパラメータバリデーションスキーマ
 */
export const ListUsersQuerySchema = z.object({
  limit: z.coerce
    .number()
    .int()
    .min(1, 'limit は1以上である必要があります')
    .max(100, 'limit は100以下である必要があります')
    .default(100),
  nextToken: z.string().optional(),
});
