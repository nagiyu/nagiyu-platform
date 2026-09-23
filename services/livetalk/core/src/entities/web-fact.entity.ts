/**
 * WEB fact（Web リサーチで得られた外部事実）の揮発性区分。
 *
 * 揮発性が高いほど再検証（NextReview）の間隔を短く取る想定
 * （具体的な再検証ロジックは consolidation の実装タスクで扱う）。
 */
export type WebFactVolatility = 'stable' | 'low' | 'medium' | 'high';

/**
 * Topic に紐づく WEB fact（Web リサーチで獲得した外部事実）（リブトーク知識再設計 P1 / #3697）。
 *
 * `TopicEntity` 配下に同居する 1 fact = 1 item。
 *
 * DynamoDB SK: `CHAR#<charId>#TOPIC#<topicId>#WEB#<factId>`
 */
export interface WebFactEntity {
  UserID: string;
  CharacterID: string;
  TopicID: string;
  /** Fact ID（ULID、時系列ソート可能） */
  FactID: string;
  /** fact 本文 */
  Text: string;
  /** 参照した URL 一覧 */
  SourceUrls: string[];
  /** 揮発性区分 */
  Volatility: WebFactVolatility;
  /**
   * 次回再検証予定時刻（Unix ms）。揮発性のある fact（stable 以外）のみ設定する。
   * stable な fact は再検証不要なので undefined のままにする。
   */
  NextReview?: number;
  /** 観測（取得）時刻（Unix ms） */
  ObservedAt: number;
  CreatedAt: number;
}

/**
 * 単一 WEB fact を取得する際のキー。
 */
export interface WebFactKey {
  userId: string;
  characterId: string;
  topicId: string;
  factId: string;
}

/**
 * WEB fact 作成入力（`CreatedAt` はリポジトリ側で付与）。
 * FactID も省略可能：未指定なら ULID を自動採番する。
 */
export type CreateWebFactInput = Omit<WebFactEntity, 'FactID' | 'CreatedAt'> & {
  /** 明示的に ULID を指定したい場合のみ渡す（テスト用途） */
  FactID?: string;
};
