/**
 * アカウント削除リポジトリインターフェース（退会・データ削除 / Issue #3579）。
 *
 * ADR-2.21 の要件に従い、ユーザー PK 配下の全アイテムをハード削除し、
 * SafetyEvent のみ匿名化して残す操作を提供する。
 *
 * @see docs/services/livetalk/architecture.md §2.21（ADR-2.21）
 */

import type { AccountDeletionResult } from '../entities/account-deletion.entity.js';

export interface AccountDeletionRepository {
  /**
   * `PK = USER#<userId>` 配下の全アイテムを削除する。
   *
   * - SafetyEvent（SK が `SAFETY#` で始まる）は削除せず匿名化して残す。
   * - 途中で失敗しても再実行で収束する（冪等）。
   *
   * @param userId - Google ID（`USER#` プレフィックスなし）
   * @returns 削除件数・匿名化件数の集計結果
   * @throws DatabaseError DynamoDB 操作が失敗した場合
   */
  deleteAccount(userId: string): Promise<AccountDeletionResult>;
}
