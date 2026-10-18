/**
 * Web 取得生データの由来区分。
 *
 * - `request`: ユーザーの依頼（StudyTopic pending）を消費して取得した
 * - `auto`: care 降順の自発リサーチで取得した
 * - `stale`: 既存 WEB fact の鮮度切れ（再検証）で取得した
 */
export type WebRawOrigin = 'request' | 'auto' | 'stale';

/**
 * Web 取得生データ（consolidation が Topic/WEB fact へ集約する前の元データ）。
 *
 * 90 日 TTL で自動削除する（`WEBRAW_TTL_SECONDS`）。
 *
 * DynamoDB SK: `CHAR#<charId>#WEBRAW#<rawId>`
 */
export interface WebRawEntity {
  userId: string;
  characterId: string;
  /** Raw ID（ULID、時系列ソート可能） */
  rawId: string;
  /** 検索クエリ */
  query: string;
  /** 取得した生テキスト */
  rawText: string;
  /** 参照した URL 一覧 */
  sourceUrls: string[];
  /** 由来区分（依頼／自発／鮮度切れ） */
  origin: WebRawOrigin;
  /**
   * 依頼文（`origin === 'request'` のときのみ設定）。
   * StudyTopic.topic をそのまま引き継ぐ。
   */
  requestText?: string;
  /**
   * 依頼日時（Unix ms。`origin === 'request'` のときのみ設定）。
   * StudyTopic.createdAt をそのまま引き継ぐ。
   */
  requestedAt?: number;
  createdAt: number;
  /** 自動削除する時刻 (Unix ms)。保存時は TTL 属性のエポック秒になる */
  expiresAt?: number;
}

/**
 * 単一 WebRaw を取得する際のキー。
 */
export interface WebRawKey {
  userId: string;
  characterId: string;
  rawId: string;
}

/**
 * WebRaw 作成入力（`createdAt` / `expiresAt` はリポジトリ側で付与）。
 * rawId も省略可能：未指定なら ULID を自動採番する。
 */
export type CreateWebRawInput = Omit<WebRawEntity, 'rawId' | 'createdAt' | 'expiresAt'> & {
  /** 明示的に ULID を指定したい場合のみ渡す（テスト用途） */
  rawId?: string;
};
