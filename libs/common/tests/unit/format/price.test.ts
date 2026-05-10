import { describe, it, expect } from '@jest/globals';
import { formatPrice } from '../../../src/format/price.js';

describe('formatPrice', () => {
  it('整数は小数点第 2 位までゼロ埋めする', () => {
    expect(formatPrice(100)).toBe('100.00');
    expect(formatPrice(120)).toBe('120.00');
  });

  it('小数を持つ値はそのまま小数点第 2 位まで表示', () => {
    expect(formatPrice(120.5)).toBe('120.50');
    expect(formatPrice(120.99)).toBe('120.99');
  });

  it('小数点第 3 位以降は四捨五入', () => {
    expect(formatPrice(120.555)).toBe('120.56');
    expect(formatPrice(120.554)).toBe('120.55');
  });

  it('0 は "0.00"', () => {
    expect(formatPrice(0)).toBe('0.00');
  });

  it('大きな値も正しく表示する', () => {
    expect(formatPrice(1000000)).toBe('1000000.00');
  });

  it('小さな値も小数点第 2 位まで表示', () => {
    expect(formatPrice(0.01)).toBe('0.01');
  });

  it('負の値も正しく表示する', () => {
    expect(formatPrice(-1.5)).toBe('-1.50');
  });
});
