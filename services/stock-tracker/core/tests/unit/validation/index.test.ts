/**
 * Stock Tracker Core - Validation Functions Unit Tests
 *
 * 各バリデーション関数のテスト
 * - 正常系テスト
 * - 異常系テスト
 * - エッジケース（境界値、null、undefined）テスト
 */

import {
  validateExchange,
  validateTicker,
  validateHolding,
  validateWatchlist,
  validateAlert,
  validateTickerCreateData,
  validateTickerUpdateData,
} from '../../../src/validation';
import type { Exchange, Ticker, Holding, Watchlist, Alert } from '../../../src/types';

describe('validateExchange', () => {
  const validExchange: Exchange = {
    ExchangeID: 'NASDAQ',
    Name: 'NASDAQ Stock Market',
    Key: 'NSDQ',
    Timezone: 'America/New_York',
    Start: '04:00',
    End: '20:00',
    CreatedAt: Date.now(),
    UpdatedAt: Date.now(),
  };

  describe('正常系', () => {
    it('有効な取引所データはバリデーションに成功する', () => {
      const result = validateExchange(validExchange);
      expect(result.valid).toBe(true);
      expect(result.errors).toBeUndefined();
    });

    it('ExchangeIDが50文字ちょうどでもバリデーションに成功する', () => {
      const exchange: Exchange = {
        ...validExchange,
        ExchangeID: 'a'.repeat(50),
      };
      const result = validateExchange(exchange);
      expect(result.valid).toBe(true);
    });

    it('Nameが200文字ちょうどでもバリデーションに成功する', () => {
      const exchange: Exchange = {
        ...validExchange,
        Name: 'a'.repeat(200),
      };
      const result = validateExchange(exchange);
      expect(result.valid).toBe(true);
    });

    it('Keyが20文字ちょうどでもバリデーションに成功する', () => {
      const exchange: Exchange = {
        ...validExchange,
        Key: 'A'.repeat(20),
      };
      const result = validateExchange(exchange);
      expect(result.valid).toBe(true);
    });
  });

  describe('異常系', () => {
    it('nullの場合はバリデーションに失敗する', () => {
      const result = validateExchange(null);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('取引所データが指定されていません');
    });

    it('undefinedの場合はバリデーションに失敗する', () => {
      const result = validateExchange(undefined);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('取引所データが指定されていません');
    });

    it('オブジェクト以外の型の場合はバリデーションに失敗する', () => {
      const result = validateExchange('invalid');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('取引所データが不正です');
    });

    it('ExchangeIDが空文字の場合はバリデーションに失敗する', () => {
      const exchange: Exchange = { ...validExchange, ExchangeID: '' };
      const result = validateExchange(exchange);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('取引所IDは必須です');
    });

    it('ExchangeIDが51文字の場合はバリデーションに失敗する', () => {
      const exchange: Exchange = {
        ...validExchange,
        ExchangeID: 'a'.repeat(51),
      };
      const result = validateExchange(exchange);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('取引所IDは1-50文字の英数字とハイフンのみ使用できます');
    });

    it('ExchangeIDに不正な文字が含まれる場合はバリデーションに失敗する', () => {
      const exchange: Exchange = { ...validExchange, ExchangeID: 'NASDAQ_' };
      const result = validateExchange(exchange);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('取引所IDは1-50文字の英数字とハイフンのみ使用できます');
    });

    it('Nameが空文字の場合はバリデーションに失敗する', () => {
      const exchange: Exchange = { ...validExchange, Name: '' };
      const result = validateExchange(exchange);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('取引所名は必須です');
    });

    it('Nameが201文字の場合はバリデーションに失敗する', () => {
      const exchange: Exchange = {
        ...validExchange,
        Name: 'a'.repeat(201),
      };
      const result = validateExchange(exchange);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('取引所名は200文字以内で入力してください');
    });

    it('Keyが空文字の場合はバリデーションに失敗する', () => {
      const exchange: Exchange = { ...validExchange, Key: '' };
      const result = validateExchange(exchange);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('TradingView APIキーは必須です');
    });

    it('Keyに小文字が含まれる場合はバリデーションに失敗する', () => {
      const exchange: Exchange = { ...validExchange, Key: 'NSDq' };
      const result = validateExchange(exchange);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        'TradingView APIキーは1-20文字の英大文字と数字のみ使用できます'
      );
    });

    it('Timezoneが空文字の場合はバリデーションに失敗する', () => {
      const exchange: Exchange = { ...validExchange, Timezone: '' };
      const result = validateExchange(exchange);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('タイムゾーンは必須です');
    });

    it('Timezoneが不正な形式の場合はバリデーションに失敗する', () => {
      const exchange: Exchange = { ...validExchange, Timezone: 'EST' };
      const result = validateExchange(exchange);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        'タイムゾーンはIANA形式（例: America/New_York）で入力してください'
      );
    });

    it('Startが空文字の場合はバリデーションに失敗する', () => {
      const exchange: Exchange = { ...validExchange, Start: '' };
      const result = validateExchange(exchange);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('取引開始時刻は必須です');
    });

    it('Startが不正な形式の場合はバリデーションに失敗する', () => {
      const exchange: Exchange = { ...validExchange, Start: '4:00' };
      const result = validateExchange(exchange);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('取引開始時刻はHH:MM形式（例: 04:00）で入力してください');
    });

    it('Endが空文字の場合はバリデーションに失敗する', () => {
      const exchange: Exchange = { ...validExchange, End: '' };
      const result = validateExchange(exchange);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('取引終了時刻は必須です');
    });

    it('Endが不正な形式の場合はバリデーションに失敗する', () => {
      const exchange: Exchange = { ...validExchange, End: '24:00' };
      const result = validateExchange(exchange);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('取引終了時刻はHH:MM形式（例: 20:00）で入力してください');
    });

    it('CreatedAtが未来すぎる場合はバリデーションに失敗する', () => {
      const exchange: Exchange = {
        ...validExchange,
        CreatedAt: Date.now() + 86400000 * 2,
      };
      const result = validateExchange(exchange);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('作成日時が無効です');
    });

    it('UpdatedAtが未来すぎる場合はバリデーションに失敗する', () => {
      const exchange: Exchange = {
        ...validExchange,
        UpdatedAt: Date.now() + 86400000 * 2,
      };
      const result = validateExchange(exchange);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('更新日時が無効です');
    });
  });

  describe('境界値テスト', () => {
    it('ExchangeIDが1文字でもバリデーションに成功する', () => {
      const exchange: Exchange = { ...validExchange, ExchangeID: 'A' };
      const result = validateExchange(exchange);
      expect(result.valid).toBe(true);
    });

    it('Nameが1文字でもバリデーションに成功する', () => {
      const exchange: Exchange = { ...validExchange, Name: 'A' };
      const result = validateExchange(exchange);
      expect(result.valid).toBe(true);
    });

    it('Keyが1文字でもバリデーションに成功する', () => {
      const exchange: Exchange = { ...validExchange, Key: 'A' };
      const result = validateExchange(exchange);
      expect(result.valid).toBe(true);
    });

    it('Start/Endが00:00でもバリデーションに成功する', () => {
      const exchange: Exchange = {
        ...validExchange,
        Start: '00:00',
        End: '00:00',
      };
      const result = validateExchange(exchange);
      expect(result.valid).toBe(true);
    });

    it('Start/Endが23:59でもバリデーションに成功する', () => {
      const exchange: Exchange = {
        ...validExchange,
        Start: '23:59',
        End: '23:59',
      };
      const result = validateExchange(exchange);
      expect(result.valid).toBe(true);
    });
  });
});

