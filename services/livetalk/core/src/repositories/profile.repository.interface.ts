import type {
  CreateProfileInput,
  ProfileEntity,
  ProfileKey,
  UpdateProfileInput,
} from '../entities/profile.entity.js';

/**
 * ユーザープロファイルのリポジトリ。
 *
 * `getById` / `upsert` のみを公開する。明示的な create / update を分けないのは、
 * Auth サービスのセッションを受けて「初回はレコード作成、以降は更新」という
 * 単純なユースケースしかないため。Phase 2 以降で複雑になったら分割する。
 */
export interface ProfileRepository {
  getById(key: ProfileKey): Promise<ProfileEntity | null>;
  /**
   * プロファイルを upsert する。
   * 既存があれば渡された `updates` を適用、無ければ create + updates 反映で新規作成する。
   */
  upsert(input: CreateProfileInput, updates?: UpdateProfileInput): Promise<ProfileEntity>;
  /**
   * 全ユーザーの UserID を列挙する。
   * GSI1（GSI1PK='PROFILE'）を Query して Profile のみを読む（テーブル全体を Scan しない）。
   * 内部で LastEvaluatedKey をループし全件返す。バッチのユーザー列挙に用いる。
   */
  listAllUserIds(): Promise<string[]>;
}
