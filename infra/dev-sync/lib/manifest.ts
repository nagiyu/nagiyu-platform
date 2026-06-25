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
  /**
   * GSI ソートキーの属性名
   *
   * ソートキーの値形式は skPrefix・dateGranularity の組み合わせで決まる。
   * 例: ISO 8601 日時文字列（既定）、`DATE#{YYYY-MM-DD}#{tickerId}` 形式（skPrefix='DATE#'・dateGranularity='date'）
   */
  skAttributeName: string;
  /** 直近何日分をコピーするか */
  windowDays: number;
  /**
   * ソートキー下限の先頭に付与する固定プレフィックス（省略時は付与なし）
   *
   * 例: `'DATE#'` → ウィンドウ下限が `DATE#2026-06-06` 形式になる
   */
  skPrefix?: string;
  /**
   * ウィンドウ下限日付の整形粒度（省略時は 'datetime'）
   *
   * - `'datetime'`: ISO 8601 日時形式 `YYYY-MM-DDTHH:mm:ss.sssZ`（既定・後方互換）
   * - `'date'`: 日付のみ `YYYY-MM-DD`
   */
  dateGranularity?: 'date' | 'datetime';
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
export const MANIFEST: ManifestEntry[] = [
  // Phase B: Niconico 楽曲（VideoBasicInfo）の prod→dev ミラー。
  // PK=VIDEO# で始まるアイテムのみを対象とし、USER# 系（UserVideoSetting/BatchJob）は対象外。
  {
    sourceTable: 'nagiyu-niconico-mylist-assistant-dynamodb-prod',
    destTable: 'nagiyu-niconico-mylist-assistant-dynamodb-dev',
    strategy: 'mirror',
    scope: { pkPrefix: 'VIDEO#' },
    delete: 'on',
    schedule: 'rate(1 day)',
  },

  // ─────────────────────────────────────────
  // Phase C: StockTracer（単一テーブル設計: nagiyu-stock-tracker-main-prod）
  //
  // 共有マスタ（Exchange / Ticker）は全件 mirror する。
  // DailySummary は GSI（ExchangeSummaryIndex）を使い取引所単位・直近 14 日分を gsiWindow でコピーする。
  // USER# プレフィックスのアイテム（Holding / Alert）は対象外（EXCHANGE#/TICKER# と衝突しない）。
  // ─────────────────────────────────────────

  // Exchange（共有マスタ）: PK=EXCHANGE#{id}。取引所情報は全件 mirror する。
  // 削除された取引所も dev 側に伝播させるため delete=on。
  {
    sourceTable: 'nagiyu-stock-tracker-main-prod',
    destTable: 'nagiyu-stock-tracker-main-dev',
    strategy: 'mirror',
    scope: { pkPrefix: 'EXCHANGE#' },
    delete: 'on',
    schedule: 'rate(1 day)',
  },

  // Ticker（共有マスタ）: PK=TICKER#{id}。銘柄情報は全件 mirror する。
  // 削除された銘柄も dev 側に伝播させるため delete=on。
  {
    sourceTable: 'nagiyu-stock-tracker-main-prod',
    destTable: 'nagiyu-stock-tracker-main-dev',
    strategy: 'mirror',
    scope: { pkPrefix: 'TICKER#' },
    delete: 'on',
    schedule: 'rate(1 day)',
  },

  // DailySummary（取引所別 gsiWindow・直近 14 日増分）
  // PK=SUMMARY#{ticker} / SK=DATE#{date}。GSI=ExchangeSummaryIndex（GSI4PK=ExchangeID, GSI4SK=DATE#{YYYY-MM-DD}#{ticker}）
  // 取引所単位でしか GSI の PK を絞り込めないため、取引所を追加した際はこの 4 エントリにも追記が必要。
  // delete=off: 過去データの削除は行わず増分コピーのみ。
  {
    sourceTable: 'nagiyu-stock-tracker-main-prod',
    destTable: 'nagiyu-stock-tracker-main-dev',
    strategy: 'gsiWindow',
    delete: 'off',
    gsi: {
      indexName: 'ExchangeSummaryIndex',
      pkAttributeName: 'GSI4PK',
      pkValue: 'NYSE',
      skAttributeName: 'GSI4SK',
      skPrefix: 'DATE#',
      dateGranularity: 'date',
      windowDays: 14,
    },
    schedule: 'rate(1 day)',
  },
  {
    sourceTable: 'nagiyu-stock-tracker-main-prod',
    destTable: 'nagiyu-stock-tracker-main-dev',
    strategy: 'gsiWindow',
    delete: 'off',
    gsi: {
      indexName: 'ExchangeSummaryIndex',
      pkAttributeName: 'GSI4PK',
      pkValue: 'NASDAQ',
      skAttributeName: 'GSI4SK',
      skPrefix: 'DATE#',
      dateGranularity: 'date',
      windowDays: 14,
    },
    schedule: 'rate(1 day)',
  },
  {
    sourceTable: 'nagiyu-stock-tracker-main-prod',
    destTable: 'nagiyu-stock-tracker-main-dev',
    strategy: 'gsiWindow',
    delete: 'off',
    gsi: {
      indexName: 'ExchangeSummaryIndex',
      pkAttributeName: 'GSI4PK',
      pkValue: 'AMEX',
      skAttributeName: 'GSI4SK',
      skPrefix: 'DATE#',
      dateGranularity: 'date',
      windowDays: 14,
    },
    schedule: 'rate(1 day)',
  },
  {
    sourceTable: 'nagiyu-stock-tracker-main-prod',
    destTable: 'nagiyu-stock-tracker-main-dev',
    strategy: 'gsiWindow',
    delete: 'off',
    gsi: {
      indexName: 'ExchangeSummaryIndex',
      pkAttributeName: 'GSI4PK',
      pkValue: 'TSE',
      skAttributeName: 'GSI4SK',
      skPrefix: 'DATE#',
      dateGranularity: 'date',
      windowDays: 14,
    },
    schedule: 'rate(1 day)',
  },
];
