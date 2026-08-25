/**
 * Stock Tracker Core - Ticker Repository Interface
 *
 * ティッカーデータの CRUD 操作インターフェース
 */

import type {
  TickerEntity,
  CreateTickerInput,
  UpdateTickerInput,
} from '../entities/ticker.entity.js';
import type { PaginationOptions, PaginatedResult } from '@nagiyu/aws';

/**
 * Ticker Repository インターフェース
 *
 * DynamoDB実装とInMemory実装が共通で実装するインターフェース
 */
export interface TickerRepository {
  /**
   * ティッカーIDで単一のティッカーを取得
   *
   * @param tickerId - ティッカーID
   * @returns ティッカー（存在しない場合はnull）
   */
  getById(tickerId: string): Promise<TickerEntity | null>;

  /**
   * 取引所ごとのティッカー一覧を取得
   *
   * 返却順序は TickerID の昇順を契約とする。
   * limit省略時は既定件数で打ち切られる（後続はページネーションで辿る前提。
   * 全件が必要な場合は呼び出し側でcursorを使って走査すること）。
   *
   * @param exchangeId - 取引所ID
   * @param options - ページネーションオプション
   * @returns ページネーション結果（TickerID昇順）
   */
  getByExchange(
    exchangeId: string,
    options?: PaginationOptions
  ): Promise<PaginatedResult<TickerEntity>>;

  /**
   * 全ティッカー取得
   *
   * 返却順序は保証しない（`getByExchange` のTickerID昇順とは異なる）。呼び出し側は
   * 順序に依存しないこと。
   *
   * `options` を省略した場合（`limit`/`cursor` とも未指定）は全件を1回の呼び出しで返し、
   * `nextCursor` は必ず `undefined` になる。`limit` を指定した場合は通常のページネーション
   * （残りがあれば `nextCursor` を返す）になる。
   *
   * @param options - ページネーションオプション
   * @returns ページネーション結果（順序不定）
   */
  getAll(options?: PaginationOptions): Promise<PaginatedResult<TickerEntity>>;

  /**
   * 新しいティッカーを作成
   *
   * @param input - ティッカーデータ
   * @returns 作成されたティッカー（CreatedAt, UpdatedAtを含む）
   * @throws {EntityAlreadyExistsError} 既に同じTickerIDのティッカーが存在する場合
   */
  create(input: CreateTickerInput): Promise<TickerEntity>;

  /**
   * ティッカーを更新
   *
   * @param tickerId - ティッカーID
   * @param updates - 更新するフィールド
   * @returns 更新されたティッカー
   * @throws {EntityNotFoundError} ティッカーが存在しない場合
   */
  update(tickerId: string, updates: UpdateTickerInput): Promise<TickerEntity>;

  /**
   * ティッカーを削除
   *
   * @param tickerId - ティッカーID
   * @throws {EntityNotFoundError} ティッカーが存在しない場合
   */
  delete(tickerId: string): Promise<void>;
}
