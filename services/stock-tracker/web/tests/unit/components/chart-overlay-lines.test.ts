import { computeAlertLines, buildChartMarkLines } from '../../../lib/chart-overlay-lines';
import type { AlertCondition } from '../../../types/alert';

describe('chart overlay lines helpers', () => {
  describe('computeAlertLines', () => {
    it('gte と lte を upper/lower に変換する', () => {
      const conditions: AlertCondition[] = [
        { field: 'price', operator: 'gte', value: 210 },
        { field: 'price', operator: 'lte', value: 180 },
      ];

      expect(computeAlertLines(conditions)).toEqual([
        { price: 210, label: '上限', type: 'upper' },
        { price: 180, label: '下限', type: 'lower' },
      ]);
    });

    it('数値でない価格を除外する', () => {
      const conditions: AlertCondition[] = [{ field: 'price', operator: 'gte', value: Number.NaN }];

      expect(computeAlertLines(conditions)).toEqual([]);
    });
  });

  describe('buildChartMarkLines', () => {
    it('保有価格とアラートラインを色分けして作成する', () => {
      const result = buildChartMarkLines(200, [
        { price: 220, label: '上限', type: 'upper' },
        { price: 180, label: '下限', type: 'lower' },
      ]);

      expect(result).toEqual([
        {
          name: '保有価格',
          yAxis: 200,
          lineStyle: { color: '#FFC107' },
        },
        {
          name: '上限',
          yAxis: 220,
          lineStyle: { color: '#EF5350' },
        },
        {
          name: '下限',
          yAxis: 180,
          lineStyle: { color: '#42A5F5' },
        },
      ]);
    });

    it('未指定値や数値でない値を除外する', () => {
      const result = buildChartMarkLines(undefined, [
        { price: Number.NaN, label: '上限', type: 'upper' },
      ]);

      expect(result).toEqual([]);
    });
  });
});
