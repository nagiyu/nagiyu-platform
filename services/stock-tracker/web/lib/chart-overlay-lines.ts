import type { AlertCondition, AlertLine } from '../types/alert';

export interface MarkLineData {
  name: string;
  yAxis: number;
  lineStyle: {
    color: string;
  };
}

export function computeAlertLines(conditions: AlertCondition[]): AlertLine[] {
  return conditions
    .filter((condition) => Number.isFinite(condition.value))
    .map((condition) => ({
      price: condition.value,
      label: condition.operator === 'gte' ? '上限' : '下限',
      type: condition.operator === 'gte' ? 'upper' : 'lower',
    }));
}

export function buildChartMarkLines(
  holdingPrice?: number,
  alertLines?: AlertLine[]
): MarkLineData[] {
  const lines: MarkLineData[] = [];

  if (typeof holdingPrice === 'number' && Number.isFinite(holdingPrice)) {
    lines.push({
      name: '保有価格',
      yAxis: holdingPrice,
      lineStyle: { color: '#FFC107' },
    });
  }

  for (const line of alertLines ?? []) {
    if (!Number.isFinite(line.price)) {
      continue;
    }

    lines.push({
      name: line.label,
      yAxis: line.price,
      lineStyle: { color: line.type === 'upper' ? '#EF5350' : '#42A5F5' },
    });
  }

  return lines;
}
