/**
 * Stock Tracker Core - InMemory ModelSnapshot Repository
 *
 * InMemorySingleTableStoreを使用したModelSnapshotRepositoryの実装
 */
import { EntityAlreadyExistsError, InMemorySingleTableStore, type DynamoDBItem } from '@nagiyu/aws';
import type {
  CreateModelSnapshotResult,
  ModelSnapshotRepository,
} from './model-snapshot.repository.interface.js';
import type { Market, ModelSnapshotItem, Question } from '../forecast/index.js';
import { ModelSnapshotMapper } from '../mappers/model-snapshot.mapper.js';

// ベーステーブル PK（MODEL#{Question}#{Market}）の全件集約で store 既定の query limit（100件）
// による打ち切りを避けるため、他リポジトリと同じ流儀でcursorループを使う。
const FULL_AGGREGATION_PAGE_SIZE = 100;

/**
 * InMemory ModelSnapshot Repository
 *
 * InMemorySingleTableStoreを使用したモデルスナップショットリポジトリの実装
 * テスト環境で使用
 */
export class InMemoryModelSnapshotRepository implements ModelSnapshotRepository {
  private readonly mapper: ModelSnapshotMapper;
  private readonly store: InMemorySingleTableStore;

  constructor(store: InMemorySingleTableStore) {
    this.store = store;
    this.mapper = new ModelSnapshotMapper();
  }

  /**
   * ModelSnapshot を条件付きで新規作成する（`attribute_not_exists(PK)`）
   */
  public async createIfAbsent(item: ModelSnapshotItem): Promise<CreateModelSnapshotResult> {
    const dbItem = this.mapper.toItem(item);

    try {
      this.store.put(dbItem, { attributeNotExists: true });
      return { item: this.mapper.toEntity(dbItem), created: true };
    } catch (error) {
      if (error instanceof EntityAlreadyExistsError) {
        const existing = await this.getByDate(item.question, item.market, item.date);
        if (!existing) {
          throw new Error('ModelSnapshot の作成に失敗しましたが、既存アイテムが見つかりません', {
            cause: error,
          });
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
    const { pk, sk } = this.mapper.buildKeys({ question, market, date });
    const item = this.store.get(pk, sk);
    if (!item) {
      return null;
    }
    return this.mapper.toEntity(item);
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
    const { pk } = this.mapper.buildKeys({ question, market, date });
    const items: DynamoDBItem[] = [];
    let cursor: string | undefined;

    do {
      const page = this.store.query(
        { pk, sk: { operator: 'lt', value: `DATE#${date}` } },
        { limit: FULL_AGGREGATION_PAGE_SIZE, cursor }
      );
      items.push(...page.items);
      cursor = page.nextCursor;
    } while (cursor);

    if (items.length === 0) {
      return null;
    }
    return this.mapper.toEntity(items[items.length - 1]);
  }
}
