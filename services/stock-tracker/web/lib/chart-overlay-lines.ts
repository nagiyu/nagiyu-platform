import type { AlertCondition, AlertLine } from '../types/alert';

export interface ChartAlertFormData {
  conditionMode: 'single' | 'range';
  operator: 'gte' | 'lte';
  targetPrice: string;
  rangeType: 'inside' | 'outside';
  minPrice: string;
  maxPrice: string;
}

export interface MarkLineData {
  name: string;
  yAxis: number;
  lineStyle: {
    color: string;
  };
}

export function getChartAlertConditions(formData: ChartAlertFormData): AlertCondition[] {
  if (formData.conditionMode === 'single') {
    const targetPrice = parseFloat(formData.targetPrice);
    if (!Number.isFinite(targetPrice)) {
      return [];
    }
    return [{ field: 'price', operator: formData.operator, value: targetPrice }];
  }

  const minPrice = parseFloat(formData.minPrice);
  const maxPrice = parseFloat(formData.maxPrice);

  if (!Number.isFinite(minPrice) || !Number.isFinite(maxPrice)) {
    return [];
  }

  if (formData.rangeType === 'inside') {
    return [
      { field: 'price', operator: 'gte', value: minPrice },
      { field: 'price', operator: 'lte', value: maxPrice },
    ];
  }

  return [
    { field: 'price', operator: 'lte', value: minPrice },
    { field: 'price', operator: 'gte', value: maxPrice },
  ];
}

export function computeAlertLines(conditions: AlertCondition[]): AlertLine[] {
  return conditions
    .filter(
      (condition) =>
        Number.isFinite(condition.value) &&
        (condition.operator === 'gte' || condition.operator === 'lte')
    )
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
