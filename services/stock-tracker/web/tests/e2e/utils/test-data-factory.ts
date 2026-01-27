import { APIRequestContext } from '@playwright/test';

// ============================================================================
// 入力型定義（作成時のオプション）
// ============================================================================

/**
 * Exchange 作成オプション
 * 全てオプショナル。指定しない場合はデフォルト値が使用される。
 */
export interface CreateExchangeOptions {
  exchangeId?: string;
  name?: string;
  key?: string;
  timezone?: string;
  tradingHours?: {
    start?: string;
    end?: string;
  };
}

/**
 * Ticker 作成オプション
 * exchangeId を省略すると、新しい Exchange が自動作成される。
 */
export interface CreateTickerOptions {
  symbol?: string;
  name?: string;
  exchangeId?: string;
}

/**
 * Holding 作成オプション
 * tickerId を省略すると、新しい Ticker（と Exchange）が自動作成される。
 */
export interface CreateHoldingOptions {
  tickerId?: string;
  quantity?: number;
  averagePrice?: number;
  currency?: string;
}

/**
 * Watchlist 作成オプション
 * tickerId を省略すると、新しい Ticker（と Exchange）が自動作成される。
 */
export interface CreateWatchlistOptions {
  tickerId?: string;
}

/**
 * Alert 作成オプション
 * tickerId を省略すると、新しい Ticker（と Exchange）が自動作成される。
 */
export interface CreateAlertOptions {
  tickerId?: string;
  mode?: 'Buy' | 'Sell';
  frequency?: 'MINUTE_LEVEL' | 'HOURLY_LEVEL';
  enabled?: boolean;
  conditions?: Array<{
    field?: 'price';
    operator?: 'gte' | 'lte';
    value?: number;
  }>;
  subscription?: {
    endpoint?: string;
    keys?: {
      p256dh?: string;
      auth?: string;
    };
  };
}

// ============================================================================
// 出力型定義（作成結果）
// ============================================================================

/**
 * 作成された Exchange
 */
export interface CreatedExchange {
  exchangeId: string;
  name: string;
  key: string;
  timezone: string;
  tradingHours: {
    start: string;
    end: string;
  };
}

/**
 * 作成された Ticker（関連 Exchange を含む）
 */
export interface CreatedTicker {
  tickerId: string;
  symbol: string;
  name: string;
  exchangeId: string;
  exchange: CreatedExchange;
}

/**
 * 作成された Holding（関連エンティティを含む）
 */
export interface CreatedHolding {
  holdingId: string;
  tickerId: string;
  quantity: number;
  averagePrice: number;
  currency: string;
  ticker: CreatedTicker;
}

/**
 * 作成された Watchlist（関連エンティティを含む）
 */
export interface CreatedWatchlist {
  watchlistId: string;
  tickerId: string;
  ticker: CreatedTicker;
}

/**
 * 作成された Alert（関連エンティティを含む）
 */
export interface CreatedAlert {
  alertId: string;
  tickerId: string;
  mode: 'Buy' | 'Sell';
  frequency: 'MINUTE_LEVEL' | 'HOURLY_LEVEL';
  enabled: boolean;
  conditions: Array<{
    field: 'price';
    operator: 'gte' | 'lte';
    value: number;
  }>;
  ticker: CreatedTicker;
}

// ============================================================================
// 内部追跡用型定義
// ============================================================================

interface TrackedData {
  exchanges: Map<string, CreatedExchange>;
  tickers: Map<string, CreatedTicker>;
  holdings: Map<string, CreatedHolding>;
  watchlists: Map<string, CreatedWatchlist>;
  alerts: Map<string, CreatedAlert>;
}

// ============================================================================
// TestDataFactory クラス
// ============================================================================

/**
 * E2E テスト用テストデータファクトリ
 *
 * 使用例:
 * ```typescript
 * test.describe('Holding Management', () => {
 *   let factory: TestDataFactory;
 *
 *   test.beforeEach(async ({ request }) => {
 *     factory = new TestDataFactory(request);
 *   });
 *
 *   test.afterEach(async () => {
 *     await factory.cleanup();
 *   });
 *
 *   test('can create holding', async ({ page }) => {
 *     const holding = await factory.createHolding({
 *       quantity: 100,
 *       averagePrice: 150.0,
 *     });
 *     // holding.ticker.tickerId, holding.ticker.exchange.exchangeId も使用可能
 *   });
 * });
 * ```
 */
export class TestDataFactory {
  private readonly request: APIRequestContext;
  private readonly trackedData: TrackedData;
  private readonly testPrefix: string;
  private readonly testUserId: string;

