/**
 * 送信済みプッシュ通知の配信履歴。
 *
 * Phase 5d（#3346）notify バッチが書き込む。
 * - 1日上限チェックに使用
 * - 適応的間隔の missedCount 計算に使用（lastInteractionAt 以降の件数）
 * - キャラ第一声の未消化チェックに consumedAt を使用
 *
 * DynamoDB SK: `NOTIF#<ulid>`（TTL 30日）
 */
export interface NotificationEventEntity {
  userId: string;
  /** ULID（時系列ソート可能） */
  notifId: string;
  /**
   * 通知元キャラ。欠落した旧データは DEFAULT_CHARACTER_ID 扱い。
   */
  characterId: string;
  /** 通知種別 */
  kind: 'normal' | 'critical';
  /**
   * 通知のタイトル（キャラ口調）
   * バッチで生成した文面を保存しておき、第一声に再利用する。
   */
  title: string;
  /** 通知本文 */
  body: string;
  /** クリティカル/通常通知の元となった TopicID（Topic 中心モデル、P5〜） */
  topicId?: string;
  /**
   * 通知タップ起動時に入力欄へプリフィルするユーザー発話。
   * バッチで生成し、first-word API 経由でフロントへ渡す。
   * 例: 「TypeScriptについて教えて」
   */
  suggestedReply?: string;
  /**
   * 第一声消化日時（Unix ms）。
   * 起動時にキャラ第一声として表示したら更新する（重複防止）。
   */
  consumedAt?: number;
  /** 作成 / 更新時刻（Unix ms） */
  createdAt: number;
  updatedAt: number;
  /** 自動削除する時刻 (Unix ms)。保存時は TTL 属性のエポック秒になる */
  expiresAt: number;
}

export interface NotificationEventKey {
  userId: string;
  notifId: string;
}

export type CreateNotificationEventInput = Omit<NotificationEventEntity, 'createdAt' | 'updatedAt'>;
