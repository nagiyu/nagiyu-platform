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
import { SIGNAL_LABELS, type SignalAccuracyEntry } from '@/lib/prediction-evaluation/types';

const ReactECharts = dynamic(() => import('echarts-for-react'), { ssr: false });

export interface SignalAccuracyChartProps {
  data: SignalAccuracyEntry[];
}

const NA = '—';

const SIGNAL_COLORS: Record<SignalAccuracyEntry['signal'], string> = {
  BULLISH: '#26a69a',
  NEUTRAL: '#9e9e9e',
  BEARISH: '#ef5350',
};

/** エッジ値を符号付きで整形する。null は "—" を返す */
export const formatEdge = (edge: number | null): string => {
  if (edge === null) return NA;
  const sign = edge >= 0 ? '+' : '';
  return `${sign}${edge.toFixed(1)}pt`;
};

export const buildSignalChartOption = (data: SignalAccuracyEntry[]): EChartsOption => ({
  tooltip: {
    trigger: 'axis',
    axisPointer: { type: 'shadow' },
  },
  grid: {
    left: '12%',
    right: '8%',
    top: '8%',
    bottom: '20%',
  },
  xAxis: {
    type: 'category',
    data: data.map((entry) => SIGNAL_LABELS[entry.signal]),
  },
  yAxis: {
    type: 'value',
    name: '精度 (%)',
    min: 0,
    max: 100,
  },
  series: [
    {
      name: '精度 (%)',
      type: 'bar',
      data: data.map((entry) => ({
        value: entry.accuracy === null ? 0 : entry.accuracy,
        itemStyle: { color: SIGNAL_COLORS[entry.signal] },
      })),
      label: {
        show: true,
        position: 'top',
        formatter: (params: { dataIndex: number }) => {
          const entry = data[params.dataIndex];
          if (!entry) return '';
          return entry.accuracy === null ? '—' : `${entry.accuracy.toFixed(1)}%`;
        },
      },
    },
    {
      name: 'ベースライン (%)',
      type: 'bar',
      barWidth: '20%',
      itemStyle: { color: '#bdbdbd', opacity: 0.7 },
      data: data.map((entry) => ({
        value: entry.baseline === null ? 0 : entry.baseline,
      })),
      label: {
        show: false,
      },
    },
  ],
});

export default function SignalAccuracyChart({ data }: SignalAccuracyChartProps) {
  const isEmpty = data.every((entry) => entry.count === 0);

  return (
    <Paper variant="outlined" sx={{ p: 3 }}>
      <Typography variant="h6" component="h2" gutterBottom>
        シグナル別の精度
      </Typography>
      {isEmpty ? (
        <Typography color="text.secondary">表示できるデータがありません</Typography>
      ) : (
        <>
          <Box
            sx={{ width: '100%', minHeight: { xs: 240, md: 320 } }}
            role="img"
            aria-label="シグナル別精度のグラフ"
          >
            <ReactECharts
              option={buildSignalChartOption(data)}
              style={{ height: '100%', minHeight: 240 }}
              opts={{ renderer: 'canvas', locale: 'JP' }}
              notMerge
              lazyUpdate
            />
          </Box>
          <TableContainer sx={{ mt: 2 }}>
            <Table size="small" aria-label="シグナル別精度の数値テーブル">
              <TableHead>
                <TableRow>
                  <TableCell>シグナル</TableCell>
                  <TableCell align="right">精度</TableCell>
                  <TableCell align="right">件数</TableCell>
                  <TableCell align="right">ベースライン</TableCell>
                  <TableCell align="right">エッジ</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.map((entry) => (
                  <TableRow key={entry.signal}>
                    <TableCell>{SIGNAL_LABELS[entry.signal]}</TableCell>
                    <TableCell align="right">
                      {entry.accuracy === null ? NA : `${entry.accuracy.toFixed(1)}%`}
                    </TableCell>
                    <TableCell align="right">{entry.count.toLocaleString('ja-JP')}</TableCell>
                    <TableCell align="right">
                      {entry.baseline === null ? NA : `${entry.baseline.toFixed(1)}%`}
                    </TableCell>
                    <TableCell align="right">{formatEdge(entry.edge)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </>
      )}
    </Paper>
  );
}
