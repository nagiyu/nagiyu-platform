import {
  calculateBasePriceFromConditions,
  findTickerCloseFromSummaries,
} from '../../../lib/alert-base-price';
import type { AlertResponse } from '../../../types/alert';

describe('alerts page helper', () => {
  describe('calculateBasePriceFromConditions', () => {
    it('パーセンテージ条件から基準価格を逆算する', () => {
      const conditions: AlertResponse['conditions'] = [
        { field: 'price', operator: 'gte', value: 210, isPercentage: true, percentageValue: 5 },
      ];

      expect(calculateBasePriceFromConditions(conditions)).toBe(200);
    });

    it('条件にパーセンテージ情報がない場合は undefined を返す', () => {
      const conditions: AlertResponse['conditions'] = [
        { field: 'price', operator: 'lte', value: 180 },
      ];

      expect(calculateBasePriceFromConditions(conditions)).toBeUndefined();
    });

    it('逆算できないパーセンテージ値（-100%）は無視する', () => {
      const conditions: AlertResponse['conditions'] = [
        { field: 'price', operator: 'gte', value: 0, isPercentage: true, percentageValue: -100 },
      ];

      expect(calculateBasePriceFromConditions(conditions)).toBeUndefined();
    });
  });

  describe('findTickerCloseFromSummaries', () => {
    it('指定ティッカーの close を返す', () => {
      const response = {
        exchanges: [
          {
            summaries: [
              { tickerId: 'TSE:7203', close: 2900 },
              { tickerId: 'NASDAQ:AAPL', close: 180 },
            ],
          },
        ],
      };

      expect(findTickerCloseFromSummaries(response, 'NASDAQ:AAPL')).toBe(180);
    });

    it('一致するティッカーがない場合は undefined を返す', () => {
      const response = {
        exchanges: [{ summaries: [{ tickerId: 'TSE:7203', close: 2900 }] }],
      };

      expect(findTickerCloseFromSummaries(response, 'NASDAQ:AAPL')).toBeUndefined();
    });
  });
});
