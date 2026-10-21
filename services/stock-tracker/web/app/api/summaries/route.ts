import { NextRequest, NextResponse } from 'next/server';
import {
  type DailySummaryEntity,
  type ExchangeEntity,
  type ForecastEntity,
  type TickerEntity,
} from '@nagiyu/stock-tracker-core';
import type { ErrorResponse } from '@nagiyu/common';
import { withAuth } from '@nagiyu/nextjs';
import { getSession } from '../../../lib/auth';
import {
  createInternalErrorReporting,
  reportSwallowedError,
} from '../../../lib/api-error-reporting';
import {
  createAlertRepository,
  createDailySummaryRepository,
  createExchangeRepository,
  createForecastRepository,
  createHoldingRepository,
  createMarketForecastRepository,
  createPerformanceDailyRepository,
  createTickerRepository,
} from '../../../lib/repository-factory';
import { isValidDateFormat } from '../../../lib/forecast/date';
import { buildMarketForecasts } from '../../../lib/forecast/market-forecast';
import { toPatternSummary } from '../../../lib/summary/pattern-summary';
import {
  indexForecastsByTicker,
  toTickerForecastSummary,
} from '../../../lib/forecast/ticker-forecast';
import type { MarketForecastResponse, TickerForecastSummary } from '../../../types/forecast';

const ERROR_MESSAGES = {
  INVALID_DATE: '日付はYYYY-MM-DD形式で指定してください',
  INTERNAL_ERROR: 'サマリーの取得に失敗しました',
  FETCH_HOLDINGS_FAILED: '保有株式情報の取得に失敗しました',
  FETCH_ALERTS_FAILED: 'アラート情報の取得に失敗しました',
  FETCH_FORECASTS_FAILED: '確度情報の取得に失敗しました',
  FETCH_MARKET_FORECASTS_FAILED: '市場の荒れ予報の取得に失敗しました',
} as const;

// 付加情報の取得失敗は握りつぶして一覧を返すため、上位のラッパーでは拾えない。その場で報告する
const REPORT_TITLES = {
  FETCH_HOLDINGS_FAILED: 'Web API: サマリーの保有株式取得エラー',
  FETCH_ALERTS_FAILED: 'Web API: サマリーのアラート取得エラー',
  FETCH_FORECASTS_FAILED: 'Web API: サマリーの確度取得エラー',
  FETCH_MARKET_FORECASTS_FAILED: 'Web API: サマリーの市場の荒れ予報取得エラー',
} as const;

const withInternalErrorReporting = createInternalErrorReporting(ERROR_MESSAGES.INTERNAL_ERROR);
// サマリーAPIでは保有情報取得を1回のレスポンスで完結させるため、初期実装は100件を上限とする。
// getByUserId の limit で先頭100件のみ取得し、典型的な利用の保有銘柄数を満たしつつ
// レスポンス遅延や過剰なDBアクセスを抑制する。
const MAX_HOLDINGS_PER_USER = 100;
// サマリーAPIではアラート件数を1回のレスポンスで完結させるため、初期実装は1000件を上限とする。
// 1ユーザーあたり数十〜数百件の想定に対して十分な上限であり、レスポンス肥大化を抑える。
// 上限を超える場合は先頭1000件で集計するため、超過分は一覧の件数表示に含まれない。
const MAX_ALERTS_PER_USER = 1000;

interface HoldingSummaryResponse {
  quantity: number;
  averagePrice: number;
}

interface TickerSummaryResponse {
  tickerId: string;
  /** 確度の基準日（YYYY-MM-DD） */
  date: string;
  symbol: string;
  name: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
  updatedAt: string;
  buyPatternCount: number;
  sellPatternCount: number;
  buyAlertCount: AlertCountResponse;
  sellAlertCount: AlertCountResponse;
  holding: HoldingSummaryResponse | null;
  forecast: TickerForecastSummary | null;
}

interface AlertCountResponse {
  enabled: number;
  disabled: number;
}

interface TickerAlertCountResponse {
  buy: AlertCountResponse;
  sell: AlertCountResponse;
}

interface ExchangeSummaryGroupResponse {
  exchangeId: string;
  exchangeName: string;
  date: string | null;
  summaries: TickerSummaryResponse[];
}

