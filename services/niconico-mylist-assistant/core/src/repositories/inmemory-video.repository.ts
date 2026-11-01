/**
 * NiconicoMylistAssistant Core - InMemory Video Repository
 *
 * テスト用のインメモリ実装
 */

import { InMemoryEntityStore, type EntityStore, type InMemorySingleTableStore } from '@nagiyu/aws';
import type { VideoRepository } from './video.repository.interface.js';
import type { VideoEntity, VideoKey, CreateVideoInput } from '../entities/video.entity.js';
import { VideoMapper } from '../mappers/video.mapper.js';

/**
 * InMemory Video Repository
 *
 * 単一アイテムの CRUD は EntityStore に任せ、全件取得と一括取得だけを自前で持つ
 */
export class InMemoryVideoRepository implements VideoRepository {
  private readonly mapper = new VideoMapper();
  private readonly store: InMemorySingleTableStore;
  private readonly entityStore: EntityStore<VideoEntity, VideoKey>;

  constructor(store: InMemorySingleTableStore) {
    this.store = store;
    this.entityStore = new InMemoryEntityStore(store, this.mapper);
  }

  /**
   * 全動画を取得
   */
  public async listAll(): Promise<VideoEntity[]> {
    const items = this.store
      .scanAll()
      .filter(
        (item) =>
          typeof item.PK === 'string' &&
          typeof item.SK === 'string' &&
          item.PK.startsWith('VIDEO#') &&
          item.SK.startsWith('VIDEO#')
      );

    return items.map((item) => this.mapper.toEntity(item));
  }

  /**
   * 動画IDで単一の動画を取得
   */
  public async getById(videoId: string): Promise<VideoEntity | null> {
    return this.entityStore.get({ videoId });
  }

  /**
   * 複数の動画を一括取得
   */
  public async batchGet(videoIds: string[]): Promise<VideoEntity[]> {
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
    return this.entityStore.create(input);
  }

  /**
   * 動画を削除
   */
  public async delete(videoId: string): Promise<void> {
    await this.entityStore.delete({ videoId });
  }

  /**
   * 動画を削除する。対象がなくても成功する
   */
  public async deleteIfExists(videoId: string): Promise<void> {
    await this.entityStore.deleteIfExists({ videoId });
  }
}
