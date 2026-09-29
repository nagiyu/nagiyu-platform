'use client';

import dynamic from 'next/dynamic';
import {
  Box,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  useTheme,
} from '@mui/material';
import type { EChartsOption } from 'echarts';
import type { CalibrationBand, NeutralBandView } from '../../types/forecast';
import { LOW_SAMPLE_BAND_COUNT } from '../../lib/axis-performance-view/constants';
import {
  buildBandLabel,
  buildNeutralBandText,
  formatCount,
  formatPercent,
} from '../../lib/axis-performance-view/format';

const ReactECharts = dynamic(() => import('echarts-for-react'), { ssr: false });

export interface CalibrationSectionProps {
  calibration: CalibrationBand[];
  neutralBand: NeutralBandView | null;
}

const isLowSample = (band: CalibrationBand): boolean => band.count < LOW_SAMPLE_BAND_COUNT;

/**
 * 信頼度図。対角線 (予測の平均 = 実際の的中率) に乗るほど確率が額面どおりに当たっている。
 * 件数が少ない帯は実績が読めないため、点を薄くして区別する。
 */
export interface CalibrationColors {
  point: string;
  reference: string;
  text: string;
}

export const buildCalibrationOption = (
  calibration: CalibrationBand[],
  colors: CalibrationColors
): EChartsOption => ({
  textStyle: { color: colors.text },
  tooltip: {
    trigger: 'item',
    formatter: (params: unknown) => {
      const { data } = params as { data?: { value: [number, number]; count: number } };
      if (!data) return '';
      return `予測の平均 ${data.value[0].toFixed(1)}%<br/>実際の的中率 ${data.value[1].toFixed(1)}%<br/>${data.count} 件`;
    },
  },
  legend: { data: ['確率帯', '完全なキャリブレーション'], bottom: 0 },
  grid: { left: '12%', right: '6%', top: '8%', bottom: '22%' },
  xAxis: {
    type: 'value',
    name: '予測の平均 (%)',
    min: 0,
    max: 100,
    nameLocation: 'middle',
    nameGap: 28,
  },
  yAxis: { type: 'value', name: '的中率 (%)', min: 0, max: 100 },
  series: [
    {
      name: '完全なキャリブレーション',
      type: 'line',
      data: [
        [0, 0],
        [100, 100],
      ],
      showSymbol: false,
      lineStyle: { type: 'dashed', color: colors.reference },
      itemStyle: { color: colors.reference },
    },
    {
      name: '確率帯',
      type: 'scatter',
      symbolSize: 10,
      data: calibration.map((band) => ({
        value: [band.meanProbability * 100, band.hitRate * 100],
        count: band.count,
        itemStyle: { color: colors.point, opacity: isLowSample(band) ? 0.3 : 1 },
      })),
    },
  ],
});

export default function CalibrationSection({ calibration, neutralBand }: CalibrationSectionProps) {
  const theme = useTheme();
  const neutralBandText = buildNeutralBandText(neutralBand);

  return (
    <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 } }} data-testid="calibration-section">
      <Typography variant="h6" component="h2" gutterBottom>
        確度の成績
      </Typography>
      {neutralBandText && (
        <Typography color="text.secondary" sx={{ mb: 2 }} data-testid="neutral-band-text">
          {neutralBandText}
        </Typography>
      )}
      {calibration.length === 0 ? (
        <Typography color="text.secondary">確率帯ごとの実績はありません</Typography>
      ) : (
        <Box
          sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: 3 }}
          data-testid="calibration-body"
        >
          <TableContainer sx={{ flex: 1, maxHeight: 360 }}>
            <Table size="small" stickyHeader aria-label="確率帯ごとの成績">
              <TableHead>
                <TableRow>
                  <TableCell>確率帯</TableCell>
                  <TableCell align="right">件数</TableCell>
                  <TableCell align="right">予測の平均</TableCell>
                  <TableCell align="right">実際の的中率</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {calibration.map((band) => (
                  <TableRow
                    key={band.lower}
                    data-testid="calibration-row"
                    data-low-sample={isLowSample(band)}
                    sx={{ opacity: isLowSample(band) ? 0.5 : 1 }}
                  >
                    <TableCell>{buildBandLabel(band.lower, band.upper)}</TableCell>
                    <TableCell align="right">{formatCount(band.count)}</TableCell>
                    <TableCell align="right">{formatPercent(band.meanProbability)}</TableCell>
                    <TableCell align="right">{formatPercent(band.hitRate)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          <Box
            sx={{ flex: 1, minHeight: 300 }}
            role="img"
            aria-label="確度の信頼度図 (対角線が完全なキャリブレーション)"
          >
            <ReactECharts
              option={buildCalibrationOption(calibration, {
                point: theme.palette.primary.main,
                reference: theme.palette.text.disabled,
                text: theme.palette.text.secondary,
              })}
              style={{ height: '100%', minHeight: 300 }}
              opts={{ renderer: 'canvas', locale: 'JP' }}
              notMerge
              lazyUpdate
            />
          </Box>
        </Box>
      )}
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
        件数が {LOW_SAMPLE_BAND_COUNT} 件未満の帯は薄く表示します。
      </Typography>
    </Paper>
  );
}
