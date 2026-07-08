import type { CreateWebRawInput, WebRawEntity } from '../entities/webraw.entity.js';

/**
 * Web 取得生データ（WebRaw）のリポジトリ（リブトーク知識再設計 P1 / #3697）。
 * consolidation バッチが Topic/WEB fact へ集約する前の元データを保持する。
 */
export interface WebRawRepository {
  /** WebRaw を保存する。`RawID` 未指定なら ULID を自動採番する。TTL（90 日）はリポジトリ側で自動付与する。 */
  put(input: CreateWebRawInput): Promise<WebRawEntity>;

  /**
   * 指定日時以降（`sinceMs` 以降、exclusive）の WebRaw を時系列昇順で全件返す。
   * `sinceMs` が 0 の場合は全件を返す。consolidation バッチが前回集約後の
   * WebRaw のみを処理するために使用する。
   */
  listSince(userId: string, characterId: string, sinceMs: number): Promise<WebRawEntity[]>;
}
