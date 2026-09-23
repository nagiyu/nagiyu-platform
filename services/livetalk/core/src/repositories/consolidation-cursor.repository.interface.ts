import type {
  ConsolidationCursorEntity,
  PutConsolidationCursorInput,
} from '../entities/consolidation-cursor.entity.js';

/**
 * 集約（consolidation）バッチの進捗カーソルのリポジトリ（リブトーク知識再設計 P1 / #3697）。
 */
export interface ConsolidationCursorRepository {
  /** カーソルを取得する。存在しなければ null。 */
  get(userId: string, characterId: string): Promise<ConsolidationCursorEntity | null>;

  /**
   * カーソルを保存する。
   *
   * - 新規作成時（`opts.expectedUpdatedAt` 未指定）: `attribute_not_exists(PK)` で保護する。
   * - 更新時（`opts.expectedUpdatedAt` 指定）: `UpdatedAt = :expected` の楽観ロックで保護する。
   * - 条件不一致の場合は `OptimisticLockError` を投げる。
   */
  put(
    entity: PutConsolidationCursorInput,
    opts?: { expectedUpdatedAt?: number }
  ): Promise<ConsolidationCursorEntity>;
}
