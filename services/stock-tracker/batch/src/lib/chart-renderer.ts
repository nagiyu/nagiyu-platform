import * as echarts from 'echarts';

export interface ChartOhlcData {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

const CHART_WIDTH = 1000;
const CHART_HEIGHT = 600;

export function createChartImageBase64(historicalData: ChartOhlcData[]): string | undefined {
  if (historicalData.length === 0) {
    return undefined;
  }

  let chart: echarts.ECharts | undefined;

  try {
    const sortedData = [...historicalData].sort((a, b) => a.date.localeCompare(b.date));
    chart = echarts.init(null, null, {
      renderer: 'svg',
      ssr: true,
      width: CHART_WIDTH,
      height: CHART_HEIGHT,
    });

    chart.setOption({
      animation: false,
      title: {
        text: '過去50日間のローソク足チャート',
        left: 'center',
      },
      grid: {
        left: 48,
        right: 24,
        top: 60,
        bottom: 36,
      },
      xAxis: {
        type: 'category',
        data: sortedData.map((point) => point.date),
      },
      yAxis: {
        scale: true,
      },
      series: [
        {
          type: 'candlestick',
          data: sortedData.map((point) => [point.open, point.close, point.low, point.high]),
        },
      ],
    });

    const svg = chart.renderToSVGString();
    return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
  } catch {
    return undefined;
  } finally {
    if (chart) {
      chart.dispose();
    }
  }
}
