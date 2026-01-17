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

import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
  QueryCommand,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb';
import type { Ticker, DynamoDBItem } from '../types.js';

/**
 * エラーメッセージ定数
 */
const ERROR_MESSAGES = {
  TICKER_NOT_FOUND: 'ティッカーが見つかりません',
  TICKER_ALREADY_EXISTS: 'ティッカーは既に存在します',
  INVALID_TICKER_ID: 'ティッカーIDが不正です',
  INVALID_EXCHANGE_ID: '取引所IDが不正です',
  INVALID_SYMBOL: 'シンボルが不正です',
  INVALID_NAME: '銘柄名が不正です',
  EXCHANGE_NOT_FOUND: '取引所が見つかりません',
  DATABASE_ERROR: 'データベースエラーが発生しました',
} as const;

/**
 * カスタムエラークラス
 */
export class TickerNotFoundError extends Error {
  constructor(tickerId: string) {
    super(`${ERROR_MESSAGES.TICKER_NOT_FOUND}: ${tickerId}`);
    this.name = 'TickerNotFoundError';
  }
}

export class TickerAlreadyExistsError extends Error {
  constructor(tickerId: string) {
    super(`${ERROR_MESSAGES.TICKER_ALREADY_EXISTS}: ${tickerId}`);
    this.name = 'TickerAlreadyExistsError';
  }
}

export class InvalidTickerDataError extends Error {
  constructor(message: string) {
    super(`${ERROR_MESSAGES.INVALID_TICKER_ID}: ${message}`);
    this.name = 'InvalidTickerDataError';
  }
}

/**
 * Ticker リポジトリ
 */
export class TickerRepository {
  private readonly docClient: DynamoDBDocumentClient;
  private readonly tableName: string;

  constructor(docClient: DynamoDBDocumentClient, tableName: string) {
    this.docClient = docClient;
    this.tableName = tableName;
  }