describe('validateTicker', () => {
  const validTicker: Ticker = {
    TickerID: 'NSDQ:AAPL',
    Symbol: 'AAPL',
    Name: 'Apple Inc.',
    ExchangeID: 'NASDAQ',
    CreatedAt: Date.now(),
    UpdatedAt: Date.now(),
  };

  describe('正常系', () => {
    it('有効なティッカーデータはバリデーションに成功する', () => {
      const result = validateTicker(validTicker);
      expect(result.valid).toBe(true);
      expect(result.errors).toBeUndefined();
    });

    it('TickerIDが{Key}:{Symbol}形式でもバリデーションに成功する', () => {
      const ticker: Ticker = { ...validTicker, TickerID: 'NYSE:TSLA' };
      const result = validateTicker(ticker);
      expect(result.valid).toBe(true);
    });

    it('Symbolが20文字ちょうどでもバリデーションに成功する', () => {
      const ticker: Ticker = {
        ...validTicker,
        Symbol: 'A'.repeat(20),
        TickerID: `NSDQ:${'A'.repeat(20)}`,
      };
      const result = validateTicker(ticker);
      expect(result.valid).toBe(true);
    });

    it('Nameが200文字ちょうどでもバリデーションに成功する', () => {
      const ticker: Ticker = {
        ...validTicker,
        Name: 'a'.repeat(200),
      };
      const result = validateTicker(ticker);
      expect(result.valid).toBe(true);
    });
  });

  describe('異常系', () => {
    it('nullの場合はバリデーションに失敗する', () => {
      const result = validateTicker(null);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('ティッカーデータが指定されていません');
    });

    it('undefinedの場合はバリデーションに失敗する', () => {
      const result = validateTicker(undefined);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('ティッカーデータが指定されていません');
    });

    it('オブジェクト以外の型の場合はバリデーションに失敗する', () => {
      const result = validateTicker(123);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('ティッカーデータが不正です');
    });

    it('TickerIDが空文字の場合はバリデーションに失敗する', () => {
      const ticker: Ticker = { ...validTicker, TickerID: '' };
      const result = validateTicker(ticker);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('ティッカーIDは必須です');
    });

    it('TickerIDにコロンがない場合はバリデーションに失敗する', () => {
      const ticker: Ticker = { ...validTicker, TickerID: 'NASDAQAAPL' };
      const result = validateTicker(ticker);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        'ティッカーIDは{取引所キー}:{シンボル}形式で入力してください（例: NSDQ:AAPL）'
      );
    });

    it('TickerIDに小文字が含まれる場合はバリデーションに失敗する', () => {
      const ticker: Ticker = { ...validTicker, TickerID: 'NSDQ:aapl' };
      const result = validateTicker(ticker);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        'ティッカーIDは{取引所キー}:{シンボル}形式で入力してください（例: NSDQ:AAPL）'
      );
    });

    it('Symbolが空文字の場合はバリデーションに失敗する', () => {
      const ticker: Ticker = { ...validTicker, Symbol: '' };
      const result = validateTicker(ticker);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('シンボルは必須です');
    });

    it('Symbolに小文字が含まれる場合はバリデーションに失敗する', () => {
      const ticker: Ticker = { ...validTicker, Symbol: 'Aapl' };
      const result = validateTicker(ticker);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('シンボルは1-20文字の英大文字と数字のみ使用できます');
    });

    it('Symbolが21文字の場合はバリデーションに失敗する', () => {
      const ticker: Ticker = {
        ...validTicker,
        Symbol: 'A'.repeat(21),
      };
      const result = validateTicker(ticker);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('シンボルは1-20文字の英大文字と数字のみ使用できます');
    });

    it('Nameが空文字の場合はバリデーションに失敗する', () => {
      const ticker: Ticker = { ...validTicker, Name: '' };
      const result = validateTicker(ticker);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('銘柄名は必須です');
    });

    it('Nameが201文字の場合はバリデーションに失敗する', () => {
      const ticker: Ticker = {
        ...validTicker,
        Name: 'a'.repeat(201),
      };
      const result = validateTicker(ticker);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('銘柄名は200文字以内で入力してください');
    });

    it('ExchangeIDが空文字の場合はバリデーションに失敗する', () => {
      const ticker: Ticker = { ...validTicker, ExchangeID: '' };
      const result = validateTicker(ticker);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('取引所IDは必須です');
    });
  });

  describe('境界値テスト', () => {
    it('Symbolが1文字でもバリデーションに成功する', () => {
      const ticker: Ticker = {
        ...validTicker,
        Symbol: 'A',
        TickerID: 'NSDQ:A',
      };
      const result = validateTicker(ticker);
      expect(result.valid).toBe(true);
    });

    it('Nameが1文字でもバリデーションに成功する', () => {
      const ticker: Ticker = { ...validTicker, Name: 'A' };
      const result = validateTicker(ticker);
      expect(result.valid).toBe(true);
    });
  });
});

