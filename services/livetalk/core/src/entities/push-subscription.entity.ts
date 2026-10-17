/**
 * ユーザーの Web Push サブスクリプション。
 *
 * Phase 5d（#3346）push subscribe API が書き込む。
 * DynamoDB SK: `PUSH_SUBSCRIPTION#<subscriptionId>`
 * subscriptionId = SHA-256(endpoint) の先頭 32 文字に `sub_` プレフィックス。
 */
export interface PushSubscriptionEntity {
  userId: string;
  /** endpoint の SHA-256 ハッシュ由来の ID（`sub_<hex32>`） */
  subscriptionId: string;
  /** Web Push endpoint URL */
  endpoint: string;
  /** ECDH 公開鍵 */
  p256dhKey: string;
  /** 認証シークレット */
  authKey: string;
  createdAt: number;
  updatedAt: number;
}

export interface PushSubscriptionKey {
  userId: string;
  subscriptionId: string;
}

export type CreatePushSubscriptionInput = Omit<PushSubscriptionEntity, 'createdAt' | 'updatedAt'>;
