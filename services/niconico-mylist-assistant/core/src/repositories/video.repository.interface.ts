/**
 * NiconicoMylistAssistant Core - Video Repository Interface
 *
 * 動画データの CRUD 操作インターフェース
 */

import type { VideoEntity, CreateVideoInput } from '../entities/video.entity.js';

/**
 * Video Repository インターフェース
 *
 * DynamoDB実装とInMemory実装が共通で実装するインターフェース
 */
export interface VideoRepository {
  /**
   * 動画IDで単一の動画を取得
   *
   * @param videoId - 動画ID
   * @returns 動画エンティティ（存在しない場合はnull）
   */
  getById(videoId: string): Promise<VideoEntity | null>;

  /**
   * 複数の動画を一括取得
   *
   * @param videoIds - 動画IDの配列（最大100件）
   * @returns 動画エンティティの配列（存在するもののみ）
   */
  batchGet(videoIds: string[]): Promise<VideoEntity[]>;

  /**
   * 新しい動画を作成
   *
   * @param input - 動画データ
   * @returns 作成された動画エンティティ（createdAtを含む）
   * @throws {EntityAlreadyExistsError} 既に同じvideoIdの動画が存在する場合
   */
  create(input: CreateVideoInput): Promise<VideoEntity>;

  /**
   * 動画を削除
   *
   * @param videoId - 動画ID
   */
  delete(videoId: string): Promise<void>;
}
