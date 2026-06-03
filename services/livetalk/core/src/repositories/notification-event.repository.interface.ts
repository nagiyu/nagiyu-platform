import type {
  CreateNotificationEventInput,
  NotificationEventEntity,
  NotificationEventKey,
} from '../entities/notification-event.entity.js';

export interface NotificationEventRepository {
  put(input: CreateNotificationEventInput): Promise<NotificationEventEntity>;
  /** ユーザーの通知履歴を CreatedAt 降順で返す。 */
  listByUser(userId: string, limit?: number): Promise<NotificationEventEntity[]>;
  /** 単一通知イベントを返す。なければ null。 */
  get(key: NotificationEventKey): Promise<NotificationEventEntity | null>;
  /** consumedAt を現在時刻で更新する（キャラ第一声表示後に呼ぶ）。 */
  markConsumed(key: NotificationEventKey, consumedAt: number): Promise<void>;
}
