/**
 * Stock Tracker Core - InMemory ModelSnapshot Repository
 *
 * InMemorySingleTableStoreを使用したModelSnapshotRepositoryの実装
 */
import {
  DatabaseError,
  EntityAlreadyExistsError,
  InMemoryEntityStore,
  type EntityStore,
  type InMemorySingleTableStore,
} from '@nagiyu/aws';
import type {
  CreateModelSnapshotResult,
  ModelSnapshotRepository,
} from './model-snapshot.repository.interface.js';
import type { ModelSnapshotKey } from '../entities/model-snapshot.entity.js';
import type { Market, ModelSnapshotItem, Question } from '../forecast/index.js';
import {
  ModelSnapshotMapper,
  buildModelSnapshotPk,
  buildModelSnapshotSk,
} from '../mappers/model-snapshot.mapper.js';

/**
 * InMemory ModelSnapshot Repository
 *
 * 単一アイテムの作成・取得は EntityStore に任せ、直前のスナップショットを探すクエリだけを自前で持つ。
 * テスト環境で使用
 */
export class InMemoryModelSnapshotRepository implements ModelSnapshotRepository {
  private readonly store: InMemorySingleTableStore;
  private readonly mapper = new ModelSnapshotMapper();
  private readonly entityStore: EntityStore<ModelSnapshotItem, ModelSnapshotKey>;

  constructor(store: InMemorySingleTableStore) {
    this.store = store;
    this.entityStore = new InMemoryEntityStore(store, this.mapper);
  }

  /**
   * ModelSnapshot を新規作成する。既に存在する場合は書き込まず、既存のアイテムを返す
   */
  public async createIfAbsent(item: ModelSnapshotItem): Promise<CreateModelSnapshotResult> {
    try {
      return { item: await this.entityStore.create(item), created: true };
    } catch (error) {
      if (error instanceof EntityAlreadyExistsError) {
        const existing = await this.entityStore.get(this.mapper.getKey(item));
        if (!existing) {
          throw new DatabaseError(
            'ModelSnapshot の作成に失敗しましたが、既存アイテムが見つかりません',
            error
          );
        }
        return { item: existing, created: false };
      }
      throw error;
    }
  }

  /**
   * 問い・市場・日付で単一の ModelSnapshot を取得
   */
  public async getByDate(
    question: Question,
    market: Market,
    date: string
  ): Promise<ModelSnapshotItem | null> {
    return this.entityStore.get({ question, market, date });
  }

  /**
   * 問い・市場について、指定日より前の最新の ModelSnapshot を取得する
   *
   * `store.query` は SK 昇順でしか返さない（実 DynamoDB の ScanIndexForward:false を
   * シミュレートする API が無い）ため、条件に一致する全件を集約してから末尾（最新）を取る。
   */
  public async getLatestBefore(
    question: Question,
    market: Market,
    date: string
  ): Promise<ModelSnapshotItem | null> {
    const items = this.store.queryAll({
      pk: buildModelSnapshotPk(question, market),
      sk: { operator: 'lt', value: buildModelSnapshotSk(date) },
    });

    if (items.length === 0) {
      return null;
    }
    return this.mapper.toEntity(items[items.length - 1]);
  }
}
