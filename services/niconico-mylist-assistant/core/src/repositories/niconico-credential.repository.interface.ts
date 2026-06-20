/**
 * NiconicoMylistAssistant Core - NiconicoCredential Repository Interface
 *
 * ニコニコ資格情報（user_session）の CRUD 操作インターフェース
 */

import type {
  NiconicoCredentialEntity,
  CreateNiconicoCredentialInput,
} from '../entities/niconico-credential.entity.js';

/**
 * NiconicoCredential Repository インターフェース
 *
 * per-user に 1 件だけ保存する設計のため、getByUserId / upsert / delete のみ提供する。
 */
export interface NiconicoCredentialRepository {
  /**
   * ユーザーID でニコニコ資格情報を取得
   *
   * @param userId - ユーザーID
   * @returns ニコニコ資格情報エンティティ（存在しない場合は null）
   */
  getByUserId(userId: string): Promise<NiconicoCredentialEntity | null>;

  /**
   * ニコニコ資格情報を保存（upsert）
   *
   * 既存レコードが存在する場合は上書きする。
   *
   * @param input - 保存する資格情報
   * @returns 保存されたエンティティ
   */
  upsert(input: CreateNiconicoCredentialInput): Promise<NiconicoCredentialEntity>;

  /**
   * ニコニコ資格情報を削除
   *
   * @param userId - ユーザーID
   */
  delete(userId: string): Promise<void>;
}