describe('validateHolding', () => {
  const validHolding: Holding = {
    UserID: 'user-123',
    TickerID: 'NSDQ:AAPL',
    ExchangeID: 'NASDAQ',
    Quantity: 100,
    AveragePrice: 150.5,
    Currency: 'USD',
    CreatedAt: Date.now(),
    UpdatedAt: Date.now(),
  };

  describe('正常系', () => {
    it('有効な保有株式データはバリデーションに成功する', () => {
      const result = validateHolding(validHolding);
      expect(result.valid).toBe(true);
      expect(result.errors).toBeUndefined();
    });

    it('Quantityが0.0001でもバリデーションに成功する', () => {
      const holding: Holding = { ...validHolding, Quantity: 0.0001 };
      const result = validateHolding(holding);
      expect(result.valid).toBe(true);
    });

    it('Quantityが1,000,000,000でもバリデーションに成功する', () => {
      const holding: Holding = { ...validHolding, Quantity: 1_000_000_000 };
      const result = validateHolding(holding);
      expect(result.valid).toBe(true);
    });

    it('AveragePriceが0.01でもバリデーションに成功する', () => {
      const holding: Holding = { ...validHolding, AveragePrice: 0.01 };
      const result = validateHolding(holding);
      expect(result.valid).toBe(true);
    });

    it('AveragePriceが1,000,000でもバリデーションに成功する', () => {
      const holding: Holding = { ...validHolding, AveragePrice: 1_000_000 };
      const result = validateHolding(holding);
      expect(result.valid).toBe(true);
    });

    it('Currencyが"JPY"でもバリデーションに成功する', () => {
      const holding: Holding = { ...validHolding, Currency: 'JPY' };
      const result = validateHolding(holding);
      expect(result.valid).toBe(true);
    });
  });

  describe('異常系', () => {
    it('nullの場合はバリデーションに失敗する', () => {
      const result = validateHolding(null);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('保有株式データが指定されていません');
    });

    it('undefinedの場合はバリデーションに失敗する', () => {
      const result = validateHolding(undefined);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('保有株式データが指定されていません');
    });

    it('オブジェクト以外の型の場合はバリデーションに失敗する', () => {
      const result = validateHolding([]);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('保有株式データが不正です');
    });

    it('UserIDが空文字の場合はバリデーションに失敗する', () => {
      const holding: Holding = { ...validHolding, UserID: '' };
      const result = validateHolding(holding);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('ユーザーIDは必須です');
    });

    it('TickerIDが空文字の場合はバリデーションに失敗する', () => {
      const holding: Holding = { ...validHolding, TickerID: '' };
      const result = validateHolding(holding);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('ティッカーIDは必須です');
    });

    it('ExchangeIDが空文字の場合はバリデーションに失敗する', () => {
      const holding: Holding = { ...validHolding, ExchangeID: '' };
      const result = validateHolding(holding);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('取引所IDは必須です');
    });

    it('Quantityが0.00009の場合はバリデーションに失敗する', () => {
      const holding: Holding = { ...validHolding, Quantity: 0.00009 };
      const result = validateHolding(holding);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('保有数は0.0001〜1,000,000,000の範囲で入力してください');
    });

    it('Quantityが1,000,000,001の場合はバリデーションに失敗する', () => {
      const holding: Holding = { ...validHolding, Quantity: 1_000_000_001 };
      const result = validateHolding(holding);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('保有数は0.0001〜1,000,000,000の範囲で入力してください');
    });

    it('AveragePriceが0.009の場合はバリデーションに失敗する', () => {
      const holding: Holding = { ...validHolding, AveragePrice: 0.009 };
      const result = validateHolding(holding);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('平均取得価格は0.01〜1,000,000の範囲で入力してください');
    });

    it('AveragePriceが1,000,001の場合はバリデーションに失敗する', () => {
      const holding: Holding = { ...validHolding, AveragePrice: 1_000_001 };
      const result = validateHolding(holding);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('平均取得価格は0.01〜1,000,000の範囲で入力してください');
    });

    it('Currencyが空文字の場合はバリデーションに失敗する', () => {
      const holding: Holding = { ...validHolding, Currency: '' };
      const result = validateHolding(holding);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('通貨コードは必須です');
    });

    it('Currencyが2文字の場合はバリデーションに失敗する', () => {
      const holding: Holding = { ...validHolding, Currency: 'US' };
      const result = validateHolding(holding);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        '通貨コードは3文字の英大文字で入力してください（例: USD, JPY）'
      );
    });

    it('Currencyが4文字の場合はバリデーションに失敗する', () => {
      const holding: Holding = { ...validHolding, Currency: 'USDA' };
      const result = validateHolding(holding);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        '通貨コードは3文字の英大文字で入力してください（例: USD, JPY）'
      );
    });

    it('Currencyに小文字が含まれる場合はバリデーションに失敗する', () => {
      const holding: Holding = { ...validHolding, Currency: 'Usd' };
      const result = validateHolding(holding);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        '通貨コードは3文字の英大文字で入力してください（例: USD, JPY）'
      );
    });
  });

  describe('境界値テスト', () => {
    it('Quantityが境界値の下限（0.0001）でバリデーションに成功する', () => {
      const holding: Holding = { ...validHolding, Quantity: 0.0001 };
      const result = validateHolding(holding);
      expect(result.valid).toBe(true);
    });

    it('Quantityが境界値の上限（1,000,000,000）でバリデーションに成功する', () => {
      const holding: Holding = { ...validHolding, Quantity: 1_000_000_000 };
      const result = validateHolding(holding);
      expect(result.valid).toBe(true);
    });

    it('AveragePriceが境界値の下限（0.01）でバリデーションに成功する', () => {
      const holding: Holding = { ...validHolding, AveragePrice: 0.01 };
      const result = validateHolding(holding);
      expect(result.valid).toBe(true);
    });

    it('AveragePriceが境界値の上限（1,000,000）でバリデーションに成功する', () => {
      const holding: Holding = { ...validHolding, AveragePrice: 1_000_000 };
      const result = validateHolding(holding);
      expect(result.valid).toBe(true);
    });
  });
});

