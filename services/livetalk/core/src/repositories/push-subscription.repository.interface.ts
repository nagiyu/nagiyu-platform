import type {
  CreatePushSubscriptionInput,
  PushSubscriptionEntity,
  PushSubscriptionKey,
} from '../entities/push-subscription.entity.js';

export interface PushSubscriptionRepository {
  /** サブスクリプションを保存（upsert）する。 */
  put(input: CreatePushSubscriptionInput): Promise<PushSubscriptionEntity>;
  /** ユーザーの全サブスクリプションを返す。 */
  listByUser(userId: string): Promise<PushSubscriptionEntity[]>;
  /** 単一サブスクリプションを返す。なければ null。 */
  get(key: PushSubscriptionKey): Promise<PushSubscriptionEntity | null>;
  /** サブスクリプションを削除する（無効な endpoint 検出時に呼ぶ）。 */
  delete(key: PushSubscriptionKey): Promise<void>;
}
