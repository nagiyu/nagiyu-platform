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
} from '@mui/material';
import type { EChartsOption } from 'echarts';
import type { DailyTrendPoint } from '@/lib/prediction-evaluation/types';

const ReactECharts = dynamic(() => import('echarts-for-react'), { ssr: false });

export interface DailyTrendChartProps {
  data: DailyTrendPoint[];
}

const NA = '—';

export const buildDailyTrendOption = (data: DailyTrendPoint[]): EChartsOption => ({
  tooltip: {
    trigger: 'axis',
  },
  legend: {
    data: ['方向精度 (%)', '判定済み件数'],
    bottom: 0,
  },
  grid: {
    left: '8%',
    right: '8%',
    top: '12%',
    bottom: '20%',
  },
  xAxis: {
    type: 'category',
    data: data.map((point) => point.date),
    axisLabel: {
      rotate: 45,
      fontSize: 10,
    },
  },
  yAxis: [
    {
      type: 'value',
      name: '精度 (%)',
      min: 0,
      max: 100,
      position: 'left',
    },
    {
      type: 'value',
      name: '件数',
      min: 0,
      position: 'right',
    },
  ],
  series: [
    {
      name: '方向精度 (%)',
      type: 'line',
      yAxisIndex: 0,
      data: data.map((point) =>
        point.directionalAccuracy === null ? '-' : point.directionalAccuracy
      ),
      connectNulls: false,
      smooth: false,
      itemStyle: { color: '#1976d2' },
    },
    {
      name: '判定済み件数',
      type: 'bar',
      yAxisIndex: 1,
      data: data.map((point) => point.judgedCount),
      itemStyle: { color: 'rgba(38, 166, 154, 0.5)' },
    },
  ],
});

export default function DailyTrendChart({ data }: DailyTrendChartProps) {
  if (data.length === 0) {
    return (
      <Paper variant="outlined" sx={{ p: 3 }}>
        <Typography variant="h6" component="h2" gutterBottom>
          日次の方向精度推移
        </Typography>
        <Typography color="text.secondary">表示できるデータがありません</Typography>
      </Paper>
    );
  }

  return (
    <Paper variant="outlined" sx={{ p: 3 }}>
      <Typography variant="h6" component="h2" gutterBottom>
        日次の方向精度推移
      </Typography>
      <Box
        sx={{ width: '100%', minHeight: { xs: 280, md: 360 } }}
        role="img"
        aria-label="日次方向精度推移チャート"
      >
        <ReactECharts
          option={buildDailyTrendOption(data)}
          style={{ height: '100%', minHeight: 280 }}
          opts={{ renderer: 'canvas', locale: 'JP' }}
          notMerge
          lazyUpdate
        />
      </Box>
      <TableContainer sx={{ mt: 2, maxHeight: 240 }}>
        <Table size="small" aria-label="日次方向精度の数値テーブル">
          <TableHead>
            <TableRow>
              <TableCell>日付</TableCell>
              <TableCell align="right">方向精度</TableCell>
              <TableCell align="right">判定済み件数</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {data.map((point) => (
              <TableRow key={point.date}>
                <TableCell>{point.date}</TableCell>
                <TableCell align="right">
                  {point.directionalAccuracy === null
                    ? NA
                    : `${point.directionalAccuracy.toFixed(1)}%`}
                </TableCell>
                <TableCell align="right">{point.judgedCount.toLocaleString('ja-JP')}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  );
}
