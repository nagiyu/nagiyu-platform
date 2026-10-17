/**
 * エラー詳細の `at` パラメータ解釈の単体テスト
 */
import { parseOccurredAtParam } from '@/lib/errors/occurred-at';

describe('parseOccurredAtParam', () => {
  it('数値文字列は epoch ミリ秒として解釈する', () => {
    expect(parseOccurredAtParam('1778029200000')).toBe(1778029200000);
  });

  it('数値でなければ ISO 文字列として解釈する (旧リンク互換)', () => {
    expect(parseOccurredAtParam('2026-05-06T01:00:00.000Z')).toBe(1778029200000);
    expect(parseOccurredAtParam('2026-05-06T01:00:00Z')).toBe(1778029200000);
  });

  it.each([null, undefined, '', 'not-a-date'])('解釈できない値 (%s) は null', (value) => {
    expect(parseOccurredAtParam(value)).toBeNull();
  });
});
