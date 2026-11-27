/**
 * AuthUsers モジュール
 *
 * auth のユーザーテーブルの項目の形と、他サービスがロールの出どころだけを読む reader。
 */

export type { AuthUserRoleSourceReader, AuthUserRoleSources } from './reader.js';
export type { UserKey } from './mapper.js';
export {
  UserMapper,
  LEGACY_ATTRIBUTE_NAMES,
  roleGrantToItem,
  roleGrantToEntity,
  readRoles,
  readRoleGrants,
} from './mapper.js';
export { DynamoDBAuthUserRoleSourceReader } from './dynamodb-reader.js';
export { InMemoryAuthUserRoleSourceReader } from './in-memory-reader.js';
export { createAuthUserRoleSourceReader, resetAuthUserRoleSourceReader } from './factory.js';
export { getInMemoryAuthUserStore, resetInMemoryAuthUserStore } from './in-memory-store.js';
