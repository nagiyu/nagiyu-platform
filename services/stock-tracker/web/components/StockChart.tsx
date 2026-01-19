'use client';

import { useEffect, useRef, useState } from 'react';
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';
import { Box, CircularProgress, Alert, Typography } from '@mui/material';

/**
 * チャートデータポイント型定義
 */
interface ChartDataPoint {
  time: number; // Unix timestamp (ミリ秒)
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/**
 * チャートデータレスポンス型定義
 */
interface ChartData {
  tickerId: string;
  symbol: string;
  timeframe: string;
  data: ChartDataPoint[];
}

/**
 * StockChart コンポーネントのプロパティ
 */
export interface StockChartProps {
  tickerId: string;
  timeframe: string;
  session?: string;
  count?: number;
}

/**
 * エラーメッセージ定数
 */
const ERROR_MESSAGES = {
  FETCH_ERROR: 'チャートデータの取得に失敗しました',
  NO_DATA: 'チャートデータが取得できませんでした',
  INVALID_DATA: 'チャートデータの形式が不正です',
} as const;

/**
 * StockChart コンポーネント
 *
 * ECharts を使用してローソク足チャートを表示します。
 * - ローソク足表示
 * - インタラクティブ操作（ズーム、パン）
 * - レスポンシブデザイン対応
 */
export default function StockChart({
  tickerId,
  timeframe,
  session = 'extended', // eslint-disable-line @typescript-eslint/no-unused-vars -- 将来的にAPI呼び出しで使用予定
  count = 100,
}: StockChartProps) {
  // 状態管理
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [chartData, setChartData] = useState<ChartData | null>(null);
  const chartRef = useRef<ReactECharts>(null);

  // チャートデータの取得
  useEffect(() => {
    if (!tickerId) {
      return;
    }

    const fetchChartData = async () => {
      setLoading(true);
      setError('');

      try {
        const response = await fetch(
          `/api/chart/${encodeURIComponent(tickerId)}?timeframe=${encodeURIComponent(timeframe)}&count=${count}`
        );

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || ERROR_MESSAGES.FETCH_ERROR);
        }

        const data: ChartData = await response.json();

        // データの検証
        if (!data || !data.data || data.data.length === 0) {
          throw new Error(ERROR_MESSAGES.NO_DATA);
        }

        setChartData(data);
      } catch (err) {
        console.error('Error fetching chart data:', err);
        setError(err instanceof Error ? err.message : ERROR_MESSAGES.FETCH_ERROR);
      } finally {
        setLoading(false);
      }
    };

    fetchChartData();
  }, [tickerId, timeframe, count]);

  // ECharts オプション生成
  const getChartOption = (): EChartsOption => {
    if (!chartData || !chartData.data) {
      return {};
    }

    // データを日時、OHLC、出来高に分割
    const dates = chartData.data.map((item) =>
      new Date(item.time).toLocaleString('ja-JP', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
    );

    const ohlcData = chartData.data.map((item) => [item.open, item.close, item.low, item.high]);

    const volumeData = chartData.data.map((item) => item.volume);

    return {
      title: {
        text: `${chartData.symbol} - ${timeframe}`,
        left: 'center',
        textStyle: {
          fontSize: 16,
        },
      },
      tooltip: {
        trigger: 'axis',
        axisPointer: {
          type: 'cross',
        },
        formatter: (params: unknown) => {
          if (!Array.isArray(params) || params.length === 0) return '';

          const dataIndex = (params[0] as { dataIndex: number }).dataIndex;
          const point = chartData.data[dataIndex];
          const date = dates[dataIndex];

          return `
            <div style="padding: 8px;">
              <strong>${date}</strong><br/>
              始値: ${point.open.toFixed(2)}<br/>
              高値: ${point.high.toFixed(2)}<br/>
              安値: ${point.low.toFixed(2)}<br/>
              終値: ${point.close.toFixed(2)}<br/>
              出来高: ${point.volume.toLocaleString()}
            </div>
          `;
        },
      },
      grid: [
        {
          left: '5%',
          right: '5%',
          top: '15%',
          height: '60%',
        },
        {
          left: '5%',
          right: '5%',
          top: '80%',
          height: '15%',
        },
      ],
      xAxis: [
        {
          type: 'category',
          data: dates,
          gridIndex: 0,
          axisLabel: {
            show: true,
            fontSize: 10,
            rotate: 45,
          },
        },
        {
          type: 'category',
          data: dates,
          gridIndex: 1,
          axisLabel: {
            show: false,
          },
        },
      ],
      yAxis: [
        {
          scale: true,
          gridIndex: 0,
          splitLine: {
            show: true,
          },
        },
        {
          scale: true,
          gridIndex: 1,
          splitLine: {
            show: false,
          },
          axisLabel: {
            show: false,
          },
        },
      ],
      dataZoom: [
        {
          type: 'inside',
          xAxisIndex: [0, 1],
          start: 0,
          end: 100,
        },
        {
          show: true,
          xAxisIndex: [0, 1],
          type: 'slider',
          bottom: '5%',
          start: 0,
          end: 100,
        },
      ],
      series: [
        {
          name: chartData.symbol,
          type: 'candlestick',
          data: ohlcData,
          xAxisIndex: 0,
          yAxisIndex: 0,
          itemStyle: {
            color: '#ef5350', // 陽線（上昇）
            color0: '#26a69a', // 陰線（下降）
            borderColor: '#ef5350',
            borderColor0: '#26a69a',
          },
        },
        {
          name: '出来高',
          type: 'bar',
          data: volumeData,
          xAxisIndex: 1,
          yAxisIndex: 1,
          itemStyle: {
            color: 'rgba(0, 0, 0, 0.3)',
          },
        },
      ],
    };
  };

  // ローディング状態
  if (loading) {
    return (
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: { xs: 400, sm: 500, md: 600 },
        }}
      >
        <CircularProgress size={60} />
        <Typography variant="body1" color="text.secondary" sx={{ mt: 2 }}>
          チャートデータを読み込み中...
        </Typography>
      </Box>
    );
  }

  // エラー状態
  if (error) {
    return (
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: { xs: 400, sm: 500, md: 600 },
        }}
      >
        <Alert severity="error" sx={{ width: '100%', maxWidth: 600 }}>
          {error}
        </Alert>
      </Box>
    );
  }

  // データなし状態
  if (!chartData || !chartData.data || chartData.data.length === 0) {
    return (
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: { xs: 400, sm: 500, md: 600 },
        }}
      >
        <Typography variant="h6" color="text.secondary">
          チャートデータがありません
        </Typography>
      </Box>
    );
  }

  // チャート表示
  return (
    <Box
      sx={{
        width: '100%',
        minHeight: { xs: 400, sm: 500, md: 600 },
      }}
    >
      <ReactECharts
        ref={chartRef}
        option={getChartOption()}
        style={{
          height: '100%',
          minHeight: '400px',
        }}
        opts={{
          renderer: 'canvas',
          locale: 'JP',
        }}
        notMerge={true}
        lazyUpdate={true}
      />
    </Box>
  );
}
