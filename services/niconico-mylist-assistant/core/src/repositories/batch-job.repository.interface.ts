/**
 * NiconicoMylistAssistant Core - BatchJob Repository Interface
 *
 * バッチジョブデータの CRUD 操作インターフェース
 */

import type {
  BatchJobEntity,
  CreateBatchJobInput,
  UpdateBatchJobInput,
} from '../entities/batch-job.entity';

/**
 * BatchJob Repository インターフェース
 *
 * DynamoDB実装とInMemory実装が共通で実装するインターフェース
 */
export interface BatchJobRepository {
  /**
   * ジョブIDとユーザーIDで単一のバッチジョブを取得
   *
   * @param jobId - ジョブID
   * @param userId - ユーザーID
   * @returns バッチジョブエンティティ（存在しない場合はnull）
   */
  getById(jobId: string, userId: string): Promise<BatchJobEntity | null>;

  /**
   * 新しいバッチジョブを作成
   *
   * @param input - バッチジョブデータ
   * @returns 作成されたバッチジョブエンティティ（CreatedAt/UpdatedAtを含む）
   * @throws {EntityAlreadyExistsError} 既に同じjobIdのジョブが存在する場合
   */
  create(input: CreateBatchJobInput): Promise<BatchJobEntity>;

  /**
   * バッチジョブのステータスを更新
   *
   * @param jobId - ジョブID
   * @param userId - ユーザーID
   * @param input - 更新データ
   * @returns 更新されたバッチジョブエンティティ
   * @throws {EntityNotFoundError} ジョブが存在しない場合
   */
  update(jobId: string, userId: string, input: UpdateBatchJobInput): Promise<BatchJobEntity>;

  /**
   * バッチジョブを削除
   *
   * @param jobId - ジョブID
   * @param userId - ユーザーID
   */
  delete(jobId: string, userId: string): Promise<void>;
}
