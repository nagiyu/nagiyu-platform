/**
 * NiconicoMylistAssistant Core - NiconicoCredential Entity
 *
 * ニコニコ資格情報（user_session）のビジネスオブジェクト
 */

/**
 * ニコニコ資格情報エンティティ
 *
 * DynamoDB の実装詳細（PK/SK）を含まない純粋なビジネスオブジェクト。
 * per-user に 1 件だけ保存し、専用 SK（CREDENTIAL#niconico）で動画設定と混在させない。
 */
export interface NiconicoCredentialEntity {
  /** ユーザーID */
  userId: string;
  /**
   * 暗号化済み user_session ブロブ（JSON.stringify(EncryptedData) 形式）
   *
   * バッチの ENCRYPTED_USER_SESSION 環境変数と同形式。再暗号化なしで転用できる。
   */
  encryptedUserSession: string;
  /** セッション取得日時（epoch ms） */
  acquiredAt: number;
  /** セッション推定有効期限（epoch ms）。保存時刻 + 30 日 */
  estimatedExpiresAt: number;
}

/**
 * NiconicoCredential 作成時の入力データ
 */
export type CreateNiconicoCredentialInput = NiconicoCredentialEntity;

/**
 * NiconicoCredential のビジネスキー
 */
export interface NiconicoCredentialKey {
  userId: string;
}

/**
 * DynamoDB の SK に使用する専用キー定数
 */
export const NICONICO_CREDENTIAL_SK = 'CREDENTIAL#niconico' as const;
