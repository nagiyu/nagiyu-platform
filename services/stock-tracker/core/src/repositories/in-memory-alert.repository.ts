/**
 * Stock Tracker Core - InMemory Alert Repository
 *
 * InMemorySingleTableStoreを使用したAlertRepositoryの実装
 */

import {
  InMemorySingleTableStore,
  EntityNotFoundError,
  EntityAlreadyExistsError,
  DatabaseError,
  type PaginationOptions,
  type PaginatedResult,
} from '@nagiyu/aws';
import type { AlertRepository, GetByUserIdOptions } from './alert.repository.interface.js';
import type { AlertEntity, CreateAlertInput, UpdateAlertInput } from '../entities/alert.entity.js';
import type { TemporaryAlertCandidate } from '../entities/temporary-alert-candidate.entity.js';
import { AlertMapper } from '../mappers/alert.mapper.js';
import { randomUUID } from 'crypto';

// エラーメッセージ定数
const ERROR_MESSAGES = {
  NO_UPDATES_SPECIFIED: '更新するフィールドが指定されていません',
} as const;

/**
 * InMemory Alert Repository
 *
 * InMemorySingleTableStoreを使用したアラートリポジトリの実装
 * テスト環境で使用
 */
export class InMemoryAlertRepository implements AlertRepository {
  private readonly mapper: AlertMapper;
  private readonly store: InMemorySingleTableStore;

  constructor(store: InMemorySingleTableStore) {
    this.store = store;
    this.mapper = new AlertMapper();
  }

  /**
   * ユーザーIDとアラートIDで単一のアラートを取得
   */
  public async getById(userId: string, alertId: string): Promise<AlertEntity | null> {
    const { pk, sk } = this.mapper.buildKeys({ userId, alertId });
    const item = this.store.get(pk, sk);

    if (!item) {
      return null;
    }

    return this.mapper.toEntity(item);
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
        attributeValue: userId,
        sk: {
          attributeName: 'GSI1SK',
          operator: 'begins_with',
          value: 'Alert#',
        },
      },
      options
    );

    const filteredRawItems = result.items.filter(
      (item) => (item as Record<string, unknown>).TTL === undefined
    );
    const items = filteredRawItems.map((item) => this.mapper.toEntity(item));

    return {
      items,
      nextCursor: result.nextCursor,
      count: items.length,
    };
  }

  /**
   * 頻度ごとのアラート一覧を取得（バッチ処理用）
   */
  public async getByFrequency(
    frequency: 'MINUTE_LEVEL' | 'HOURLY_LEVEL',
    options?: PaginationOptions
  ): Promise<PaginatedResult<AlertEntity>> {
    const result = this.store.queryByAttribute(
      {
        attributeName: 'GSI2PK',
        attributeValue: `ALERT#${frequency}`,
      },
      options
    );

    const items = result.items.map((item) => this.mapper.toEntity(item));

    return {
      items,
      nextCursor: result.nextCursor,
      count: result.count,
    };
  }

  /**
   * 新しいアラートを作成
   */
  public async create(input: CreateAlertInput): Promise<AlertEntity> {
    const now = Date.now();
    const alertId = randomUUID();
    const entity: AlertEntity = {
      ...input,
      AlertID: alertId,
      CreatedAt: now,
      UpdatedAt: now,
    };

    const item = this.mapper.toItem(entity);

    try {
      this.store.put(item, { attributeNotExists: true });
      return entity;
    } catch (error) {
      // EntityAlreadyExistsError はそのまま投げる
      if (error instanceof EntityAlreadyExistsError) {
        throw error;
      }
      throw error;
    }
  }

  /**
   * アラートを更新
   */
  public async update(
    userId: string,
    alertId: string,
    updates: UpdateAlertInput
  ): Promise<AlertEntity> {
    // 更新するフィールドがない場合はエラー
    if (Object.keys(updates).length === 0) {
      throw new DatabaseError(ERROR_MESSAGES.NO_UPDATES_SPECIFIED);
    }

    const { pk, sk } = this.mapper.buildKeys({ userId, alertId });
    const existingItem = this.store.get(pk, sk);

    if (!existingItem) {
      throw new EntityNotFoundError('Alert', `${userId}#${alertId}`);
    }

    const existingEntity = this.mapper.toEntity(existingItem);
    const now = Date.now();

    // 更新を適用
    const updatedEntity: AlertEntity = {
      ...existingEntity,
      ...updates,
      UpdatedAt: now,
    };

    const updatedItem = this.mapper.toItem(updatedEntity);
    this.store.put(updatedItem);

    return updatedEntity;
  }

  /**
   * アラートを削除
   */
  public async delete(userId: string, alertId: string): Promise<void> {
    const { pk, sk } = this.mapper.buildKeys({ userId, alertId });

    try {
      this.store.delete(pk, sk, { attributeExists: true });
    } catch (error) {
      // EntityNotFoundError はそのまま投げる
      if (error instanceof EntityNotFoundError) {
        throw error;
      }
      throw error;
    }
  }

  /**
   * 一時アラート失効バッチ用の軽量取得（Temporary=true かつ Enabled=true のみ）
   */
  public async getTemporaryCandidatesByFrequency(
    frequency: 'MINUTE_LEVEL' | 'HOURLY_LEVEL',
    options?: PaginationOptions
  ): Promise<PaginatedResult<TemporaryAlertCandidate>> {
    const result = this.store.queryByAttribute(
      {
        attributeName: 'GSI2PK',
        attributeValue: `ALERT#${frequency}`,
      },
      options
    );

    const items: TemporaryAlertCandidate[] = [];
    for (const item of result.items) {
      if (item.Temporary !== true || item.Enabled !== true) {
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
   * 一時アラートを失効状態にする（Enabled=false + TTL 設定）
   */
  public async markTemporaryAsExpired(
    userId: string,
    alertId: string,
    ttlSeconds: number
  ): Promise<void> {
    const { pk, sk } = this.mapper.buildKeys({ userId, alertId });
    const existing = this.store.get(pk, sk);
    if (!existing) {
      throw new EntityNotFoundError('Alert', `${userId}#${alertId}`);
    }

    const updated = {
      ...existing,
      Enabled: false,
      TTL: ttlSeconds,
      UpdatedAt: Date.now(),
    };

    this.store.put(updated);
  }
}