describe('validateWatchlist', () => {
  const validWatchlist: Watchlist = {
    UserID: 'user-123',
    TickerID: 'NSDQ:AAPL',
    ExchangeID: 'NASDAQ',
    CreatedAt: Date.now(),
  };

  describe('正常系', () => {
    it('有効なウォッチリストデータはバリデーションに成功する', () => {
      const result = validateWatchlist(validWatchlist);
      expect(result.valid).toBe(true);
      expect(result.errors).toBeUndefined();
    });
  });

  describe('異常系', () => {
    it('nullの場合はバリデーションに失敗する', () => {
      const result = validateWatchlist(null);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('ウォッチリストデータが指定されていません');
    });

    it('undefinedの場合はバリデーションに失敗する', () => {
      const result = validateWatchlist(undefined);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('ウォッチリストデータが指定されていません');
    });

    it('オブジェクト以外の型の場合はバリデーションに失敗する', () => {
      const result = validateWatchlist('invalid');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('ウォッチリストデータが不正です');
    });

    it('UserIDが空文字の場合はバリデーションに失敗する', () => {
      const watchlist: Watchlist = { ...validWatchlist, UserID: '' };
      const result = validateWatchlist(watchlist);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('ユーザーIDは必須です');
    });

    it('TickerIDが空文字の場合はバリデーションに失敗する', () => {
      const watchlist: Watchlist = { ...validWatchlist, TickerID: '' };
      const result = validateWatchlist(watchlist);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('ティッカーIDは必須です');
    });

    it('ExchangeIDが空文字の場合はバリデーションに失敗する', () => {
      const watchlist: Watchlist = { ...validWatchlist, ExchangeID: '' };
      const result = validateWatchlist(watchlist);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('取引所IDは必須です');
    });

    it('CreatedAtが未来すぎる場合はバリデーションに失敗する', () => {
      const watchlist: Watchlist = {
        ...validWatchlist,
        CreatedAt: Date.now() + 86400000 * 2,
      };
      const result = validateWatchlist(watchlist);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('作成日時が無効です');
    });
  });
});

