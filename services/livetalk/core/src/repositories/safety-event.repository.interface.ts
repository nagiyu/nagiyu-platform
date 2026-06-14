import type {
  CreateSafetyEventInput,
  SafetyEventEntity,
  SafetyEventKey,
  SafetyEventSummary,
} from '../entities/safety-event.entity.js';

/**
 * SafetyEvent のリポジトリインターフェース（Phase 2d / Issue #3250）。
 *
 * MVP では作成と単件取得のみを公開する。
 * 管理者向けの横断一覧取得は ADR-2.22 / #3580 で追加した。
 */
export interface SafetyEventRepository {
  /**
   * SafetyEvent を保存する。`EventID` 未指定時は ULID を自動採番する。
   */
  create(input: CreateSafetyEventInput): Promise<SafetyEventEntity>;

  /**
   * 単一 SafetyEvent を取得する（主にテスト用）。
   */
  getById(key: SafetyEventKey): Promise<SafetyEventEntity | null>;

  /**
   * GSI2 を Query し、検出時刻の降順で最近の SafetyEvent を横断取得する（ADR-2.22 / #3580）。
   * 全件 Scan を避けるため sparse GSI（GSI2PK='SAFETY'）を使用する。
   * 射影 INCLUDE のため PII（InputText / ResponseText）は含まない。
   *
   * @param limit 取得する最大件数
   */
  listRecent(limit: number): Promise<SafetyEventSummary[]>;
}
