import {
  isExchangeMarket,
  isOptionalString,
  isPriceSource,
  isRecord,
} from '../../../lib/request-guards';

describe('request-guards', () => {
  describe('isRecord', () => {
    it.each([[{}], [{ a: 1 }]])('オブジェクト %j は true', (value) => {
      expect(isRecord(value)).toBe(true);
    });

    it.each([[null], [undefined], [[]], ['text'], [1], [true]])(
      'オブジェクトでない %j は false',
      (value) => {
        expect(isRecord(value)).toBe(false);
      }
    );
  });

  describe('isOptionalString', () => {
    it.each([[undefined], [''], ['text']])('%j は true', (value) => {
      expect(isOptionalString(value)).toBe(true);
    });

    it.each([[null], [1], [true], [[]], [{}]])('%j は false', (value) => {
      expect(isOptionalString(value)).toBe(false);
    });
  });

  describe('isPriceSource', () => {
    it.each([['tradingview'], ['finnhub']])('%j は true', (value) => {
      expect(isPriceSource(value)).toBe(true);
    });

    it.each([['yahoo'], [null], [undefined], [1]])('%j は false', (value) => {
      expect(isPriceSource(value)).toBe(false);
    });
  });

  describe('isExchangeMarket', () => {
    it.each([['JP'], ['US']])('%j は true', (value) => {
      expect(isExchangeMarket(value)).toBe(true);
    });

    it.each([['EU'], [null], [undefined], [1]])('%j は false', (value) => {
      expect(isExchangeMarket(value)).toBe(false);
    });
  });
});
