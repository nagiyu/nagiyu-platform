/**
 * Web 取得生データの由来区分。
 *
 * - `request`: ユーザーの依頼（StudyTopic pending）を消費して取得した
 * - `auto`: care 降順の自発リサーチで取得した
 * - `stale`: 既存 WEB fact の鮮度切れ（再検証）で取得した
 */
export type WebRawOrigin = 'request' | 'auto' | 'stale';

/**
 * Web 取得生データ（consolidation が Topic/WEB fact へ集約する前の元データ）
 * （リブトーク知識再設計 P1 / #3697）。
 *
 * 90 日 TTL で自動削除する（`WEBRAW_TTL_SECONDS`）。
 *
 * DynamoDB SK: `CHAR#<charId>#WEBRAW#<rawId>`
 */
export interface WebRawEntity {
  UserID: string;
  CharacterID: string;
  /** Raw ID（ULID、時系列ソート可能） */
  RawID: string;
  /** 検索クエリ */
  Query: string;
  /** 取得した生テキスト */
  RawText: string;
  /** 参照した URL 一覧 */
  SourceUrls: string[];
  /** 由来区分（依頼／自発／鮮度切れ）（甲-1: 依頼由来 provenance） */
  Origin: WebRawOrigin;
  /**
   * 依頼文（`Origin === 'request'` のときのみ設定）。
   * StudyTopic.Topic をそのまま引き継ぐ（甲-1: 依頼由来 provenance）。
   */
  RequestText?: string;
  /**
   * 依頼日時（Unix ms。`Origin === 'request'` のときのみ設定）。
   * StudyTopic.CreatedAt をそのまま引き継ぐ（甲-1: 依頼由来 provenance）。
   */
  RequestedAt?: number;
  CreatedAt: number;
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
 * WebRaw 作成入力（`CreatedAt` はリポジトリ側で付与）。
 * RawID も省略可能：未指定なら ULID を自動採番する。
 */
export type CreateWebRawInput = Omit<WebRawEntity, 'RawID' | 'CreatedAt'> & {
  /** 明示的に ULID を指定したい場合のみ渡す（テスト用途） */
  RawID?: string;
};
