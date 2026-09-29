'use client';

import { Box, Card, CardContent, IconButton, Tooltip, Typography } from '@mui/material';
import { HelpOutlined as HelpIcon } from '@mui/icons-material';
import type { ForecastMarket, MarketForecastResponse } from '../types/forecast';
import ForecastLabelChip from './ForecastLabelChip';
import {
  FORECAST_TEXT,
  formatBaseline,
  formatDiffFromBaseline,
  formatReferenceDate,
} from '../lib/forecast-view/labels';

interface MarketForecastCardsProps {
  marketForecasts: readonly MarketForecastResponse[];
}

const MARKETS: readonly ForecastMarket[] = ['JP', 'US'];

const MARKET_NAMES: Record<ForecastMarket, string> = {
  JP: '日本市場',
  US: '米国市場',
};

const HELP_TEXT =
  '明日、市場全体(登録銘柄の平均)の値幅が平常を上回る確率です。「基準」は過去の実績から見た、平常を上回る日の割合で、確率が基準より高いほど荒れやすいことを示します。';

/**
 * 市場の荒れ予報カード(JP・US の 2 枚)。
 * 取引所セレクタの選択に関係なく常に両市場を出す。モバイル幅では縦に積む。
 */
export default function MarketForecastCards({ marketForecasts }: MarketForecastCardsProps) {
  return (
    <Box
      data-testid="market-forecast-cards"
      sx={{
        display: 'grid',
        gap: 2,
        gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))' },
        mb: 2,
      }}
    >
      {MARKETS.map((market) => {
        const item = marketForecasts.find((entry) => entry.market === market);
        const forecast = item?.forecast ?? null;
        const referenceDate = formatReferenceDate(item?.date);
        return (
          <Card key={market} variant="outlined" data-testid={`market-forecast-${market}`}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Typography variant="subtitle1" component="h2">
                  {MARKET_NAMES[market]}の荒れ予報
                </Typography>
                <Tooltip title={HELP_TEXT} enterTouchDelay={0}>
                  <IconButton size="small" aria-label={`${MARKET_NAMES[market]}の荒れ予報の説明`}>
                    <HelpIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Box>
              <Box
                sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mt: 0.5 }}
              >
                <ForecastLabelChip
                  question="MKT"
                  view={forecast}
                  size="md"
                  unavailableReason={FORECAST_TEXT.NO_FORECAST}
                  data-testid={`market-forecast-label-${market}`}
                />
              </Box>
              {forecast && (
                <Typography
                  variant="body2"
                  color="text.secondary"
                  data-testid={`market-forecast-baseline-${market}`}
                >
                  {formatBaseline(forecast.baseline)} ／{' '}
                  {formatDiffFromBaseline(forecast.probability, forecast.baseline)}
                </Typography>
              )}
              {referenceDate && (
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                  {referenceDate}
                </Typography>
              )}
              {forecast?.lowSample && (
                <Typography
                  variant="caption"
                  color="warning.main"
                  sx={{ display: 'block' }}
                  data-testid={`market-forecast-low-sample-${market}`}
                >
                  {FORECAST_TEXT.LOW_SAMPLE_MARKET}
                </Typography>
              )}
            </CardContent>
          </Card>
        );
      })}
    </Box>
  );
}
