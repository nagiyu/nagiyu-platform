/**
 * Stock Tracker Core - DynamoDB Alert Repository
 *
 * DynamoDBを使用したAlertRepositoryの実装
 */

import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import {
  DynamoDBEntityStore,
  TTL_ATTRIBUTE_NAME,
  toDatabaseError,
  queryAllItems,
  queryPage,
  type DynamoDBAttributes,
  type DynamoDBItem,
  type EntityStore,
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

/**
 * DynamoDB Alert Repository
 *
 * 単一アイテムの CRUD は EntityStore に任せ、GSI の Query だけを自前で持つ
 */
export class DynamoDBAlertRepository implements AlertRepository {
  private readonly docClient: DynamoDBDocumentClient;
  private readonly tableName: string;
  private readonly mapper = new AlertMapper();
  private readonly entityStore: EntityStore<AlertEntity, AlertKey>;

  constructor(docClient: DynamoDBDocumentClient, tableName: string) {
    this.docClient = docClient;
    this.tableName = tableName;
    this.entityStore = new DynamoDBEntityStore(docClient, tableName, this.mapper);
  }

  /**
   * ユーザーIDとアラートIDで単一のアラートを取得
   */
  public async getById(userId: string, alertId: string): Promise<AlertEntity | null> {
    return this.entityStore.get({ userId, alertId });
  }

  /**
   * ユーザーのアラート一覧を取得（GSI1使用）。
   *
   * 論理削除待ち（TTL 属性が設定済み = 一時アラート失効バッチで `markTemporaryAsExpired`
   * された）のアイテムは常に除外する。ユーザーが手動で無効化したアラート
   * （`Enabled=false` で TTL は未設定）は引き続き返す。
   */
  public async getByUserId(
    userId: string,
    options?: GetByUserIdOptions
  ): Promise<PaginatedResult<AlertEntity>> {
    let page: PaginatedResult<DynamoDBItem>;
    try {
      page = await queryPage(
        this.docClient,
        {
          TableName: this.tableName,
          IndexName: 'UserIndex',
          KeyConditionExpression: '#gsi1pk = :userId AND begins_with(#gsi1sk, :prefix)',
          FilterExpression: 'attribute_not_exists(#ttl)',
          ExpressionAttributeNames: {
            '#gsi1pk': 'GSI1PK',
            '#gsi1sk': 'GSI1SK',
            '#ttl': TTL_ATTRIBUTE_NAME,
          },
          ExpressionAttributeValues: {
            ':userId': buildAlertGsi1Pk(userId),
            ':prefix': ALERT_GSI1_SK_PREFIX,
          },
        },
        { limit: options?.limit || 50, cursor: options?.cursor }
      );
    } catch (error) {
      throw toDatabaseError(error);
    }

    // mapper.toEntity は同期的なデータ検証であり、ここから投げられるエラーは
    // 全て個別アイテムの検証失敗。バッチ呼び出し全体を壊さないよう、
    // エラー種別の判定に依存せず常にスキップ＆警告ログとする。
    const items: AlertEntity[] = [];
    for (const item of page.items) {
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

    return {
      items,
      nextCursor: page.nextCursor,
      count: items.length,
    };
  }

  /**
   * 頻度ごとのアラート一覧を取得（GSI2=AlertIndexを使用、バッチ処理用）。
   *
   * GSI2SK（`${userId}#${alertId}`）昇順のQueryで、インタフェース契約のuserId昇順・
   * 同一userId内はalertId昇順を実現する。LastEvaluatedKeyがなくなるまでQueryを
   * ループして全件を集約する契約のため、Limitは指定しない（DynamoDBの1MBページ単位）。
   */
  public async getByFrequency(frequency: 'MINUTE_LEVEL' | 'HOURLY_LEVEL'): Promise<AlertEntity[]> {
    try {
      const rawItems = await queryAllItems(this.docClient, {
        TableName: this.tableName,
        IndexName: 'AlertIndex',
        KeyConditionExpression: '#gsi2pk = :pk',
        ExpressionAttributeNames: {
          '#gsi2pk': 'GSI2PK',
        },
        ExpressionAttributeValues: {
          ':pk': buildAlertGsi2Pk(frequency),
        },
      });

      // mapper.toEntity は同期的なデータ検証であり、ここから投げられるエラーは
      // 全て個別アイテムの検証失敗。バッチ呼び出し全体を壊さないよう、
      // エラー種別の判定に依存せず常にスキップ＆警告ログとする。
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
    } catch (error) {
      throw toDatabaseError(error);
    }
  }

  /**
   * 全頻度のアラートを、読めないアイテムも含めて取得する (GSI2=AlertIndex を使用、購読の点検用)。
   *
   * 読めないアイテムは警告ログで捨てずに、`unreadable` として返す。購読の点検では
   * 壊れたアラートこそ見つけて手動で直す対象のため。頻度は 2 値のみで、
   * 両頻度を全ページ辿れば全アラートになる。
   */
  public async getAllForSubscriptionAudit(): Promise<AlertAuditResult> {
    const result: AlertAuditResult = { alerts: [], unreadable: [] };

    for (const frequency of ['MINUTE_LEVEL', 'HOURLY_LEVEL'] as const) {
      let rawItems: DynamoDBAttributes[];
      try {
        rawItems = await queryAllItems(this.docClient, {
          TableName: this.tableName,
          IndexName: 'AlertIndex',
          KeyConditionExpression: '#gsi2pk = :pk',
          ExpressionAttributeNames: {
            '#gsi2pk': 'GSI2PK',
          },
          ExpressionAttributeValues: {
            ':pk': buildAlertGsi2Pk(frequency),
          },
        });
      } catch (error) {
        throw toDatabaseError(error);
      }

      const split = this.mapper.splitReadable(rawItems);
      result.alerts.push(...split.alerts);
      result.unreadable.push(...split.unreadable);
    }

    return result;
  }

  /**
   * 一時アラート失効バッチ用の軽量取得（GSI2=AlertIndexを使用）。
   *
   * - GSI2SK（`${userId}#${alertId}`）昇順のQueryで、インタフェース契約のuserId昇順・
   *   同一userId内はalertId昇順を実現する
   * - ProjectionExpression で失効判定に必要な属性のみ取得し、subscription は読み込まない
   * - FilterExpression で `Temporary = true AND TTL 未設定` のアラートのみに絞る
   *   （`markTemporaryAsExpired` 済みのものを再処理しない。Enabled=false でも
   *   ユーザー手動無効化された一時アラートはバッチで回収して TTL を付与する）
   * - FilterExpression 併用時、Limit は「フィルタ後の返却件数」ではなく
   *   「評価したアイテム件数」に適用される（DynamoDBの仕様）。そのため1ページの
   *   返却件数がlimitを下回ることがあるが、nextCursorによる継続走査で全件を辿れる
   * - mapper.toTemporaryCandidate でアイテム単位検証し、失敗時は警告ログでスキップ
   * - limit未指定時は50件を既定とする
   */
  public async getTemporaryCandidatesByFrequency(
    frequency: 'MINUTE_LEVEL' | 'HOURLY_LEVEL',
    options?: PaginationOptions
  ): Promise<PaginatedResult<TemporaryAlertCandidate>> {
    let page: PaginatedResult<DynamoDBItem>;
    try {
      page = await queryPage(
        this.docClient,
        {
          TableName: this.tableName,
          IndexName: 'AlertIndex',
          KeyConditionExpression: '#gsi2pk = :pk',
          FilterExpression: '#temporary = :true AND attribute_not_exists(#ttl)',
          ProjectionExpression:
            '#pk, #sk, #alertId, #userId, #exchangeId, #frequency, #enabled, #temporary, #temporaryExpireDate',
          ExpressionAttributeNames: {
            '#gsi2pk': 'GSI2PK',
            '#temporary': 'Temporary',
            '#enabled': 'Enabled',
            '#ttl': TTL_ATTRIBUTE_NAME,
            '#pk': 'PK',
            '#sk': 'SK',
            '#alertId': 'AlertID',
            '#userId': 'UserID',
            '#exchangeId': 'ExchangeID',
            '#frequency': 'Frequency',
            '#temporaryExpireDate': 'TemporaryExpireDate',
          },
          ExpressionAttributeValues: {
            ':pk': buildAlertGsi2Pk(frequency),
            ':true': true,
          },
        },
        { limit: options?.limit || 50, cursor: options?.cursor }
      );
    } catch (error) {
      throw toDatabaseError(error);
    }

    const items: TemporaryAlertCandidate[] = [];
    for (const item of page.items) {
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
      nextCursor: page.nextCursor,
      count: items.length,
    };
  }

  /**
   * 新しいアラートを作成
   */
  public async create(input: CreateAlertInput): Promise<AlertEntity> {
    return this.entityStore.create({ ...input, alertId: randomUUID() });
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
   * 一時アラートを失効状態にする（無効化 + 物理削除時刻の設定）。
   *
   * 書き込みは subscription に触れないため、subscription が壊れたアラートでも失効の書き込みは
   * 完了する。更新後の Entity への変換で壊れたデータが分かった場合は、書き込み後に
   * `InvalidEntityDataError` が上がる。壊れたデータを黙って成功扱いにしない。
   */
  public async markTemporaryAsExpired(
    userId: string,
    alertId: string,
    expiresAt: number
  ): Promise<void> {
    await this.entityStore.update({ userId, alertId }, { enabled: false, expiresAt });
  }
}
