import type { AlertCondition } from '@nagiyu/stock-tracker-core';
import { mergeAlertConditions } from '../../../../lib/alert-condition-merge';

describe('alerts/[id] PUT helper', () => {
  it('範囲条件をインデックス対応でマージする', () => {
    const existingConditions: AlertCondition[] = [
      { field: 'price', operator: 'gte', value: 190, isPercentage: true, percentageValue: -5 },
      { field: 'price', operator: 'lte', value: 210, isPercentage: true, percentageValue: 5 },
    ];

    const merged = mergeAlertConditions(existingConditions, [
      { value: 185, isPercentage: true, percentageValue: -7.5 },
      { value: 220, isPercentage: true, percentageValue: 10 },
    ]);

    expect(merged).toEqual([
      { field: 'price', operator: 'gte', value: 185, isPercentage: true, percentageValue: -7.5 },
      { field: 'price', operator: 'lte', value: 220, isPercentage: true, percentageValue: 10 },
    ]);
  });

  it('isPercentage=false が指定された条件ではパーセンテージ情報をクリアする', () => {
    const existingConditions: AlertCondition[] = [
      { field: 'price', operator: 'gte', value: 190, isPercentage: true, percentageValue: -5 },
    ];

    const merged = mergeAlertConditions(existingConditions, [{ value: 188, isPercentage: false }]);

    expect(merged).toEqual([{ field: 'price', operator: 'gte', value: 188, isPercentage: false }]);
  });
});
