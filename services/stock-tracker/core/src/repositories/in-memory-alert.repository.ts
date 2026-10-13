/**
 * Stock Tracker Core - InMemory Alert Repository
 *
 * InMemorySingleTableStoreを使用したAlertRepositoryの実装
 */

import {
  InMemoryEntityStore,
  InvalidEntityDataError,
  TTL_ATTRIBUTE_NAME,
  type EntityStore,
  type InMemorySingleTableStore,
  type PaginationOptions,
  type PaginatedResult,
} from '@nagiyu/aws';
import type { AlertRepository, GetByUserIdOptions } from './alert.repository.interface.js';
import type {
  AlertEntity,
  AlertKey,
  CreateAlertInput,
  UpdateAlertInput,
} from '../entities/alert.entity.js';
import type { TemporaryAlertCandidate } from '../entities/temporary-alert-candidate.entity.js';
import {
  AlertMapper,
  ALERT_GSI1_SK_PREFIX,
  buildAlertGsi1Pk,
  buildAlertGsi2Pk,
} from '../mappers/alert.mapper.js';
import { randomUUID } from 'crypto';

// 実DynamoDB実装（dynamodb-alert.repository.ts）はgetByUserId/
// getTemporaryCandidatesByFrequencyのlimit未指定時に50件を既定とするため、
// InMemory実装もこれに合わせる（store既定の100件のままだと乖離する）。
// （getByFrequencyは全件返却契約のためこのlimitは使用しない。ページを辿り切る際は
// FULL_SCAN_PAGE_SIZEを使う）
//
// 実DynamoDB実装と同じFalsyフォールバック（`options?.limit || DEFAULT_PAGE_LIMIT`）にする。
// Nullishフォールバック（`??`）にすると、limit: 0 がstore（queryByAttribute等）まで
// 素通りし、そちらの`options?.limit || 100`で100件にフォールバックしてしまう
// （この契約テストが潰そうとしている「store既定100件との乖離」がlimit: 0の経路にだけ
// 温存される）ため、ここは`||`で揃える。
const DEFAULT_PAGE_LIMIT = 50;
// getByFrequency（全件返却）の内部走査ページサイズ。DEFAULT_PAGE_LIMITとは独立した実装都合の値。
const FULL_SCAN_PAGE_SIZE = 100;

/**
 * InMemory Alert Repository
 *
 * 単一アイテムの CRUD は EntityStore に任せ、GSI の近似クエリだけを自前で持つ。
 * テスト環境で使用
 */
export class InMemoryAlertRepository implements AlertRepository {
  private readonly store: InMemorySingleTableStore;
  private readonly mapper = new AlertMapper();
  private readonly entityStore: EntityStore<AlertEntity, AlertKey>;

  constructor(store: InMemorySingleTableStore) {
    this.store = store;
    this.entityStore = new InMemoryEntityStore(store, this.mapper);
  }

  /**
   * ユーザーIDとアラートIDで単一のアラートを取得
   */
  public async getById(userId: string, alertId: string): Promise<AlertEntity | null> {
    return this.entityStore.get({ userId, alertId });
  }

  /**
   * ユーザーのアラート一覧を取得。
   *
   * 論理削除待ち（TTL 属性が設定済み）のアイテムは DynamoDB 実装に合わせて常に除外する。
   */
  public async getByUserId(
    userId: string,
    options?: GetByUserIdOptions
  ): Promise<PaginatedResult<AlertEntity>> {
    const result = this.store.queryByAttribute(
      {
        attributeName: 'GSI1PK',
        attributeValue: buildAlertGsi1Pk(userId),
        sk: {
          attributeName: 'GSI1SK',
          operator: 'begins_with',
          value: ALERT_GSI1_SK_PREFIX,
        },
      },
      {
        ...options,
        limit: options?.limit || DEFAULT_PAGE_LIMIT,
      }
    );

    const items = result.items
      .filter((item) => item[TTL_ATTRIBUTE_NAME] === undefined)
      .map((item) => this.mapper.toEntity(item));

    return {
      items,
      nextCursor: result.nextCursor,
      count: items.length,
    };
  }