describe('validateAlert', () => {
  const validAlert: Alert = {
    AlertID: '550e8400-e29b-41d4-a716-446655440000',
    UserID: 'user-123',
    TickerID: 'NSDQ:AAPL',
    ExchangeID: 'NASDAQ',
    Mode: 'Sell',
    Frequency: 'MINUTE_LEVEL',
    Enabled: true,
    ConditionList: [
      {
        field: 'price',
        operator: 'gte',
        value: 200.0,
      },
    ],
    SubscriptionEndpoint: 'https://fcm.googleapis.com/fcm/send/...',
    SubscriptionKeysP256dh: 'BM...',
    SubscriptionKeysAuth: 'Abc...',
    CreatedAt: Date.now(),
    UpdatedAt: Date.now(),
  };

  describe('正常系', () => {
    it('有効なアラートデータはバリデーションに成功する', () => {
      const result = validateAlert(validAlert);
      expect(result.valid).toBe(true);
      expect(result.errors).toBeUndefined();
    });

    it('Mode="Buy"でもバリデーションに成功する', () => {
      const alert: Alert = { ...validAlert, Mode: 'Buy' };
      const result = validateAlert(alert);
      expect(result.valid).toBe(true);
    });

    it('Frequency="HOURLY_LEVEL"でもバリデーションに成功する', () => {
      const alert: Alert = { ...validAlert, Frequency: 'HOURLY_LEVEL' };
      const result = validateAlert(alert);
      expect(result.valid).toBe(true);
    });

    it('Enabled=falseでもバリデーションに成功する', () => {
      const alert: Alert = { ...validAlert, Enabled: false };
      const result = validateAlert(alert);
      expect(result.valid).toBe(true);
    });

    it('operator="lte"でもバリデーションに成功する', () => {
      const alert: Alert = {
        ...validAlert,
        ConditionList: [{ field: 'price', operator: 'lte', value: 150.0 }],
      };
      const result = validateAlert(alert);
      expect(result.valid).toBe(true);
    });

    it('条件値が0.01でもバリデーションに成功する', () => {
      const alert: Alert = {
        ...validAlert,
        ConditionList: [{ field: 'price', operator: 'gte', value: 0.01 }],
      };
      const result = validateAlert(alert);
      expect(result.valid).toBe(true);
    });

    it('条件値が1,000,000でもバリデーションに成功する', () => {
      const alert: Alert = {
        ...validAlert,
        ConditionList: [{ field: 'price', operator: 'gte', value: 1_000_000 }],
      };
      const result = validateAlert(alert);
      expect(result.valid).toBe(true);
    });
  });

  describe('異常系', () => {
    it('nullの場合はバリデーションに失敗する', () => {
      const result = validateAlert(null);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('アラートデータが指定されていません');
    });

    it('undefinedの場合はバリデーションに失敗する', () => {
      const result = validateAlert(undefined);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('アラートデータが指定されていません');
    });

    it('オブジェクト以外の型の場合はバリデーションに失敗する', () => {
      const result = validateAlert(123);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('アラートデータが不正です');
    });

    it('AlertIDが空文字の場合はバリデーションに失敗する', () => {
      const alert: Alert = { ...validAlert, AlertID: '' };
      const result = validateAlert(alert);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('アラートIDは必須です');
    });

    it('AlertIDがUUID v4形式でない場合はバリデーションに失敗する', () => {
      const alert: Alert = {
        ...validAlert,
        AlertID: '550e8400-e29b-31d4-a716-446655440000',
      }; // v3
      const result = validateAlert(alert);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('アラートIDはUUID v4形式で入力してください');
    });

    it('UserIDが空文字の場合はバリデーションに失敗する', () => {
      const alert: Alert = { ...validAlert, UserID: '' };
      const result = validateAlert(alert);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('ユーザーIDは必須です');
    });

    it('TickerIDが空文字の場合はバリデーションに失敗する', () => {
      const alert: Alert = { ...validAlert, TickerID: '' };
      const result = validateAlert(alert);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('ティッカーIDは必須です');
    });

    it('ExchangeIDが空文字の場合はバリデーションに失敗する', () => {
      const alert: Alert = { ...validAlert, ExchangeID: '' };
      const result = validateAlert(alert);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('取引所IDは必須です');
    });

    it('Modeが不正な値の場合はバリデーションに失敗する', () => {
      const alert = { ...validAlert, Mode: 'Hold' };
      const result = validateAlert(alert);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('モードは"Buy"または"Sell"を指定してください');
    });

    it('Frequencyが不正な値の場合はバリデーションに失敗する', () => {
      const alert = { ...validAlert, Frequency: 'DAILY_LEVEL' };
      const result = validateAlert(alert);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        '通知頻度は"MINUTE_LEVEL"または"HOURLY_LEVEL"を指定してください'
      );
    });

    it('ConditionListが空配列の場合はバリデーションに失敗する', () => {
      const alert: Alert = { ...validAlert, ConditionList: [] };
      const result = validateAlert(alert);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('アラート条件は1つ以上指定してください');
    });

    it('ConditionListが2つ以上の場合はバリデーションに失敗する', () => {
      const alert: Alert = {
        ...validAlert,
        ConditionList: [
          { field: 'price', operator: 'gte', value: 200.0 },
          { field: 'price', operator: 'lte', value: 100.0 },
        ],
      };
      const result = validateAlert(alert);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Phase 1ではアラート条件は1つまでです');
    });

    it('条件のfieldが"price"以外の場合はバリデーションに失敗する', () => {
      const alert = {
        ...validAlert,
        ConditionList: [{ field: 'volume', operator: 'gte', value: 200.0 }],
      };
      const result = validateAlert(alert);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Phase 1ではフィールドは"price"のみ指定できます');
    });

    it('条件のoperatorが"eq"の場合はバリデーションに失敗する', () => {
      const alert = {
        ...validAlert,
        ConditionList: [{ field: 'price', operator: 'eq', value: 200.0 }],
      };
      const result = validateAlert(alert);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Phase 1では演算子は"gte"または"lte"のみ指定できます');
    });

    it('条件値が0.009の場合はバリデーションに失敗する', () => {
      const alert: Alert = {
        ...validAlert,
        ConditionList: [{ field: 'price', operator: 'gte', value: 0.009 }],
      };
      const result = validateAlert(alert);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('条件値は0.01〜1,000,000の範囲で入力してください');
    });

    it('条件値が1,000,001の場合はバリデーションに失敗する', () => {
      const alert: Alert = {
        ...validAlert,
        ConditionList: [{ field: 'price', operator: 'gte', value: 1_000_001 }],
      };
      const result = validateAlert(alert);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('条件値は0.01〜1,000,000の範囲で入力してください');
    });

    it('SubscriptionEndpointが空文字の場合はバリデーションに失敗する', () => {
      const alert: Alert = { ...validAlert, SubscriptionEndpoint: '' };
      const result = validateAlert(alert);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Web Pushサブスクリプションエンドポイントは必須です');
    });

    it('SubscriptionKeysP256dhが空文字の場合はバリデーションに失敗する', () => {
      const alert: Alert = { ...validAlert, SubscriptionKeysP256dh: '' };
      const result = validateAlert(alert);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Web Push公開鍵は必須です');
    });

    it('SubscriptionKeysAuthが空文字の場合はバリデーションに失敗する', () => {
      const alert: Alert = { ...validAlert, SubscriptionKeysAuth: '' };
      const result = validateAlert(alert);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Web Push認証シークレットは必須です');
    });
  });

  describe('境界値テスト', () => {
    it('条件値が境界値の下限（0.01）でバリデーションに成功する', () => {
      const alert: Alert = {
        ...validAlert,
        ConditionList: [{ field: 'price', operator: 'gte', value: 0.01 }],
      };
      const result = validateAlert(alert);
      expect(result.valid).toBe(true);
    });

    it('条件値が境界値の上限（1,000,000）でバリデーションに成功する', () => {
      const alert: Alert = {
        ...validAlert,
        ConditionList: [{ field: 'price', operator: 'gte', value: 1_000_000 }],
      };
      const result = validateAlert(alert);
      expect(result.valid).toBe(true);
    });
  });

  describe('無効なタイムスタンプのテスト', () => {
    it('CreatedAtが無効な値の場合はバリデーションに失敗する', () => {
      const alert = {
        ...validAlert,
        CreatedAt: 'invalid' as unknown,
      };
      const result = validateAlert(alert);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('作成日時が無効です');
    });

    it('UpdatedAtが無効な値の場合はバリデーションに失敗する', () => {
      const alert = {
        ...validAlert,
        UpdatedAt: 'invalid' as unknown,
      };
      const result = validateAlert(alert);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('更新日時が無効です');
    });
  });
});

