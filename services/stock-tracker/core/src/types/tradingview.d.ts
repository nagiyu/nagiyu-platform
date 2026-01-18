/**
 * Type declarations for @mathieuc/tradingview
 *
 * TradingView API ライブラリの型定義
 * 公式の型定義が存在しないため、必要最小限の型定義を提供
 */

declare module '@mathieuc/tradingview' {
  /**
   * チャートの期間データ
   */
  export interface Period {
    /** 終値 */
    close: number;
    /** 始値 */
    open?: number;
    /** 高値 */
    high?: number;
    /** 安値 */
    low?: number;
    /** 出来高 */
    volume?: number;
    /** タイムスタンプ */
    time?: number;
  }

  /**
   * チャートの設定オプション
   */
  export interface ChartOptions {
    /** 時間枠（例: '1', '5', '60', 'D'） */
    timeframe: string;
    /** セッションタイプ（'regular' または 'extended'） */
    session?: 'regular' | 'extended';
  }

  /**
   * チャートインスタンス
   */
  export class Chart {
    /** チャートの期間データ */
    periods: Period[];

    /**
     * マーケットを設定
     * @param market - マーケット識別子（例: "NASDAQ:AAPL"）
     * @param options - チャート設定オプション
     */
    setMarket(market: string, options: ChartOptions): void;

    /**
     * データ更新時のコールバックを登録
     * @param callback - データ更新時に呼び出される関数
     */
    onUpdate(callback: () => void): void;

    /**
     * エラー発生時のコールバックを登録
     * @param callback - エラー発生時に呼び出される関数
     */
    onError(callback: (error: Error) => void): void;

    /**
     * チャートインスタンスを削除
     */
    delete(): void;
  }

  /**
   * セッション管理クラス
   */
  export class Session {
    /** チャートコンストラクタ */
    Chart: new () => Chart;
  }

  /**
   * TradingView クライアント
   */
  export class Client {
    /** セッション管理インスタンス */
    Session: Session;

    /**
     * クライアント接続を終了
     */
    end(): void;
  }
}