interface SummariesResponse {
  exchanges: ExchangeSummaryGroupResponse[];
  marketForecasts: MarketForecastResponse[];
}

function resolveTicker(
  summary: DailySummaryEntity,
  tickerMap: Map<string, TickerEntity>
): TickerEntity | null {
  return tickerMap.get(summary.tickerId) ?? null;
}

function toTickerSummaryResponse(
  summary: DailySummaryEntity,
  tickerMap: Map<string, TickerEntity>,
  holdingMap: Map<string, HoldingSummaryResponse>,
  alertCountMap: Map<string, TickerAlertCountResponse>,
  forecastMap: Map<string, ForecastEntity>
): TickerSummaryResponse {
  const ticker = resolveTicker(summary, tickerMap);
  const holding = holdingMap.get(summary.tickerId) ?? null;
  const patternCounts = toPatternSummary(summary);
  const alertCount = alertCountMap.get(summary.tickerId) ?? {
    buy: { enabled: 0, disabled: 0 },
    sell: { enabled: 0, disabled: 0 },
  };

  return {
    tickerId: summary.tickerId,
    date: summary.date,
    symbol: ticker?.symbol ?? summary.tickerId.split(':')[1] ?? summary.tickerId,
    name: ticker?.name ?? summary.tickerId,
    open: summary.open,
    high: summary.high,
    low: summary.low,
    close: summary.close,
    volume: summary.volume,
    updatedAt: new Date(summary.updatedAt).toISOString(),
    holding,
    buyAlertCount: alertCount.buy,
    sellAlertCount: alertCount.sell,
    forecast: toTickerForecastSummary(forecastMap.get(summary.tickerId)),
    buyPatternCount: patternCounts.buyPatternCount,
    sellPatternCount: patternCounts.sellPatternCount,
  };
}

async function fetchHoldingMap(userId: string): Promise<Map<string, HoldingSummaryResponse>> {
  try {
    const holdingRepository = createHoldingRepository();
    const holdingsResult = await holdingRepository.getByUserId(userId, {
      limit: MAX_HOLDINGS_PER_USER,
    });
    return new Map(
      holdingsResult.items.map((holding) => [
        holding.tickerId,
        {
          quantity: holding.quantity,
          averagePrice: holding.averagePrice,
        },
      ])
    );
  } catch (error) {
    console.error(ERROR_MESSAGES.FETCH_HOLDINGS_FAILED, error);
    await reportSwallowedError(REPORT_TITLES.FETCH_HOLDINGS_FAILED, error);
    return new Map<string, HoldingSummaryResponse>();
  }
}

async function fetchAlertCountMap(userId: string): Promise<Map<string, TickerAlertCountResponse>> {
  try {
    const alertRepository = createAlertRepository();
    const alertsResult = await alertRepository.getByUserId(userId, { limit: MAX_ALERTS_PER_USER });
    const alertCountMap = new Map<string, TickerAlertCountResponse>();

    for (const alert of alertsResult.items) {
      const currentCount = alertCountMap.get(alert.tickerId) ?? {
        buy: { enabled: 0, disabled: 0 },
        sell: { enabled: 0, disabled: 0 },
      };
      const modeCount = alert.mode === 'Buy' ? currentCount.buy : currentCount.sell;

      if (alert.enabled) {
        modeCount.enabled += 1;
      } else {
        modeCount.disabled += 1;
      }

      alertCountMap.set(alert.tickerId, currentCount);
    }

    return alertCountMap;
  } catch (error) {
    console.error(ERROR_MESSAGES.FETCH_ALERTS_FAILED, error);
    await reportSwallowedError(REPORT_TITLES.FETCH_ALERTS_FAILED, error);
    return new Map<string, TickerAlertCountResponse>();
  }
}

/**
 * 取引所・日付単位で Forecast を 1 回だけ引く（銘柄ごとに引かない）。
 * 確度は付加情報のため、取得に失敗しても一覧全体は返す。
 */
