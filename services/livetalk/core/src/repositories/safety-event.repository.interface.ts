import type {
  CreateSafetyEventInput,
  SafetyEventEntity,
  SafetyEventKey,
} from '../entities/safety-event.entity.js';

/**
 * SafetyEvent のリポジトリインターフェース（Phase 2d / Issue #3250）。
 *
 * MVP では作成と単件取得のみを公開する。
 * 管理者向けの一覧取得は将来的に管理画面と合わせて追加する。
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
}