  /**
   * 全ティッカー取得（オプショナルフィルタ）
   *
   * @param exchangeId - 取引所ID（指定時は該当取引所のティッカーのみ取得）
   * @returns ティッカー配列
   */
  async getAll(exchangeId?: string): Promise<Ticker[]> {
    try {
      if (exchangeId) {
        // 取引所フィルタが指定されている場合はgetByExchangeを使用
        return await this.getByExchange(exchangeId);
      }

      // 全ティッカーを取得（Scan with filter）
      const result = await this.docClient.send(
        new ScanCommand({
          TableName: this.tableName,
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

      return result.Items.map((item) => this.mapDynamoDBItemToTicker(item));
    } catch (error) {
      throw new Error(
        `${ERROR_MESSAGES.DATABASE_ERROR}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * ティッカーIDでティッカーを取得
   *
   * @param tickerId - ティッカーID（例: NSDQ:AAPL）
   * @returns ティッカー
   * @throws TickerNotFoundError - ティッカーが見つからない場合
   */
  async getById(tickerId: string): Promise<Ticker> {
    try {
      const result = await this.docClient.send(
        new GetCommand({
          TableName: this.tableName,
          Key: {
            PK: `TICKER#${tickerId}`,
            SK: 'METADATA',
          },
        })
      );

      if (!result.Item) {
        throw new TickerNotFoundError(tickerId);
      }

      return this.mapDynamoDBItemToTicker(result.Item);
    } catch (error) {
      if (error instanceof TickerNotFoundError) {
        throw error;
      }
      throw new Error(
        `${ERROR_MESSAGES.DATABASE_ERROR}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * 取引所ごとのティッカー取得（GSI3使用）
   *
   * @param exchangeId - 取引所ID
   * @returns ティッカー配列
   */
  async getByExchange(exchangeId: string): Promise<Ticker[]> {
    try {
      const result = await this.docClient.send(
        new QueryCommand({
          TableName: this.tableName,
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

      return result.Items.map((item) => this.mapDynamoDBItemToTicker(item));
    } catch (error) {
      throw new Error(
        `${ERROR_MESSAGES.DATABASE_ERROR}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * ティッカー作成
   *
   * TickerIDは {Exchange.Key}:{Symbol} 形式で自動生成される
   *
   * @param ticker - 作成するティッカー（TickerIDは不要、自動生成される）
   * @param exchangeKey - 取引所のKey（TradingView API用）
   * @returns 作成されたティッカー（TickerID付き）
   * @throws TickerAlreadyExistsError - ティッカーが既に存在する場合
   */
  async create(
    ticker: Omit<Ticker, 'TickerID' | 'CreatedAt' | 'UpdatedAt'>,
    exchangeKey: string
  ): Promise<Ticker> {
    // TickerID自動生成: {Exchange.Key}:{Symbol}
    const tickerId = `${exchangeKey}:${ticker.Symbol}`;

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

    const now = Date.now();
    const newTicker: Ticker = {
      ...ticker,
      TickerID: tickerId,
      CreatedAt: now,
      UpdatedAt: now,
    };

    try {
      await this.docClient.send(
        new PutCommand({
          TableName: this.tableName,
          Item: this.mapTickerToDynamoDBItem(newTicker),
        })
      );

      return newTicker;
    } catch (error) {
      throw new Error(
        `${ERROR_MESSAGES.DATABASE_ERROR}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * ティッカー更新
   *
   * @param tickerId - ティッカーID
   * @param updates - 更新内容（Symbol, Name のみ更新可能）
   * @returns 更新後のティッカー
   * @throws TickerNotFoundError - ティッカーが見つからない場合
   */
  async update(
    tickerId: string,
    updates: Partial<Pick<Ticker, 'Symbol' | 'Name'>>
  ): Promise<Ticker> {
    // 存在チェック
    await this.getById(tickerId);

    const now = Date.now();

    try {
      // 更新可能なフィールドを動的に構築
      const updateExpressions: string[] = [];
      const expressionAttributeNames: Record<string, string> = {};
      const expressionAttributeValues: Record<string, unknown> = {};

      if (updates.Symbol !== undefined) {
        updateExpressions.push('#symbol = :symbol');
        expressionAttributeNames['#symbol'] = 'Symbol';
        expressionAttributeValues[':symbol'] = updates.Symbol;
      }

      if (updates.Name !== undefined) {
        updateExpressions.push('#name = :name');
        expressionAttributeNames['#name'] = 'Name';
        expressionAttributeValues[':name'] = updates.Name;
      }

      // UpdatedAt は常に更新
      updateExpressions.push('#updatedAt = :updatedAt');
      expressionAttributeNames['#updatedAt'] = 'UpdatedAt';
      expressionAttributeValues[':updatedAt'] = now;

      await this.docClient.send(
        new UpdateCommand({
          TableName: this.tableName,
          Key: {
            PK: `TICKER#${tickerId}`,
            SK: 'METADATA',
          },
          UpdateExpression: `SET ${updateExpressions.join(', ')}`,
          ExpressionAttributeNames: expressionAttributeNames,
          ExpressionAttributeValues: expressionAttributeValues,
        })
      );

      // 更新後のティッカーを取得して返す
      return await this.getById(tickerId);
    } catch (error) {
      if (error instanceof TickerNotFoundError) {
        throw error;
      }
      throw new Error(
        `${ERROR_MESSAGES.DATABASE_ERROR}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * ティッカー削除
   *
   * @param tickerId - ティッカーID
   * @throws TickerNotFoundError - ティッカーが見つからない場合
   */
  async delete(tickerId: string): Promise<void> {
    // 存在チェック
    await this.getById(tickerId);

    try {
      await this.docClient.send(
        new DeleteCommand({
          TableName: this.tableName,
          Key: {
            PK: `TICKER#${tickerId}`,
            SK: 'METADATA',
          },
        })
      );
    } catch (error) {
      throw new Error(
        `${ERROR_MESSAGES.DATABASE_ERROR}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * DynamoDB Item を Ticker にマッピング
   */
  private mapDynamoDBItemToTicker(item: Record<string, unknown>): Ticker {
    // DynamoDBアイテムからTickerフィールドのみを抽出
    const ticker: Ticker = {
      TickerID: item.TickerID as string,
      Symbol: item.Symbol as string,
      Name: item.Name as string,
      ExchangeID: item.ExchangeID as string,
      CreatedAt: item.CreatedAt as number,
      UpdatedAt: item.UpdatedAt as number,
    };
    return ticker;
  }

  /**
   * Ticker を DynamoDB Item にマッピング
   */
  private mapTickerToDynamoDBItem(ticker: Ticker): DynamoDBItem & Ticker {
    // DynamoDBキーとメタデータを追加
    const dynamoDBItem: DynamoDBItem & Ticker = {
      PK: `TICKER#${ticker.TickerID}`,
      SK: 'METADATA',
      Type: 'Ticker',
      GSI3PK: ticker.ExchangeID,
      GSI3SK: `TICKER#${ticker.TickerID}`,
      ...ticker,
    };
    return dynamoDBItem;
  }
}
