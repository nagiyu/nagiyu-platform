/**
 * Ticker Repository
 *
 * ティッカーデータのCRUD操作を提供
 *
 * 機能:
 * - getAll: 全ティッカー取得（オプショナルフィルタ）
 * - getById: 単一取得
 * - getByExchange: 取引所ごとの取得（GSI3使用）
 * - create: 作成（TickerID自動生成: {Exchange.Key}:{Symbol}）
 * - update: 更新
 * - delete: 削除
 */

import { QueryCommand, ScanCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import {
  AbstractDynamoDBRepository,
  EntityNotFoundError,
  EntityAlreadyExistsError,
  InvalidEntityDataError,
  DatabaseError,
  validateStringField,
  validateTimestampField,
  type DynamoDBItem,
} from '@nagiyu/aws';
import type { Ticker } from '../types.js';

// 互換性のためのエラークラスエイリアス
export class TickerNotFoundError extends Error {
  constructor(tickerId: string) {
    super(`ティッカーが見つかりません: ${tickerId}`);
    this.name = 'TickerNotFoundError';
  }
}

export class TickerAlreadyExistsError extends Error {
  constructor(tickerId: string) {
    super(`ティッカーは既に存在します: ${tickerId}`);
    this.name = 'TickerAlreadyExistsError';
  }
}

export class InvalidTickerDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidTickerDataError';
  }
}

/**
 * Ticker リポジトリ
 */
export class TickerRepository extends AbstractDynamoDBRepository<Ticker, { tickerId: string }> {
  constructor(docClient: DynamoDBDocumentClient, tableName: string) {
    super(docClient, {
      tableName,
      entityType: 'Ticker',
    });
  }

  /**
   * PK/SK を構築
   */
  protected buildKeys(key: { tickerId: string }): { PK: string; SK: string } {
    return {
      PK: `TICKER#${key.tickerId}`,
      SK: 'METADATA',
    };
  }

  /**
   * DynamoDB Item を Ticker にマッピング
   */
  protected mapToEntity(item: Record<string, unknown>): Ticker {
    try {
      return {
        TickerID: validateStringField(item.TickerID, 'TickerID'),
        Symbol: validateStringField(item.Symbol, 'Symbol'),
        Name: validateStringField(item.Name, 'Name'),
        ExchangeID: validateStringField(item.ExchangeID, 'ExchangeID'),
        CreatedAt: validateTimestampField(item.CreatedAt, 'CreatedAt'),
        UpdatedAt: validateTimestampField(item.UpdatedAt, 'UpdatedAt'),
      };
    } catch (error) {
      if (error instanceof InvalidEntityDataError) {
        throw new InvalidTickerDataError(
          error.message.replace('エンティティデータが無効です: ', '')
        );
      }
      throw error;
    }
  }

  /**
   * Ticker を DynamoDB Item にマッピング
   */
  protected mapToItem(
    ticker: Omit<Ticker, 'CreatedAt' | 'UpdatedAt'>
  ): Omit<DynamoDBItem, 'CreatedAt' | 'UpdatedAt'> {
    const keys = this.buildKeys({ tickerId: ticker.TickerID });
    return {
      ...keys,
      Type: this.config.entityType,
      GSI3PK: ticker.ExchangeID,
      GSI3SK: `TICKER#${ticker.TickerID}`,
      TickerID: ticker.TickerID,
      Symbol: ticker.Symbol,
      Name: ticker.Name,
      ExchangeID: ticker.ExchangeID,
    };
  }

