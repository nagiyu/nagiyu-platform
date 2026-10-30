/**
 * Stock Tracker Core - InMemory Alert Repository
 *
 * InMemorySingleTableStoreを使用したAlertRepositoryの実装
 */

import {
  InMemoryEntityStore,
  TTL_ATTRIBUTE_NAME,
  type DynamoDBAttributes,
  type EntityStore,
  type InMemorySingleTableStore,
  type PaginationOptions,
  type PaginatedResult,
} from '@nagiyu/aws';
import { logger, toErrorMessage } from '@nagiyu/common';
import type {
  AlertAuditResult,
  AlertRepository,
  GetByUserIdOptions,
} from './alert.repository.interface.js';
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
// （getByFrequencyは全件返却契約のためこのlimitは使用しない）
//
// 実DynamoDB実装と同じFalsyフォールバック（`options?.limit || DEFAULT_PAGE_LIMIT`）にする。
// Nullishフォールバック（`??`）にすると、limit: 0 がstore（queryByAttribute等）まで
// 素通りし、そちらの`options?.limit || 100`で100件にフォールバックしてしまう
// （この契約テストが潰そうとしている「store既定100件との乖離」がlimit: 0の経路にだけ
// 温存される）ため、ここは`||`で揃える。
const DEFAULT_PAGE_LIMIT = 50;

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

    const items = this.toReadableEntities(
      result.items.filter((item) => item[TTL_ATTRIBUTE_NAME] === undefined)
    );

    return {
      items,
      nextCursor: result.nextCursor,
      count: items.length,
    };
  }

  /**
   * 頻度ごとのアラート一覧を取得（バッチ処理用）。
   *
   * 全件を返す契約のため、ページで切らずに全件を取得する。
   */
  public async getByFrequency(frequency: 'MINUTE_LEVEL' | 'HOURLY_LEVEL'): Promise<AlertEntity[]> {
    const items = this.store.queryAllByAttribute({
      attributeName: 'GSI2PK',
      attributeValue: buildAlertGsi2Pk(frequency),
      // sk条件を指定しないため、実DynamoDBのGSI2 Queryと同様にGSI2SK昇順で返すよう明示する
      gsiSortKeyAttributeName: 'GSI2SK',
    });
    return this.toReadableEntities(items);
  }

  /**
   * 全頻度のアラートを、読めないアイテムも含めて取得する (購読の点検用)。
   *
   * 読めないアイテムは警告ログで捨てずに、`unreadable` として返す。
   */
  public async getAllForSubscriptionAudit(): Promise<AlertAuditResult> {
    const result: AlertAuditResult = { alerts: [], unreadable: [] };

    for (const frequency of ['MINUTE_LEVEL', 'HOURLY_LEVEL'] as const) {
      const items = this.store.queryAllByAttribute({
        attributeName: 'GSI2PK',
        attributeValue: buildAlertGsi2Pk(frequency),
        gsiSortKeyAttributeName: 'GSI2SK',
      });
      const split = this.mapper.splitReadable(items);
      result.alerts.push(...split.alerts);
      result.unreadable.push(...split.unreadable);
    }

    return result;
  }

  /**
   * 読めないアイテムは警告ログを出して読み飛ばす。一覧の取得を、1 件の壊れたデータで
   * 失敗させないため (DynamoDB 実装と揃える)。
   */
  private toReadableEntities(rawItems: DynamoDBAttributes[]): AlertEntity[] {
    const items: AlertEntity[] = [];
    for (const item of rawItems) {
      try {
        items.push(this.mapper.toEntity(item));
      } catch (error) {
        logger.warn('無効なアラートデータをスキップしました', {
          pk: item.PK,
          sk: item.SK,
          error: toErrorMessage(error),
        });
      }
    }
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
      } catch (error) {
        logger.warn('無効な一時アラート候補をスキップしました', {
          pk: item.PK,
          sk: item.SK,
          error: toErrorMessage(error),
        });
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
   * subscription が壊れたアラートでも失効の書き込みは完了する。更新後の Entity への変換で
   * 壊れたデータが分かった場合は、書き込み後に `InvalidEntityDataError` が上がる
   * (DynamoDB 実装と揃える)。
   */
  public async markTemporaryAsExpired(
    userId: string,
    alertId: string,
    expiresAt: number
  ): Promise<void> {
    await this.entityStore.update({ userId, alertId }, { enabled: false, expiresAt });
  }
}