describe('validateExchange', () => {
  describe('無効なタイムスタンプのテスト', () => {
    const validExchange = {
      ExchangeID: 'NASDAQ',
      Name: 'NASDAQ Stock Market',
      Key: 'NSDQ',
      Timezone: 'America/New_York',
      Start: '04:00',
      End: '20:00',
      CreatedAt: 1704067200000,
      UpdatedAt: 1704067200000,
    };

    it('CreatedAtが無効な値の場合はバリデーションに失敗する', () => {
      const exchange = {
        ...validExchange,
        CreatedAt: 'invalid' as unknown,
      };
      const result = validateExchange(exchange);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('作成日時が無効です');
    });

    it('UpdatedAtが無効な値の場合はバリデーションに失敗する', () => {
      const exchange = {
        ...validExchange,
        UpdatedAt: null as unknown,
      };
      const result = validateExchange(exchange);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('更新日時は必須です');
    });
  });
});

describe('validateTicker', () => {
  describe('無効なタイムスタンプのテスト', () => {
    const validTicker = {
      TickerID: 'NSDQ:AAPL',
      Symbol: 'AAPL',
      Name: 'Apple Inc.',
      ExchangeID: 'NASDAQ',
      CreatedAt: 1704067200000,
      UpdatedAt: 1704067200000,
    };

    it('CreatedAtが無効な値の場合はバリデーションに失敗する', () => {
      const ticker = {
        ...validTicker,
        CreatedAt: -1 as unknown,
      };
      const result = validateTicker(ticker);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('作成日時が無効です');
    });

    it('UpdatedAtが無効な値の場合はバリデーションに失敗する', () => {
      const ticker = {
        ...validTicker,
        UpdatedAt: 'string' as unknown,
      };
      const result = validateTicker(ticker);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('更新日時が無効です');
    });
  });
});

