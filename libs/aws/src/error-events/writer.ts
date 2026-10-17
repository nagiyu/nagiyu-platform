/**
 * ErrorEventWriter インタフェース定義
 *
 * プラットフォーム上で発生したエラーイベントを永続化する書き込み専用 API。
 * DynamoDB / in-memory の両方の実装を切り替え可能にするため抽象化する。
 */

import type { ErrorEvent } from '@nagiyu/common';

/**
 * エラーイベント書き込み API
 */
export interface ErrorEventWriter {
  /**
   * エラーイベントを 1 件書き込む。
   *
   * @param event - 永続化するエラーイベント
   * @throws データベース書き込みに失敗した場合
   */
  put(event: ErrorEvent): Promise<void>;
}

/**
 * エラーイベントを一意に識別するビジネスキー
 */
export type ErrorEventKey = {
  serviceId: string;
  /** 発生時刻 (epoch ミリ秒)。SK には ISO 文字列に直して埋め込まれる */
  occurredAt: number;
  eventId: string;
};
