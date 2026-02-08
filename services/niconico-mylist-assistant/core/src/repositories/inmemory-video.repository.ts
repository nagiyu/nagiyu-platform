/**
 * NiconicoMylistAssistant Core - InMemory Video Repository
 *
 * テスト用のインメモリ実装
 */

import { InMemorySingleTableStore } from '@nagiyu/aws';
import type { VideoRepository } from './video.repository.interface.js';
import type { VideoEntity, CreateVideoInput } from '../entities/video.entity.js';
import { VideoMapper } from '../mappers/video.mapper.js';

// エラーメッセージ定数
const ERROR_MESSAGES = {
  BATCH_GET_LIMIT: 'batchGet: 最大100件まで取得可能です',
} as const;

/**
 * InMemory Video Repository
 *
 * テスト用のインメモリ動画リポジトリの実装
 */
export class InMemoryVideoRepository implements VideoRepository {
  private readonly mapper: VideoMapper;
  private readonly store: InMemorySingleTableStore;

  constructor(store: InMemorySingleTableStore) {
    this.store = store;
    this.mapper = new VideoMapper();
  }

  /**
   * 動画IDで単一の動画を取得
   */
  public async getById(videoId: string): Promise<VideoEntity | null> {
    const { pk, sk } = this.mapper.buildKeys({ videoId });
    const item = this.store.get(pk, sk);

    if (!item) {
      return null;
    }

    return this.mapper.toEntity(item);
  }

  /**
   * 複数の動画を一括取得
   */
  public async batchGet(videoIds: string[]): Promise<VideoEntity[]> {
    if (videoIds.length === 0) {
      return [];
    }

    if (videoIds.length > 100) {
      throw new Error(ERROR_MESSAGES.BATCH_GET_LIMIT);
    }

    const entities: VideoEntity[] = [];

    for (const videoId of videoIds) {
      const entity = await this.getById(videoId);
      if (entity) {
        entities.push(entity);
      }
    }

    return entities;
  }

  /**
   * 新しい動画を作成
   */
  public async create(input: CreateVideoInput): Promise<VideoEntity> {
    const now = Date.now();
    const entity: VideoEntity = {
      ...input,
      CreatedAt: now,
    };

    const item = this.mapper.toItem(entity);

    // DynamoDB と同じエラーを投げる（attributeNotExists 条件）
    // InMemorySingleTableStore が投げた EntityAlreadyExistsError をそのまま伝播
    this.store.put(item, { attributeNotExists: true });

    return entity;
  }

  /**
   * 動画を削除
   */
  public async delete(videoId: string): Promise<void> {
    const { pk, sk } = this.mapper.buildKeys({ videoId });
    this.store.delete(pk, sk);
  }
}