describe('validateHolding', () => {
  describe('無効な値のテスト', () => {
    const validHolding = {
      UserID: 'user-123',
      TickerID: 'NSDQ:AAPL',
      ExchangeID: 'NASDAQ',
      Quantity: 10.5,
      AveragePrice: 150.25,
      Currency: 'USD',
      CreatedAt: 1704067200000,
      UpdatedAt: 1704067200000,
    };

    it('Quantityが無効な値の場合はバリデーションに失敗する', () => {
      const holding = {
        ...validHolding,
        Quantity: 'invalid' as unknown,
      };
      const result = validateHolding(holding);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('保有数は0.0001〜1,000,000,000の範囲で入力してください');
    });

    it('AveragePriceが無効な値の場合はバリデーションに失敗する', () => {
      const holding = {
        ...validHolding,
        AveragePrice: null as unknown,
      };
      const result = validateHolding(holding);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('平均取得価格は必須です');
    });

    it('CreatedAtが無効な値の場合はバリデーションに失敗する', () => {
      const holding = {
        ...validHolding,
        CreatedAt: false as unknown,
      };
      const result = validateHolding(holding);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('作成日時が無効です');
    });

    it('UpdatedAtが無効な値の場合はバリデーションに失敗する', () => {
      const holding = {
        ...validHolding,
        UpdatedAt: [] as unknown,
      };
      const result = validateHolding(holding);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('更新日時が無効です');
    });
  });
});

