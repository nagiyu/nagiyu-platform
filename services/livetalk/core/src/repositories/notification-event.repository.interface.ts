import type {
  CreateNotificationEventInput,
  NotificationEventEntity,
  NotificationEventKey,
} from '../entities/notification-event.entity.js';

export interface NotificationEventRepository {
  put(input: CreateNotificationEventInput): Promise<NotificationEventEntity>;
  /** ユーザーの通知履歴を CreatedAt 降順で返す。 */
  listByUser(userId: string, limit?: number): Promise<NotificationEventEntity[]>;
  /**
   * 指定キャラクター群について「最新の未消化通知」を 1 件ずつ返す。
   * CreatedAt 降順に走査し、全キャラで最新未消化が揃うか履歴を尽くすまでページングする（固定件数で打ち切らない）。
   * 戻り値は未消化通知が存在するキャラクターのエントリのみ（順序不問）。
   */
  listLatestUnconsumedByCharacter(
    userId: string,
    characterIds: string[]
  ): Promise<NotificationEventEntity[]>;
  /** 単一通知イベントを返す。なければ null。 */
  get(key: NotificationEventKey): Promise<NotificationEventEntity | null>;
  /** consumedAt を現在時刻で更新する（キャラ第一声表示後に呼ぶ）。 */
  markConsumed(key: NotificationEventKey, consumedAt: number): Promise<void>;
}
