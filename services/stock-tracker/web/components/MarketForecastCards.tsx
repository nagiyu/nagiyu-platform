'use client';

import { Box, Card, CardContent, Divider, IconButton, Tooltip, Typography } from '@mui/material';
import { HelpOutlined as HelpIcon } from '@mui/icons-material';
import type { ForecastMarket, MarketForecastResponse } from '../types/forecast';
import ForecastLabelChip from './ForecastLabelChip';
import {
  FORECAST_TEXT,
  formatPercent,
  formatProbability,
  formatReferenceDate,
  formatUsualRate,
  resolveMarketNotes,
} from '../lib/forecast-view/labels';

interface MarketForecastCardsProps {
  marketForecasts: readonly MarketForecastResponse[];
}

const MARKETS: readonly ForecastMarket[] = ['JP', 'US'];

const MARKET_NAMES: Record<ForecastMarket, string> = {
  JP: '日本',
  US: '米国',
};

const MARKET_TEXT = {
  TITLE: '市場の荒れ予報',
  HELP_LABEL: '市場の荒れ予報の説明',
  HELP: '明日、市場全体(登録銘柄の平均)の値幅がふだんより大きくなる確率です。ふだんの荒れる割合と比べて見てください。',
} as const;

/**
 * 市場の荒れ予報カード。JP・US を 1 枚にまとめる。
 * 同じ情報(ふだんの割合・参考値の注記・説明)を市場ごとに繰り返すと
 * 別々に計算しているのか疑わしく見えるため、共通情報は区切り線の下に 1 回だけ出す。
 * 取引所セレクタの選択に関係なく常に両市場を出す。
 */
export default function MarketForecastCards({ marketForecasts }: MarketForecastCardsProps) {
  const rows = MARKETS.map((market) => {
    const item = marketForecasts.find((entry) => entry.market === market);
    return {
      market,
      forecast: item?.forecast ?? null,
      referenceDate: formatReferenceDate(item?.date),
    };
  });
  const notes = resolveMarketNotes(rows.map((row) => row.forecast));

  return (
    <Card variant="outlined" data-testid="market-forecast-card" sx={{ mb: 2 }}>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Typography variant="subtitle1" component="h2">
            {MARKET_TEXT.TITLE}
          </Typography>
          <Tooltip title={MARKET_TEXT.HELP} enterTouchDelay={0}>
            <IconButton size="small" aria-label={MARKET_TEXT.HELP_LABEL}>
              <HelpIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
        <Box sx={{ display: 'grid', gap: 1, mt: 0.5 }}>
          {rows.map(({ market, forecast, referenceDate }) => (
            <Box
              key={market}
              data-testid={`market-forecast-${market}`}
              sx={{
                display: 'flex',
                alignItems: 'center',
                columnGap: 1,
                rowGap: 0.5,
                flexWrap: 'wrap',
              }}
            >
              <Typography variant="body2" sx={{ minWidth: '2.5em' }}>
                {MARKET_NAMES[market]}
              </Typography>
              <ForecastLabelChip
                question="MKT"
                view={forecast}
                size="md"
                unavailableReason={FORECAST_TEXT.NO_FORECAST}
                data-testid={`market-forecast-label-${market}`}
              />
              {forecast && (
                <Typography variant="body2" data-testid={`market-forecast-probability-${market}`}>
                  {formatProbability('MKT', forecast.probability)}
                  {notes.baselinePerRow && ` (${formatUsualRate(forecast.baseline)})`}
                  {notes.lowSamplePerRow &&
                    forecast.lowSample &&
                    ` ${FORECAST_TEXT.LOW_SAMPLE_MARKET_ROW}`}
                </Typography>
              )}
              {referenceDate && (
                <Typography
                  variant="caption"
                  color="text.secondary"
                  data-testid={`market-forecast-date-${market}`}
                  // 狭い幅では基準日を 2 行目に回す
                  sx={{ flexBasis: { xs: '100%', sm: 'auto' }, ml: { sm: 'auto' } }}
                >
                  {referenceDate}
                </Typography>
              )}
            </Box>
          ))}
        </Box>
        {(notes.sharedBaseline !== null || notes.sharedLowSample) && (
          <>
            <Divider sx={{ my: 1 }} />
            {notes.sharedBaseline !== null && (
              <Typography
                variant="body2"
                color="text.secondary"
                data-testid="market-forecast-usual"
              >
                {FORECAST_TEXT.USUAL_MARKET} {formatPercent(notes.sharedBaseline)}
              </Typography>
            )}
            {notes.sharedLowSample && (
              <Typography
                variant="caption"
                color="warning.main"
                sx={{ display: 'block' }}
                data-testid="market-forecast-low-sample"
              >
                {FORECAST_TEXT.LOW_SAMPLE_MARKET}
              </Typography>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