  /**
   * @param request - Playwright の APIRequestContext
   * @param prefix - テストデータの接頭辞（デフォルト: 'E2E'）
   */
  constructor(request: APIRequestContext, prefix: string = 'E2E') {
    this.request = request;
    this.testPrefix = prefix;
    // SKIP_AUTH_CHECK=true の環境で使用される固定のユーザーID
    // lib/auth.ts の getSession() 参照
    this.testUserId = 'test-user-id';
    this.trackedData = {
      exchanges: new Map(),
      tickers: new Map(),
      holdings: new Map(),
      watchlists: new Map(),
      alerts: new Map(),
    };
  }

  // ==========================================================================
  // ユニークID生成
  // ==========================================================================

  /**
   * ユニークな識別子を生成
   * 形式: {prefix}-{timestamp}-{random}-{suffix}
   */
  private generateUniqueId(suffix: string = ''): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 6);
    return suffix
      ? `${this.testPrefix}-${timestamp}-${random}-${suffix}`
      : `${this.testPrefix}-${timestamp}-${random}`;
  }

  /**
   * Exchange Key 用のユニーク識別子を生成
   * 形式: {prefix}{random} (英大文字のみ、最大10文字)
   */
  private generateUniqueKey(): string {
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `${this.testPrefix.substring(0, 3)}${random}`.substring(0, 10);
  }

  /**
   * Symbol 用のユニーク識別子を生成
   * 形式: T{random} (英大文字のみ、最大10文字)
   */
  private generateUniqueSymbol(): string {
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `T${random}`.substring(0, 10);
  }

  // ==========================================================================
  // 作成メソッド
  // ==========================================================================

  /**
   * Exchange を作成
   *
   * @param options - 作成オプション（全てオプショナル）
   * @returns 作成された Exchange
   */
  public async createExchange(options: CreateExchangeOptions = {}): Promise<CreatedExchange> {
    const exchangeId = options.exchangeId || this.generateUniqueId('EX');
    const key = options.key || this.generateUniqueKey();

    const exchangeData = {
      exchangeId,
      name: options.name || `Test Exchange ${exchangeId}`,
      key,
      timezone: options.timezone || 'America/New_York',
      tradingHours: {
        start: options.tradingHours?.start || '09:30',
        end: options.tradingHours?.end || '16:00',
      },
    };

    const response = await this.request.post('/api/exchanges', {
      data: exchangeData,
    });

    if (!response.ok()) {
      const errorData = await response.json().catch(() => ({}));
      if (!errorData.message?.includes('既に存在します')) {
        throw new Error(`Failed to create exchange: ${JSON.stringify(errorData)}`);
      }
    }

    const createdExchange: CreatedExchange = {
      exchangeId: exchangeData.exchangeId,
      name: exchangeData.name,
      key: exchangeData.key,
      timezone: exchangeData.timezone,
      tradingHours: exchangeData.tradingHours,
    };

    this.trackedData.exchanges.set(exchangeId, createdExchange);

    return createdExchange;
  }

  /**
   * Ticker を作成
   * exchangeId を省略すると、新しい Exchange が自動作成される。
   *
   * @param options - 作成オプション
   * @returns 作成された Ticker（関連 Exchange を含む）
   */
  public async createTicker(options: CreateTickerOptions = {}): Promise<CreatedTicker> {
    let exchange: CreatedExchange;
    if (options.exchangeId) {
      const existing = this.trackedData.exchanges.get(options.exchangeId);
      if (existing) {
        exchange = existing;
      } else {
        exchange = await this.createExchange({ exchangeId: options.exchangeId });
      }
    } else {
      exchange = await this.createExchange();
    }

    const symbol = options.symbol || this.generateUniqueSymbol();
    const expectedTickerId = `${exchange.key}:${symbol}`;

    const tickerData = {
      symbol,
      name: options.name || `Test Ticker ${symbol}`,
      exchangeId: exchange.exchangeId,
    };

    const response = await this.request.post('/api/tickers', {
      data: tickerData,
    });

    if (!response.ok()) {
      const errorData = await response.json().catch(() => ({}));
      if (!errorData.message?.includes('既に存在します')) {
        throw new Error(`Failed to create ticker: ${JSON.stringify(errorData)}`);
      }
    }

    const createdTicker: CreatedTicker = {
      tickerId: expectedTickerId,
      symbol,
      name: tickerData.name,
      exchangeId: exchange.exchangeId,
      exchange,
    };

    this.trackedData.tickers.set(expectedTickerId, createdTicker);

    return createdTicker;
  }

  /**
   * Holding を作成
   * tickerId を省略すると、新しい Ticker（と Exchange）が自動作成される。
   *
   * @param options - 作成オプション
   * @returns 作成された Holding（関連エンティティを含む）
   */
  public async createHolding(options: CreateHoldingOptions = {}): Promise<CreatedHolding> {
    let ticker: CreatedTicker;
    if (options.tickerId) {
      const existing = this.trackedData.tickers.get(options.tickerId);
      if (existing) {
        ticker = existing;
      } else {
        const [, symbol] = options.tickerId.split(':');
        ticker = await this.createTicker({ symbol });
      }
    } else {
      ticker = await this.createTicker();
    }

    const holdingData = {
      tickerId: ticker.tickerId,
      exchangeId: ticker.exchangeId,
      quantity: options.quantity ?? 100,
      averagePrice: options.averagePrice ?? 150.0,
      currency: options.currency || 'USD',
    };

    const response = await this.request.post('/api/holdings', {
      data: holdingData,
    });

    let holdingId: string;
    if (!response.ok()) {
      const errorData = await response.json().catch(() => ({}));
      if (!JSON.stringify(errorData).includes('登録されています')) {
        throw new Error(`Failed to create holding: ${JSON.stringify(errorData)}`);
      }
      // 既に登録されている場合も、正しい形式の holdingId を使用
      // APIが期待する形式: {UserID}#{TickerID}
      holdingId = `${this.testUserId}#${ticker.tickerId}`;
    } else {
      const responseData = await response.json().catch(() => ({}));
      // APIレスポンスから holdingId を取得、なければ正しい形式で生成
      holdingId = responseData.holdingId || `${this.testUserId}#${ticker.tickerId}`;
    }

    const createdHolding: CreatedHolding = {
      holdingId,
      tickerId: ticker.tickerId,
      quantity: holdingData.quantity,
      averagePrice: holdingData.averagePrice,
      currency: holdingData.currency,
      ticker,
    };

    this.trackedData.holdings.set(holdingId, createdHolding);

    return createdHolding;
  }

  /**
   * Watchlist を作成
   * tickerId を省略すると、新しい Ticker（と Exchange）が自動作成される。
   *
   * @param options - 作成オプション
   * @returns 作成された Watchlist（関連エンティティを含む）
   */
  public async createWatchlist(options: CreateWatchlistOptions = {}): Promise<CreatedWatchlist> {
    let ticker: CreatedTicker;
    if (options.tickerId) {
      const existing = this.trackedData.tickers.get(options.tickerId);
      if (existing) {
        ticker = existing;
      } else {
        ticker = await this.createTicker();
      }
    } else {
      ticker = await this.createTicker();
    }

    const watchlistData = {
      tickerId: ticker.tickerId,
    };

    const response = await this.request.post('/api/watchlist', {
      data: watchlistData,
    });

    let watchlistId: string;
    if (!response.ok()) {
      const errorData = await response.json().catch(() => ({}));
      if (!JSON.stringify(errorData).includes('既に')) {
        throw new Error(`Failed to create watchlist: ${JSON.stringify(errorData)}`);
      }
      // 既に登録されている場合も、正しい形式の watchlistId を使用
      // APIが期待する形式: {UserID}#{TickerID}
      watchlistId = `${this.testUserId}#${ticker.tickerId}`;
    } else {
      const responseData = await response.json().catch(() => ({}));
      // APIレスポンスから watchlistId を取得、なければ正しい形式で生成
      watchlistId = responseData.watchlistId || `${this.testUserId}#${ticker.tickerId}`;
    }

    const createdWatchlist: CreatedWatchlist = {
      watchlistId,
      tickerId: ticker.tickerId,
      ticker,
    };

    this.trackedData.watchlists.set(watchlistId, createdWatchlist);

    return createdWatchlist;
  }

  /**
   * Alert を作成
   * tickerId を省略すると、新しい Ticker（と Exchange）が自動作成される。
   *
   * @param options - 作成オプション
   * @returns 作成された Alert（関連エンティティを含む）
   */
  public async createAlert(options: CreateAlertOptions = {}): Promise<CreatedAlert> {
    let ticker: CreatedTicker;
    if (options.tickerId) {
      const existing = this.trackedData.tickers.get(options.tickerId);
      if (existing) {
        ticker = existing;
      } else {
        ticker = await this.createTicker();
      }
    } else {
      ticker = await this.createTicker();
    }

    const defaultSubscription = {
      endpoint:
        options.subscription?.endpoint ||
        `https://fcm.googleapis.com/fcm/send/${this.generateUniqueId('sub')}`,
      keys: {
        p256dh:
          options.subscription?.keys?.p256dh ||
          'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM',
        auth: options.subscription?.keys?.auth || 'tBHItJI5svbpez7KI4CCXg',
      },
    };

    const alertData = {
      tickerId: ticker.tickerId,
      exchangeId: ticker.exchangeId,
      mode: options.mode || 'Sell',
      frequency: options.frequency || 'MINUTE_LEVEL',
      enabled: options.enabled ?? true,
      conditions: options.conditions || [
        {
          field: 'price' as const,
          operator: 'gte' as const,
          value: 100,
        },
      ],
      subscription: defaultSubscription,
    };

    const response = await this.request.post('/api/alerts', {
      data: alertData,
    });

    if (!response.ok()) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`Failed to create alert: ${JSON.stringify(errorData)}`);
    }

    const responseData = await response.json();
    const alertId = responseData.alertId;

    const createdAlert: CreatedAlert = {
      alertId,
      tickerId: ticker.tickerId,
      mode: alertData.mode as 'Buy' | 'Sell',
      frequency: alertData.frequency as 'MINUTE_LEVEL' | 'HOURLY_LEVEL',
      enabled: alertData.enabled,
      conditions: alertData.conditions as CreatedAlert['conditions'],
      ticker,
    };

    this.trackedData.alerts.set(alertId, createdAlert);

    return createdAlert;
  }

  // ==========================================================================
  // 便利メソッド（複合データ作成）
  // ==========================================================================

  /**
   * Alert 付きの完全なテストセットを作成
   * Holding または Watchlist も一緒に作成する
   *
   * @param withHolding - Holding も作成する場合は true、Watchlist を作成する場合は false
   * @param alertOptions - Alert のオプション
   * @returns 作成結果
   */
  public async createAlertWithDependencies(
    withHolding: boolean = true,
    alertOptions: CreateAlertOptions = {}
  ): Promise<{
    holding?: CreatedHolding;
    watchlist?: CreatedWatchlist;
    alert: CreatedAlert;
  }> {
    let holding: CreatedHolding | undefined;
    let watchlist: CreatedWatchlist | undefined;
    let tickerId: string;

    if (withHolding) {
      holding = await this.createHolding();
      tickerId = holding.tickerId;
    } else {
      watchlist = await this.createWatchlist();
      tickerId = watchlist.tickerId;
    }

    const alert = await this.createAlert({
      ...alertOptions,
      tickerId,
    });

    return { holding, watchlist, alert };
  }

  // ==========================================================================
  // クリーンアップ
  // ==========================================================================

  /**
   * 作成した全データを削除
   * 依存関係の逆順で削除: Alert -> Watchlist -> Holding -> Ticker -> Exchange
   */
  public async cleanup(): Promise<void> {
    // 1. Alert を削除
    for (const [alertId] of this.trackedData.alerts) {
      try {
        await this.request.delete(`/api/alerts/${encodeURIComponent(alertId)}`);
      } catch (error) {
        console.warn(`Warning: Failed to delete alert ${alertId}:`, error);
      }
    }
    this.trackedData.alerts.clear();

    // 2. Watchlist を削除
    for (const [watchlistId] of this.trackedData.watchlists) {
      try {
        await this.request.delete(`/api/watchlist/${encodeURIComponent(watchlistId)}`);
      } catch (error) {
        console.warn(`Warning: Failed to delete watchlist ${watchlistId}:`, error);
      }
    }
    this.trackedData.watchlists.clear();

    // 3. Holding を削除
    for (const [holdingId] of this.trackedData.holdings) {
      try {
        await this.request.delete(`/api/holdings/${encodeURIComponent(holdingId)}`);
      } catch (error) {
        console.warn(`Warning: Failed to delete holding ${holdingId}:`, error);
      }
    }
    this.trackedData.holdings.clear();

    // 4. Ticker を削除
    for (const [tickerId] of this.trackedData.tickers) {
      try {
        await this.request.delete(`/api/tickers/${encodeURIComponent(tickerId)}`);
      } catch (error) {
        console.warn(`Warning: Failed to delete ticker ${tickerId}:`, error);
      }
    }
    this.trackedData.tickers.clear();

    // 5. Exchange を削除
    for (const [exchangeId] of this.trackedData.exchanges) {
      try {
        await this.request.delete(`/api/exchanges/${encodeURIComponent(exchangeId)}`);
      } catch (error) {
        console.warn(`Warning: Failed to delete exchange ${exchangeId}:`, error);
      }
    }
    this.trackedData.exchanges.clear();
  }

  // ==========================================================================
  // ゲッター
  // ==========================================================================

  public get exchanges(): CreatedExchange[] {
    return Array.from(this.trackedData.exchanges.values());
  }

  public get tickers(): CreatedTicker[] {
    return Array.from(this.trackedData.tickers.values());
  }

  public get holdings(): CreatedHolding[] {
    return Array.from(this.trackedData.holdings.values());
  }

  public get watchlists(): CreatedWatchlist[] {
    return Array.from(this.trackedData.watchlists.values());
  }

  public get alerts(): CreatedAlert[] {
    return Array.from(this.trackedData.alerts.values());
  }
}