describe('validateWatchlist', () => {
  describe('無効なタイムスタンプのテスト', () => {
    const validWatchlist = {
      UserID: 'user-123',
      TickerID: 'NSDQ:AAPL',
      ExchangeID: 'NASDAQ',
      CreatedAt: 1704067200000,
    };

    it('CreatedAtが無効な値の場合はバリデーションに失敗する', () => {
      const watchlist = {
        ...validWatchlist,
        CreatedAt: {} as unknown,
      };
      const result = validateWatchlist(watchlist);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('作成日時が無効です');
    });
  });
});

describe('validateTickerCreateData', () => {
  it('正常なデータの場合はバリデーションに成功する', () => {
    const data = {
      symbol: 'AAPL',
      name: 'Apple Inc.',
      exchangeId: 'NASDAQ',
    };
    const result = validateTickerCreateData(data);
    expect(result.valid).toBe(true);
  });

  it('symbolが空文字の場合はバリデーションに失敗する', () => {
    const data = {
      symbol: '',
      name: 'Apple Inc.',
      exchangeId: 'NASDAQ',
    };
    const result = validateTickerCreateData(data);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('シンボルは必須です');
  });

  it('symbolが無効な形式の場合はバリデーションに失敗する', () => {
    const data = {
      symbol: 'aapl',
      name: 'Apple Inc.',
      exchangeId: 'NASDAQ',
    };
    const result = validateTickerCreateData(data);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('シンボルは1-20文字の英大文字と数字のみ使用できます');
  });

  it('nameが空文字の場合はバリデーションに失敗する', () => {
    const data = {
      symbol: 'AAPL',
      name: '',
      exchangeId: 'NASDAQ',
    };
    const result = validateTickerCreateData(data);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('銘柄名は必須です');
  });

  it('nameが200文字を超える場合はバリデーションに失敗する', () => {
    const data = {
      symbol: 'AAPL',
      name: 'A'.repeat(201),
      exchangeId: 'NASDAQ',
    };
    const result = validateTickerCreateData(data);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('銘柄名は200文字以内で入力してください');
  });

  it('exchangeIdが空文字の場合はバリデーションに失敗する', () => {
    const data = {
      symbol: 'AAPL',
      name: 'Apple Inc.',
      exchangeId: '',
    };
    const result = validateTickerCreateData(data);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('取引所IDは必須です');
  });

  it('nullの場合はバリデーションに失敗する', () => {
    const result = validateTickerCreateData(null);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('ティッカーデータが指定されていません');
  });

  it('undefinedの場合はバリデーションに失敗する', () => {
    const result = validateTickerCreateData(undefined);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('ティッカーデータが指定されていません');
  });

  it('オブジェクトでない場合はバリデーションに失敗する', () => {
    const result = validateTickerCreateData('string');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('ティッカーデータが不正です');
  });
});

describe('validateTickerUpdateData', () => {
  it('正常なデータの場合はバリデーションに成功する', () => {
    const data = {
      name: 'Apple Corporation',
    };
    const result = validateTickerUpdateData(data);
    expect(result.valid).toBe(true);
  });

  it('nameが空文字の場合はバリデーションに失敗する', () => {
    const data = {
      name: '',
    };
    const result = validateTickerUpdateData(data);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('銘柄名は必須です');
  });

  it('nameが200文字を超える場合はバリデーションに失敗する', () => {
    const data = {
      name: 'A'.repeat(201),
    };
    const result = validateTickerUpdateData(data);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('銘柄名は200文字以内で入力してください');
  });

  it('更新フィールドがない場合はバリデーションに失敗する', () => {
    const data = {};
    const result = validateTickerUpdateData(data);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('更新する内容を指定してください');
  });

  it('nullの場合はバリデーションに失敗する', () => {
    const result = validateTickerUpdateData(null);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('ティッカーデータが指定されていません');
  });

  it('undefinedの場合はバリデーションに失敗する', () => {
    const result = validateTickerUpdateData(undefined);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('ティッカーデータが指定されていません');
  });

  it('オブジェクトでない場合はバリデーションに失敗する', () => {
    const result = validateTickerUpdateData(123);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('ティッカーデータが不正です');
  });
});