  /**
   * 全ティッカー取得（オプショナルフィルタ）
   *
   * @param exchangeId - 取引所ID（指定時は該当取引所のティッカーのみ取得）
   * @returns ティッカー配列
   */
  public async getAll(exchangeId?: string): Promise<Ticker[]> {
    try {
      if (exchangeId) {
        // 取引所フィルタが指定されている場合はgetByExchangeを使用
        return await this.getByExchange(exchangeId);
      }

      // 全ティッカーを取得（Scan with filter）
      const result = await this.docClient.send(
        new ScanCommand({
          TableName: this.config.tableName,
          FilterExpression: '#type = :type',
          ExpressionAttributeNames: {
            '#type': 'Type',
          },
          ExpressionAttributeValues: {
            ':type': 'Ticker',
          },
        })
      );

      if (!result.Items || result.Items.length === 0) {
        return [];
      }

      return result.Items.map((item) => this.mapToEntity(item));
    } catch (error) {
      if (error instanceof InvalidTickerDataError) {
        throw error;
      }
      throw new Error(
        `データベースエラーが発生しました: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * ティッカーIDでティッカーを取得（基底クラスのシグネチャ）
   */
  public async getById(key: { tickerId: string }): Promise<Ticker | null>;
  /**
   * ティッカーIDでティッカーを取得（互換性のある文字列版）
   */
  public async getById(tickerId: string): Promise<Ticker>;
  /**
   * ティッカーIDでティッカーを取得の実装
   */
  public async getById(keyOrTickerId: { tickerId: string } | string): Promise<Ticker | null> {
    try {
      const tickerId = typeof keyOrTickerId === 'string' ? keyOrTickerId : keyOrTickerId.tickerId;
      const result = await super.getById({ tickerId });

      // 文字列が渡された場合はnullを返すのではなくエラーをスロー（後方互換性）
      if (!result && typeof keyOrTickerId === 'string') {
        throw new TickerNotFoundError(tickerId);
      }

      return result;
    } catch (error) {
      if (error instanceof TickerNotFoundError) {
        throw error;
      }
      if (error instanceof EntityNotFoundError) {
        const tickerId = typeof keyOrTickerId === 'string' ? keyOrTickerId : keyOrTickerId.tickerId;
        throw new TickerNotFoundError(tickerId);
      }
      if (error instanceof InvalidEntityDataError) {
        throw new InvalidTickerDataError(
          error.message.replace('エンティティデータが無効です: ', '')
        );
      }
      if (error instanceof DatabaseError) {
        // DatabaseErrorを元のDynamoDBエラーに変換
        const originalError = error.cause || error;
        const message =
          originalError instanceof Error ? originalError.message : String(originalError);
        throw new Error(`データベースエラーが発生しました: ${message}`);
      }
      // その他のエラーはデータベースエラーとしてラップ
      if (error instanceof Error) {
        throw new Error(`データベースエラーが発生しました: ${error.message}`);
      }
      throw new Error(`データベースエラーが発生しました: ${String(error)}`);
    }
  }

  /**
   * 取引所ごとのティッカー取得（GSI3使用）
   *
   * @param exchangeId - 取引所ID
   * @returns ティッカー配列
   */
  public async getByExchange(exchangeId: string): Promise<Ticker[]> {
    try {
      const result = await this.docClient.send(
        new QueryCommand({
          TableName: this.config.tableName,
          IndexName: 'ExchangeTickerIndex',
          KeyConditionExpression: 'GSI3PK = :exchangeId',
          ExpressionAttributeValues: {
            ':exchangeId': exchangeId,
          },
        })
      );

      if (!result.Items || result.Items.length === 0) {
        return [];
      }

      return result.Items.map((item) => this.mapToEntity(item));
    } catch (error) {
      if (error instanceof InvalidTickerDataError) {
        throw error;
      }
      throw new Error(
        `データベースエラーが発生しました: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * ティッカー作成（基底クラスのシグネチャ）
   */
  public async create(entity: Omit<Ticker, 'CreatedAt' | 'UpdatedAt'>): Promise<Ticker>;
  /**
   * ティッカー作成（互換性のある2パラメータ版）
   */
  public async create(
    ticker: Omit<Ticker, 'TickerID' | 'CreatedAt' | 'UpdatedAt'>,
    exchangeKey: string
  ): Promise<Ticker>;
  /**
   * ティッカー作成の実装
   */
  public async create(
    tickerOrEntity:
      | Omit<Ticker, 'TickerID' | 'CreatedAt' | 'UpdatedAt'>
      | Omit<Ticker, 'CreatedAt' | 'UpdatedAt'>,
    exchangeKey?: string
  ): Promise<Ticker> {
    let tickerId: string;
    let tickerWithId: Omit<Ticker, 'CreatedAt' | 'UpdatedAt'>;

    if ('TickerID' in tickerOrEntity) {
      // 基底クラスのシグネチャ（TickerID付き）
      tickerId = tickerOrEntity.TickerID;
      tickerWithId = tickerOrEntity;
    } else {
      // 互換性のあるシグネチャ（TickerID自動生成）
      if (!exchangeKey) {
        throw new Error('exchangeKey is required when TickerID is not provided');
      }
      // TickerID自動生成: {Exchange.Key}:{Symbol}
      tickerId = `${exchangeKey}:${tickerOrEntity.Symbol}`;
      tickerWithId = {
        ...tickerOrEntity,
        TickerID: tickerId,
      };
    }

    // 既存チェック
    try {
      await this.getById(tickerId);
      throw new TickerAlreadyExistsError(tickerId);
    } catch (error) {
      if (error instanceof TickerAlreadyExistsError) {
        throw error;
      }
      // TickerNotFoundError = OK（作成可能）
      if (!(error instanceof TickerNotFoundError)) {
        throw error;
      }
    }

    try {
      return await super.create(tickerWithId);
    } catch (error) {
      if (error instanceof EntityAlreadyExistsError) {
        throw new TickerAlreadyExistsError(tickerId);
      }
      if (error instanceof DatabaseError) {
        // DatabaseErrorを元のDynamoDBエラーに変換
        const originalError = error.cause || error;
        const message =
          originalError instanceof Error ? originalError.message : String(originalError);
        throw new Error(`データベースエラーが発生しました: ${message}`);
      }
      // エラーメッセージが既にラップされている場合はそのまま投げる
      if (error instanceof Error && error.message.startsWith('データベースエラーが発生しました:')) {
        throw error;
      }
      // その他のエラーはデータベースエラーとしてラップ
      if (error instanceof Error) {
        throw new Error(`データベースエラーが発生しました: ${error.message}`);
      }
      throw new Error(`データベースエラーが発生しました: ${String(error)}`);
    }
  }

  /**
   * ティッカー更新（基底クラスのシグネチャ）
   */
  public async update(key: { tickerId: string }, updates: Partial<Ticker>): Promise<Ticker>;
  /**
   * ティッカー更新（互換性のある2パラメータ版）
   */
  public async update(
    tickerId: string,
    updates: Partial<Pick<Ticker, 'Symbol' | 'Name'>>
  ): Promise<Ticker>;
  /**
   * ティッカー更新の実装
   */
  public async update(
    keyOrTickerId: { tickerId: string } | string,
    updates: Partial<Ticker> | Partial<Pick<Ticker, 'Symbol' | 'Name'>>
  ): Promise<Ticker> {
    try {
      const tickerId = typeof keyOrTickerId === 'string' ? keyOrTickerId : keyOrTickerId.tickerId;

      // 存在チェック
      await this.getById(tickerId);

      return await super.update({ tickerId }, updates);
    } catch (error) {
      if (error instanceof TickerNotFoundError) {
        throw error;
      }
      if (error instanceof EntityNotFoundError) {
        const tickerId = typeof keyOrTickerId === 'string' ? keyOrTickerId : keyOrTickerId.tickerId;
        throw new TickerNotFoundError(tickerId);
      }
      if (error instanceof InvalidEntityDataError) {
        throw new InvalidTickerDataError(
          error.message.replace('エンティティデータが無効です: ', '')
        );
      }
      if (error instanceof DatabaseError) {
        // DatabaseErrorを元のDynamoDBエラーに変換
        const originalError = error.cause || error;
        const message =
          originalError instanceof Error ? originalError.message : String(originalError);
        throw new Error(`データベースエラーが発生しました: ${message}`);
      }
      // エラーメッセージが既にラップされている場合はそのまま投げる
      if (error instanceof Error && error.message.startsWith('データベースエラーが発生しました:')) {
        throw error;
      }
      // その他のエラーはデータベースエラーとしてラップ
      if (error instanceof Error) {
        throw new Error(`データベースエラーが発生しました: ${error.message}`);
      }
      throw new Error(`データベースエラーが発生しました: ${String(error)}`);
    }
  }

  /**
   * ティッカー削除（基底クラスのシグネチャ）
   */
  public async delete(key: { tickerId: string }): Promise<void>;
  /**
   * ティッカー削除（互換性のある文字列版）
   */
  public async delete(tickerId: string): Promise<void>;
  /**
   * ティッカー削除の実装
   */
  public async delete(keyOrTickerId: { tickerId: string } | string): Promise<void> {
    try {
      const tickerId = typeof keyOrTickerId === 'string' ? keyOrTickerId : keyOrTickerId.tickerId;

      // 存在チェック
      await this.getById(tickerId);

      await super.delete({ tickerId });
    } catch (error) {
      if (error instanceof TickerNotFoundError) {
        throw error;
      }
      if (error instanceof EntityNotFoundError) {
        const tickerId = typeof keyOrTickerId === 'string' ? keyOrTickerId : keyOrTickerId.tickerId;
        throw new TickerNotFoundError(tickerId);
      }
      if (error instanceof DatabaseError) {
        // DatabaseErrorを元のDynamoDBエラーに変換
        const originalError = error.cause || error;
        const message =
          originalError instanceof Error ? originalError.message : String(originalError);
        throw new Error(`データベースエラーが発生しました: ${message}`);
      }
      // エラーメッセージが既にラップされている場合はそのまま投げる
      if (error instanceof Error && error.message.startsWith('データベースエラーが発生しました:')) {
        throw error;
      }
      // その他のエラーはデータベースエラーとしてラップ
      if (error instanceof Error) {
        throw new Error(`データベースエラーが発生しました: ${error.message}`);
      }
      throw new Error(`データベースエラーが発生しました: ${String(error)}`);
    }
  }
}
