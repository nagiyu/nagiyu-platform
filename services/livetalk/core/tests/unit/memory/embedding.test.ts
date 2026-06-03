import { cosineSimilarity } from '../../../src/memory/embedding.js';

describe('cosineSimilarity', () => {
  it('同一ベクトルは 1.0 を返す', () => {
    const v = [1, 2, 3];
    expect(cosineSimilarity(v, v)).toBeCloseTo(1.0);
  });

  it('直交ベクトルは 0 を返す', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
  });

  it('逆方向ベクトルは -1.0 を返す', () => {
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1.0);
  });

  it('長さが異なるベクトルは 0 を返す', () => {
    expect(cosineSimilarity([1, 2], [1, 2, 3])).toBe(0);
  });

  it('空ベクトルは 0 を返す', () => {
    expect(cosineSimilarity([], [])).toBe(0);
  });

  it('ゼロベクトルは 0 を返す', () => {
    expect(cosineSimilarity([0, 0], [1, 2])).toBe(0);
  });

  it('正規化されていないベクトルでも正しく計算する', () => {
    const a = [3, 0];
    const b = [0, 5];
    expect(cosineSimilarity(a, b)).toBeCloseTo(0);
  });

  it('類似したベクトルは高いスコアを返す', () => {
    const a = [1, 0.9];
    const b = [0.9, 1];
    expect(cosineSimilarity(a, b)).toBeGreaterThan(0.9);
  });
});