  /**
   * 頻度ごとのアラート一覧を取得（バッチ処理用）。
   *
   * 全件を返す契約のため、nextCursorがなくなるまでstoreのページを辿り切って集約する。
   */
  public async getByFrequency(frequency: 'MINUTE_LEVEL' | 'HOURLY_LEVEL'): Promise<AlertEntity[]> {
    const items: AlertEntity[] = [];
    let cursor: string | undefined;

    do {
      const page = this.store.queryByAttribute(
        {
          attributeName: 'GSI2PK',
          attributeValue: buildAlertGsi2Pk(frequency),
          // sk条件を指定しないため、実DynamoDBのGSI2 Queryと同様にGSI2SK昇順で返すよう明示する
          gsiSortKeyAttributeName: 'GSI2SK',
        },
        {
          limit: FULL_SCAN_PAGE_SIZE,
          cursor,
        }
      );
      items.push(...page.items.map((item) => this.mapper.toEntity(item)));
      cursor = page.nextCursor;
    } while (cursor);

    return items;
  }

  /**
   * 新しいアラートを作成
   */
  public async create(input: CreateAlertInput): Promise<AlertEntity> {
    const now = Date.now();
    // updatedAt は store が書き込み時に現在時刻で上書きする。Entity 型上は必須のため値だけ渡す。
    return this.entityStore.create({
      ...input,
      alertId: randomUUID(),
      createdAt: now,
      updatedAt: now,
    });
  }

  /**
   * アラートを更新
   */
  public async update(
    userId: string,
    alertId: string,
    updates: UpdateAlertInput
  ): Promise<AlertEntity> {
    return this.entityStore.update({ userId, alertId }, updates);
  }

  /**
   * アラートを削除
   */
  public async delete(userId: string, alertId: string): Promise<void> {
    await this.entityStore.delete({ userId, alertId });
  }

  /**
   * 一時アラート失効バッチ用の軽量取得（Temporary=true かつ TTL 未設定）。
   *
   * 既に `markTemporaryAsExpired` 済み（TTL あり）は除外する。
   * Enabled=false でもユーザー手動無効化された一時アラートはバッチで回収するため候補に含める。
   */
  public async getTemporaryCandidatesByFrequency(
    frequency: 'MINUTE_LEVEL' | 'HOURLY_LEVEL',
    options?: PaginationOptions
  ): Promise<PaginatedResult<TemporaryAlertCandidate>> {
    const result = this.store.queryByAttribute(
      {
        attributeName: 'GSI2PK',
        attributeValue: buildAlertGsi2Pk(frequency),
        // sk条件を指定しないため、実DynamoDBのGSI2 Queryと同様にGSI2SK昇順で返すよう明示する
        gsiSortKeyAttributeName: 'GSI2SK',
      },
      {
        ...options,
        limit: options?.limit || DEFAULT_PAGE_LIMIT,
      }
    );

    const items: TemporaryAlertCandidate[] = [];
    for (const item of result.items) {
      if (item.Temporary !== true) {
        continue;
      }
      if (item[TTL_ATTRIBUTE_NAME] !== undefined) {
        continue;
      }
      try {
        items.push(this.mapper.toTemporaryCandidate(item));
      } catch {
        // InMemory 実装では検証失敗時もテストの意図を壊さないようスキップ
        continue;
      }
    }

    return {
      items,
      nextCursor: result.nextCursor,
      count: items.length,
    };
  }

  /**
   * 一時アラートを失効状態にする（Enabled=false + 物理削除時刻の設定）。
   *
   * 更新後の Entity への変換は subscription を検証するが、その時点で失効の書き込みは
   * 完了しているため、変換の失敗は握りつぶす。DynamoDB 実装と揃えている。
   */
  public async markTemporaryAsExpired(
    userId: string,
    alertId: string,
    expiresAt: number
  ): Promise<void> {
    try {
      await this.entityStore.update({ userId, alertId }, { enabled: false, expiresAt });
    } catch (error) {
      if (error instanceof InvalidEntityDataError) {
        return;
      }
      throw error;
    }
  }
}
