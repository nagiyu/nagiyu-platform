import { NextRequest, NextResponse } from 'next/server';
import {
  aggregateEvaluatedSummaries,
  type DailySummaryEntity,
  type EvaluatedDailySummary,
} from '@nagiyu/stock-tracker-core';
import type { ErrorResponse } from '@nagiyu/common';
import { withAuth } from '@nagiyu/nextjs';
import { getSession } from '../../../../lib/auth';
import {
  createDailySummaryRepository,
  createExchangeRepository,
} from '../../../../lib/repository-factory';
import type {
  EvaluationPeriod,
  SummaryResponse,
} from '../../../../lib/prediction-evaluation/types';

const EVALUATION_PERIODS = ['7d', '30d', '90d', 'all'] as const;

const ERROR_MESSAGES = {
  INVALID_PERIOD: `period は ${EVALUATION_PERIODS.join(' / ')} のいずれかを指定してください`,
  INTERNAL_ERROR: '予測精度サマリーの取得に失敗しました',
} as const;

function isEvaluationPeriod(value: string | null): value is EvaluationPeriod {
  return EVALUATION_PERIODS.includes(value as EvaluationPeriod);
}

function toUtcDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function resolveDateRange(period: EvaluationPeriod): { fromDate: string; toDate: string } {
  const today = new Date();
  const toDate = toUtcDateString(today);

  if (period === 'all') {
    return { fromDate: '0000-01-01', toDate };
  }

  const days = period === '7d' ? 7 : period === '30d' ? 30 : 90;
  const from = new Date(today);
  from.setUTCDate(from.getUTCDate() - (days - 1));
  return { fromDate: toUtcDateString(from), toDate };
}

function isEvaluatedDailySummary(summary: DailySummaryEntity): summary is EvaluatedDailySummary {
  return (
    summary.EvaluatedAt !== undefined &&
    summary.AiAnalysisResult !== undefined &&
    summary.AiAnalysisError === undefined
  );
}

export const GET = withAuth(
  getSession,
  'stocks:read-evaluation',
  async (
    _session,
    request: NextRequest
  ): Promise<NextResponse<SummaryResponse | ErrorResponse>> => {
    try {
      const { searchParams } = new URL(request.url);
      const period = searchParams.get('period');

      if (!isEvaluationPeriod(period)) {
        return NextResponse.json(
          {
            error: 'VALIDATION_ERROR',
            message: ERROR_MESSAGES.INVALID_PERIOD,
          },
          { status: 400 }
        );
      }

      const { fromDate, toDate } = resolveDateRange(period);

      const exchangeRepository = createExchangeRepository();
      const dailySummaryRepository = createDailySummaryRepository();

      const exchanges = await exchangeRepository.getAll();

      const allSummaries = (
        await Promise.all(
          exchanges.map((exchange) =>
            dailySummaryRepository.getByExchangeAndDateRange(exchange.ExchangeID, fromDate, toDate)
          )
        )
      ).flat();

      const evaluated = allSummaries.filter(isEvaluatedDailySummary);

      const aggregated = aggregateEvaluatedSummaries({ evaluated });

      const response: SummaryResponse = {
        period,
        evaluatedAt: Date.now(),
        kpi: aggregated.kpi,
        dailyTrend: aggregated.dailyTrend,
        bySignal: aggregated.bySignal,
      };

      return NextResponse.json(response, { status: 200 });
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
