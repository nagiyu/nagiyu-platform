import type {
  ConsolidationCursorEntity,
  PutConsolidationCursorInput,
} from '../entities/consolidation-cursor.entity.js';

/**
 * 集約（consolidation）バッチの進捗カーソルのリポジトリ。
 */
export interface ConsolidationCursorRepository {
  /** カーソルを取得する。存在しなければ null。 */
  get(userId: string, characterId: string): Promise<ConsolidationCursorEntity | null>;

  /**
   * カーソルを保存する。
   *
   * - 新規作成時（`opts.expectedUpdatedAt` 未指定）: 既に存在すれば `OptimisticLockError` を投げる。
   * - 更新時（`opts.expectedUpdatedAt` 指定）: 保存済みの `updatedAt` と一致するときだけ書き込む。
   *   一致しなければ `OptimisticLockError`、カーソルが存在しなければ `EntityNotFoundError` を投げる。
   */
  put(
    entity: PutConsolidationCursorInput,
    opts?: { expectedUpdatedAt?: number }
  ): Promise<ConsolidationCursorEntity>;
}