async function fetchForecastMap(
  exchangeId: string,
  date: string | null
): Promise<Map<string, ForecastEntity>> {
  if (date === null) {
    return new Map<string, ForecastEntity>();
  }
  try {
    const forecasts = await createForecastRepository().getByExchangeAndDate(exchangeId, date);
    return indexForecastsByTicker(forecasts);
  } catch (error) {
    console.error(ERROR_MESSAGES.FETCH_FORECASTS_FAILED, error);
    await reportSwallowedError(REPORT_TITLES.FETCH_FORECASTS_FAILED, error);
    return new Map<string, ForecastEntity>();
  }
}

async function fetchMarketForecasts(
  requestedDate: string | null,
  exchanges: readonly ExchangeEntity[],
  groups: readonly ExchangeSummaryGroupResponse[]
): Promise<MarketForecastResponse[]> {
  try {
    return await buildMarketForecasts(
      {
        marketForecastRepository: createMarketForecastRepository(),
        performanceDailyRepository: createPerformanceDailyRepository(),
      },
      requestedDate,
      exchanges.map((exchange, index) => ({
        market: exchange.market,
        date: groups[index]?.date ?? null,
      }))
    );
  } catch (error) {
    console.error(ERROR_MESSAGES.FETCH_MARKET_FORECASTS_FAILED, error);
    await reportSwallowedError(REPORT_TITLES.FETCH_MARKET_FORECASTS_FAILED, error);
    return (['JP', 'US'] as const).map((market) => ({ market, date: null, forecast: null }));
  }
}

async function buildExchangeSummaryGroup(
  exchange: ExchangeEntity,
  date: string | null,
  tickerMap: Map<string, TickerEntity>,
  holdingMap: Map<string, HoldingSummaryResponse>,
  alertCountMap: Map<string, TickerAlertCountResponse>
): Promise<ExchangeSummaryGroupResponse> {
  const dailySummaryRepository = createDailySummaryRepository();
  const summaries = await dailySummaryRepository.getByExchange(
    exchange.exchangeId,
    date || undefined
  );
  const resolvedDate = date ?? summaries[0]?.date ?? null;
  const forecastMap = await fetchForecastMap(exchange.exchangeId, resolvedDate);

  return {
    exchangeId: exchange.exchangeId,
    exchangeName: exchange.name,
    date: resolvedDate,
    summaries: summaries.map((summary) =>
      toTickerSummaryResponse(summary, tickerMap, holdingMap, alertCountMap, forecastMap)
    ),
  };
}

export const GET = withInternalErrorReporting(
  'Web API: サマリー一覧取得エラー',
  withAuth(
    getSession,
    'stocks:read',
    async (
      session,
      request: NextRequest
    ): Promise<NextResponse<SummariesResponse | ErrorResponse>> => {
      const { searchParams } = new URL(request.url);
      const date = searchParams.get('date');

      if (date && !isValidDateFormat(date)) {
        return NextResponse.json(
          {
            error: 'INVALID_DATE',
            message: ERROR_MESSAGES.INVALID_DATE,
          },
          { status: 400 }
        );
      }

      const exchangeRepository = createExchangeRepository();
      const tickerRepository = createTickerRepository();

      // 一覧表示専用のため、テーブル全体を走査しない速い経路(GSI Query)で取引所と銘柄を集める
      const exchanges = await exchangeRepository.getAllIndexed();
      const tickersByExchange = await Promise.all(
        exchanges.map((exchange) => tickerRepository.getByExchange(exchange.exchangeId))
      );
      const [holdingMap, alertCountMap] = await Promise.all([
        fetchHoldingMap(session.user.id),
        fetchAlertCountMap(session.user.id),
      ]);

      const tickerMap = new Map(
        tickersByExchange.flat().map((ticker) => [ticker.tickerId, ticker])
      );
      const exchangeSummaryGroups = await Promise.all(
        exchanges.map((exchange) =>
          buildExchangeSummaryGroup(exchange, date, tickerMap, holdingMap, alertCountMap)
        )
      );

      const marketForecasts = await fetchMarketForecasts(date, exchanges, exchangeSummaryGroups);

      return NextResponse.json(
        { exchanges: exchangeSummaryGroups, marketForecasts },
        { status: 200 }
      );
    }
  )
);
