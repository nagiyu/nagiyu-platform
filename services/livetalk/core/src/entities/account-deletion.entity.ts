/**
 * アカウント削除結果型（退会・データ削除 / Issue #3579）。
 *
 * ADR-2.21 に従い、`PK = USER#<googleId>` 配下の全アイテムを削除するが、
 * SafetyEvent（SK が `SAFETY#` で始まる）のみは匿名化して残す。
 *
 * @see docs/services/livetalk/architecture.md §2.21（ADR-2.21）
 */

export interface AccountDeletionResult {
  /** 削除したアイテム数（SafetyEvent を除く全種別） */
  deletedCount: number;
  /** 匿名化した SafetyEvent の件数 */
  anonymizedCount: number;
}
