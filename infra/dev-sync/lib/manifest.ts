/**
 * dev-sync ジョブマニフェスト
 *
 * prod → dev コピーするテーブルとジョブ設定を宣言的に登録する。
 * Phase A はエントリ空配列。Phase B/C でサービスごとに登録していく。
 *
 * ## エントリの追加方法
 *
 * MANIFEST に以下の形式でオブジェクトを追加する。
 *
 * ### mirror 戦略（PK/SK プレフィックスで全件コピー＋差分削除）
 *
 * ```ts
 * {
 *   sourceTable: 'nagiyu-stock-tracker-main-prod',
 *   destTable: 'nagiyu-stock-tracker-main-dev',
 *   strategy: 'mirror',
 *   scope: { pkPrefix: 'USER#' },
 *   delete: 'on',
 *   schedule: 'rate(1 day)',
 * },
 * ```
 *
 * ### gsiWindow 戦略（GSI の直近 N 日分をコピー、削除なし）
 *
 * ```ts
 * {
 *   sourceTable: 'nagiyu-stock-tracker-main-prod',
 *   destTable: 'nagiyu-stock-tracker-main-dev',
 *   strategy: 'gsiWindow',
 *   delete: 'off',
 *   gsi: {
 *     indexName: 'GSI1',
 *     pkAttributeName: 'GSI1PK',
 *     pkValue: 'ALERT',
 *     skAttributeName: 'GSI1SK',
 *     windowDays: 7,
 *   },
 *   schedule: 'rate(6 hours)',
 * },
 * ```
 */

/**
 * mirror 戦略のスコープ設定
 */
export interface MirrorScope {
  /** PK プレフィックス（例: "USER#"）。省略時は全件スキャン */
  pkPrefix?: string;
  /** SK プレフィックス（オプション） */
  skPrefix?: string;
}

/**
 * GSI ウィンドウ設定（gsiWindow 戦略で使用）
 */
export interface GsiWindowConfig {
  /** GSI 名（例: "GSI1"） */
  indexName: string;
  /** GSI パーティションキーの属性名 */
  pkAttributeName: string;
  /** GSI パーティションキーの値 */
  pkValue: string;
  /** GSI ソートキーの属性名（ISO 8601 日時文字列を保持する属性） */
  skAttributeName: string;
  /** 直近何日分をコピーするか */
  windowDays: number;
}

/**
 * マニフェストエントリの型
 */
export interface ManifestEntry {
  /** コピー元テーブル名（prod テーブル） */
  sourceTable: string;
  /**
   * コピー先テーブル名（dev テーブル）
   * 必ず "-dev" で終わる必要がある
   */
  destTable: string;
  /** コピー戦略 */
  strategy: 'mirror' | 'gsiWindow';
  /**
   * mirror 戦略のスコープ設定（strategy="mirror" で使用）
   * 省略時は全件スキャン
   */
  scope?: MirrorScope;
  /**
   * 差分削除モード
   * - "on": prod に存在しない dev item を削除（mirror 向け）
   * - "off": 削除しない
   */
  delete: 'on' | 'off';
  /**
   * GSI ウィンドウ設定（strategy="gsiWindow" で使用）
   */
  gsi?: GsiWindowConfig;
  /**
   * EventBridge Scheduler のスケジュール式
   * 例: "rate(1 day)", "rate(6 hours)", "cron(0 2 * * ? *)"
   */
  schedule: string;
}

/**
 * dev-sync ジョブマニフェスト
 *
 * Phase A: 空配列（機構のみ）
 * Phase B/C: 各サービスのエントリをここに追加する
 */
export const MANIFEST: ManifestEntry[] = [];
