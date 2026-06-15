/**
 * dev-sync バッチ共通型定義
 */

import { z } from 'zod';

/**
 * コピー戦略の種別
 *
 * - mirror: PK/SK プレフィックスで prod を全件スキャン → dev に upsert
 * - gsiWindow: 指定 GSI を直近 N 日でクエリ → dev に upsert（削除しない）
 */
export type CopyStrategy = 'mirror' | 'gsiWindow';

/**
 * 差分削除の設定
 *
 * - on: prod に存在しない dev item を削除する（mirror 戦略で使用）
 * - off: 削除しない（gsiWindow 戦略では常に off）
 */
export type DeleteMode = 'on' | 'off';

/**
 * GSI ウィンドウ設定（gsiWindow 戦略で使用）
 */
export const GsiWindowConfigSchema = z.object({
  /** GSI 名（例: "GSI1", "CreatedAtIndex"） */
  indexName: z.string().min(1),
  /** GSI パーティションキーの属性名 */
  pkAttributeName: z.string().min(1),
  /** GSI パーティションキーの値 */
  pkValue: z.string().min(1),
  /** GSI ソートキーの属性名（日時を表す属性、ISO 8601 文字列） */
  skAttributeName: z.string().min(1),
  /** 直近何日分をコピーするか */
  windowDays: z.number().int().positive(),
});

export type GsiWindowConfig = z.infer<typeof GsiWindowConfigSchema>;

/**
 * mirror 戦略のスコープ設定
 */
export const MirrorScopeSchema = z.object({
  /** PK プレフィックス（例: "USER#"）。空文字列の場合は全件スキャン */
  pkPrefix: z.string(),
  /** SK プレフィックス（オプション）。指定した場合、そのプレフィックスで絞る */
  skPrefix: z.string().optional(),
});

export type MirrorScope = z.infer<typeof MirrorScopeSchema>;

/**
 * ジョブ設定スキーマ
 *
 * EventBridge Scheduler から Lambda の input として渡される設定。
 *
 * @example mirror 戦略（差分削除あり）
 * {
 *   "sourceTable": "nagiyu-stock-tracker-main-prod",
 *   "destTable": "nagiyu-stock-tracker-main-dev",
 *   "strategy": "mirror",
 *   "scope": { "pkPrefix": "USER#" },
 *   "delete": "on"
 * }
 *
 * @example gsiWindow 戦略（直近 7 日）
 * {
 *   "sourceTable": "nagiyu-stock-tracker-main-prod",
 *   "destTable": "nagiyu-stock-tracker-main-dev",
 *   "strategy": "gsiWindow",
 *   "delete": "off",
 *   "gsi": {
 *     "indexName": "GSI1",
 *     "pkAttributeName": "GSI1PK",
 *     "pkValue": "ALERT",
 *     "skAttributeName": "GSI1SK",
 *     "windowDays": 7
 *   }
 * }
 */
export const JobConfigSchema = z.object({
  /** コピー元 DynamoDB テーブル名（prod テーブル） */
  sourceTable: z.string().min(1),
  /**
   * コピー先 DynamoDB テーブル名（dev テーブル）
   * 必ず "-dev" で終わる必要がある（安全ガード）
   */
  destTable: z.string().min(1),
  /** コピー戦略 */
  strategy: z.enum(['mirror', 'gsiWindow']),
  /**
   * mirror 戦略のスコープ設定
   * strategy="mirror" の場合に使用（省略時は全件スキャン）
   */
  scope: MirrorScopeSchema.optional(),
  /**
   * 差分削除モード
   * - "on": prod に存在しない dev item を削除（mirror 戦略向け）
   * - "off": 削除しない
   */
  delete: z.enum(['on', 'off']),
  /**
   * GSI ウィンドウ設定
   * strategy="gsiWindow" の場合に必須
   */
  gsi: GsiWindowConfigSchema.optional(),
});

export type JobConfig = z.infer<typeof JobConfigSchema>;

/**
 * コピー実行の結果サマリー
 */
export interface CopyResult {
  /** upsert（コピー）したアイテム数 */
  upserted: number;
  /** 削除したアイテム数（delete=off の場合は 0） */
  deleted: number;
  /** スキャン/クエリしたソースのアイテム数 */
  scanned: number;
}
