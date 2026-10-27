import { parseAlertCondition, parseAlertConditionList } from '../../../lib/alert-condition';

describe('alert-condition', () => {
  describe('parseAlertCondition', () => {
    it('必須項目だけの条件を取り出す', () => {
      expect(parseAlertCondition({ field: 'price', operator: 'gte', value: 100 })).toEqual({
        field: 'price',
        operator: 'gte',
        value: 100,
      });
    });

    it('パーセンテージ情報を取り出し、想定外の項目は取り込まない', () => {
      expect(
        parseAlertCondition({
          field: 'price',
          operator: 'lte',
          value: 90,
          isPercentage: true,
          percentageValue: -10,
          basePrice: 100,
          extra: 'x',
        })
      ).toEqual({
        field: 'price',
        operator: 'lte',
        value: 90,
        isPercentage: true,
        percentageValue: -10,
        basePrice: 100,
      });
    });

    it('パーセンテージ情報が null の場合は未指定として扱う', () => {
      expect(
        parseAlertCondition({
          field: 'price',
          operator: 'gte',
          value: 100,
          isPercentage: null,
          percentageValue: null,
          basePrice: null,
        })
      ).toEqual({ field: 'price', operator: 'gte', value: 100 });
    });

    it.each([
      ['field が price 以外', { field: 'volume', operator: 'gte', value: 100 }],
      ['operator が不正', { field: 'price', operator: 'eq', value: 100 }],
      ['value が文字列', { field: 'price', operator: 'gte', value: '100' }],
      ['value が未指定', { field: 'price', operator: 'gte' }],
      [
        'isPercentage が文字列',
        { field: 'price', operator: 'gte', value: 100, isPercentage: 'yes' },
      ],
      [
        'percentageValue が文字列',
        { field: 'price', operator: 'gte', value: 100, percentageValue: '10' },
      ],
      ['basePrice が文字列', { field: 'price', operator: 'gte', value: 100, basePrice: '100' }],
    ])('%s の場合は null', (_label, raw) => {
      expect(parseAlertCondition(raw)).toBeNull();
    });
  });

  describe('parseAlertConditionList', () => {
    it('全件取り出せる場合は配列を返す', () => {
      expect(
        parseAlertConditionList([
          { field: 'price', operator: 'gte', value: 90 },
          { field: 'price', operator: 'lte', value: 110 },
        ])
      ).toEqual([
        { field: 'price', operator: 'gte', value: 90 },
        { field: 'price', operator: 'lte', value: 110 },
      ]);
    });

    it('1 件でも不正なら null', () => {
      expect(
        parseAlertConditionList([
          { field: 'price', operator: 'gte', value: 90 },
          { field: 'price', operator: 'lte', value: 'x' },
        ])
      ).toBeNull();
    });

    it('空配列は空配列', () => {
      expect(parseAlertConditionList([])).toEqual([]);
    });
  });
});
