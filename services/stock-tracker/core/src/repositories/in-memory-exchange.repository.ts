/**
 * Stock Tracker Core - InMemory Exchange Repository
 *
 * InMemorySingleTableStoreを使用したExchangeRepositoryの実装
 */

import { InMemoryEntityStore, type EntityStore, type InMemorySingleTableStore } from '@nagiyu/aws';
import type { ExchangeRepository } from './exchange.repository.interface.js';
import type {
  ExchangeEntity,
  ExchangeKey,
  CreateExchangeInput,
  UpdateExchangeInput,
} from '../entities/exchange.entity.js';
import { ExchangeMapper } from '../mappers/exchange.mapper.js';

/**
 * InMemory Exchange Repository
 *
 * 単一アイテムの CRUD は EntityStore に任せ、Type 属性の走査だけを自前で持つ。
 * テスト環境で使用
 */
export class InMemoryExchangeRepository implements ExchangeRepository {
  private readonly store: InMemorySingleTableStore;
  private readonly mapper = new ExchangeMapper();
  private readonly entityStore: EntityStore<ExchangeEntity, ExchangeKey>;

  constructor(store: InMemorySingleTableStore) {
    this.store = store;
    this.entityStore = new InMemoryEntityStore(store, this.mapper);
  }

  /**
   * 取引所IDで単一の取引所を取得
   */
  public async getById(exchangeId: string): Promise<ExchangeEntity | null> {
    return this.entityStore.get({ exchangeId });
  }

  /**
   * 全取引所を取得
   *
   * `Type`属性の一致でScanを近似する（GSIを介さない）ため、返却順序は保証しない。
   */
  public async getAll(): Promise<ExchangeEntity[]> {
    const items = this.store.queryAllByAttribute({
      attributeName: 'Type',
      attributeValue: this.mapper.entityType,
    });
    return items.map((item) => this.mapper.toEntity(item));
  }

  /**
   * 速い経路の全取引所取得
   *
   * InMemory には GSI キー未付与の状態がないため、getAll と同じ結果を返す。
   */
  public async getAllIndexed(): Promise<ExchangeEntity[]> {
    return this.getAll();
  }

  /**
   * 新しい取引所を作成
   */
  public async create(input: CreateExchangeInput): Promise<ExchangeEntity> {
    const now = Date.now();
    // updatedAt は store が書き込み時に現在時刻で上書きする。Entity 型上は必須のため値だけ渡す。
    return this.entityStore.create({ ...input, createdAt: now, updatedAt: now });
  }

  /**
   * 取引所を更新
   */
  public async update(exchangeId: string, updates: UpdateExchangeInput): Promise<ExchangeEntity> {
    return this.entityStore.update({ exchangeId }, updates);
  }

  /**
   * 取引所を削除
   */
  public async delete(exchangeId: string): Promise<void> {
    await this.entityStore.delete({ exchangeId });
  }
}
