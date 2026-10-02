import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@nagiyu/nextjs';
import type { ErrorResponse } from '@nagiyu/common';
import { getSession } from '../../../lib/auth';
import {
  createModelSnapshotRepository,
  createPerformanceDailyRepository,
} from '../../../lib/repository-factory';
import { EARLIEST_DATE, LATEST_DATE } from '../../../lib/forecast/constants';
import { buildAxisPerformance, pickLatestSnapshot } from '../../../lib/forecast/axis-performance';
import {
  parseAxisPerformanceQuery,
  type AxisPerformanceQueryError,
} from '../../../lib/forecast/axis-performance-query';
import { FORECAST_MARKETS } from '../../../lib/forecast/market-forecast';

const ERROR_MESSAGES = {
  INVALID_QUESTION: 'question は DIR / VOL / MKT のいずれかで指定してください',
  INVALID_PERIOD: 'period は 30d / 90d / all のいずれかで指定してください',
  INVALID_MARKET: 'market は ALL / JP / US のいずれかで指定してください',
  MARKET_ALL_NOT_ALLOWED: 'question=MKT では market=ALL を指定できません',
  INTERNAL_ERROR: '軸ごとの成績の取得に失敗しました',
} as const satisfies Record<AxisPerformanceQueryError | 'INTERNAL_ERROR', string>;

export const GET = withAuth(
  getSession,
  'stocks:read',
  async (_session, request: NextRequest): Promise<NextResponse> => {
    try {
      const parsed = parseAxisPerformanceQuery(new URL(request.url).searchParams);
      if (!parsed.ok) {
        return NextResponse.json(
          { error: parsed.error, message: ERROR_MESSAGES[parsed.error] } satisfies ErrorResponse,
          { status: 400 }
        );
      }
      const { query } = parsed;

      const markets = query.market === 'ALL' ? FORECAST_MARKETS : [query.market];
      const performanceRepository = createPerformanceDailyRepository();
      const snapshotRepository = createModelSnapshotRepository();

      // 期間の終端は取得したデータの最新日で決まるため、全期間を読んでからメモリ上で絞る
      const [itemsByMarket, snapshots] = await Promise.all([
        Promise.all(
          markets.map((market) =>
            performanceRepository.getByPeriod(query.question, market, EARLIEST_DATE)
          )
        ),
        Promise.all(
          markets.map((market) =>
            snapshotRepository.getLatestBefore(query.question, market, LATEST_DATE)
          )
        ),
      ]);

      return NextResponse.json(
        buildAxisPerformance(query, itemsByMarket.flat(), pickLatestSnapshot(snapshots)),
        { status: 200 }
      );
    } catch {
      return NextResponse.json(
        { error: 'INTERNAL_ERROR', message: ERROR_MESSAGES.INTERNAL_ERROR } satisfies ErrorResponse,
        { status: 500 }
      );
    }
  }
);
