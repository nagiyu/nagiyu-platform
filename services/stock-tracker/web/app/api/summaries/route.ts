import { NextRequest, NextResponse } from 'next/server';
import {
  DailySummaryMapper,
  type DailySummaryEntity,
  type ExchangeEntity,
  type ForecastEntity,
  type TickerEntity,
} from '@nagiyu/stock-tracker-core';
import type { ErrorResponse } from '@nagiyu/common';
import { withAuth } from '@nagiyu/nextjs';
import { getSession } from '../../../lib/auth';
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
  return tickerMap.get(summary.TickerID) ?? null;
}

const dailySummaryMapper = new DailySummaryMapper();

function toTickerSummaryResponse(
  summary: DailySummaryEntity,
  tickerMap: Map<string, TickerEntity>,
  holdingMap: Map<string, HoldingSummaryResponse>,
  alertCountMap: Map<string, TickerAlertCountResponse>,
  forecastMap: Map<string, ForecastEntity>
): TickerSummaryResponse {
  const ticker = resolveTicker(summary, tickerMap);
  const holding = holdingMap.get(summary.TickerID) ?? null;
  const patternCounts = dailySummaryMapper.toTickerSummaryResponse(summary);
  const alertCount = alertCountMap.get(summary.TickerID) ?? {
    buy: { enabled: 0, disabled: 0 },
    sell: { enabled: 0, disabled: 0 },
  };

  return {
    tickerId: summary.TickerID,
    date: summary.Date,
    symbol: ticker?.Symbol ?? summary.TickerID.split(':')[1] ?? summary.TickerID,
    name: ticker?.Name ?? summary.TickerID,
    open: summary.Open,
    high: summary.High,
    low: summary.Low,
    close: summary.Close,
    volume: summary.Volume,
    updatedAt: new Date(summary.UpdatedAt).toISOString(),
    holding,
    buyAlertCount: alertCount.buy,
    sellAlertCount: alertCount.sell,
    forecast: toTickerForecastSummary(forecastMap.get(summary.TickerID)),
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
        holding.TickerID,
        {
          quantity: holding.Quantity,
          averagePrice: holding.AveragePrice,
        },
      ])
    );
  } catch (error) {
    console.error(ERROR_MESSAGES.FETCH_HOLDINGS_FAILED, error);
    return new Map<string, HoldingSummaryResponse>();
  }
}

async function fetchAlertCountMap(userId: string): Promise<Map<string, TickerAlertCountResponse>> {
  try {
    const alertRepository = createAlertRepository();
    const alertsResult = await alertRepository.getByUserId(userId, { limit: MAX_ALERTS_PER_USER });
    const alertCountMap = new Map<string, TickerAlertCountResponse>();

    for (const alert of alertsResult.items) {
      const currentCount = alertCountMap.get(alert.TickerID) ?? {
        buy: { enabled: 0, disabled: 0 },
        sell: { enabled: 0, disabled: 0 },
      };
      const modeCount = alert.Mode === 'Buy' ? currentCount.buy : currentCount.sell;

      if (alert.Enabled) {
        modeCount.enabled += 1;
      } else {
        modeCount.disabled += 1;
      }

      alertCountMap.set(alert.TickerID, currentCount);
    }

    return alertCountMap;
  } catch (error) {
    console.error(ERROR_MESSAGES.FETCH_ALERTS_FAILED, error);
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
        market: exchange.Market,
        date: groups[index]?.date ?? null,
      }))
    );
  } catch (error) {
    console.error(ERROR_MESSAGES.FETCH_MARKET_FORECASTS_FAILED, error);
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
    exchange.ExchangeID,
    date || undefined
  );
  const resolvedDate = date ?? summaries[0]?.Date ?? null;
  const forecastMap = await fetchForecastMap(exchange.ExchangeID, resolvedDate);

  return {
    exchangeId: exchange.ExchangeID,
    exchangeName: exchange.Name,
    date: resolvedDate,
    summaries: summaries.map((summary) =>
      toTickerSummaryResponse(summary, tickerMap, holdingMap, alertCountMap, forecastMap)
    ),
  };
}

export const GET = withAuth(
  getSession,
  'stocks:read',
  async (
    session,
    request: NextRequest
  ): Promise<NextResponse<SummariesResponse | ErrorResponse>> => {
    try {
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
        exchanges.map((exchange) => tickerRepository.getByExchange(exchange.ExchangeID))
      );
      const [holdingMap, alertCountMap] = await Promise.all([
        fetchHoldingMap(session.user.userId),
        fetchAlertCountMap(session.user.userId),
      ]);

      const tickerMap = new Map(
        tickersByExchange.flat().map((ticker) => [ticker.TickerID, ticker])
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
    } catch {
      return NextResponse.json(
        {
          error: 'INTERNAL_ERROR',
          message: ERROR_MESSAGES.INTERNAL_ERROR,
        },
        { status: 500 }
      );
    }
  }
);
