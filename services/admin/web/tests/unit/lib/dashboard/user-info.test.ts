/**
 * ダッシュボードの表示値整形の単体テスト
 */
import {
  DASHBOARD_LABELS,
  formatDisplayName,
  formatSessionExpiry,
} from '@/lib/dashboard/user-info';

describe('formatDisplayName', () => {
  it('名前があればそのまま返す', () => {
    expect(formatDisplayName('山田 太郎')).toBe('山田 太郎');
  });

  it.each(['', null, undefined])('名前が空 (%s) なら「未設定」を返す', (value) => {
    expect(formatDisplayName(value)).toBe(DASHBOARD_LABELS.NAME_UNSET);
    expect(DASHBOARD_LABELS.NAME_UNSET).toBe('未設定');
  });
});

describe('formatSessionExpiry', () => {
  it('ISO 8601 を JST の分までの形式にする', () => {
    expect(formatSessionExpiry('2026-10-05T00:03:07.000Z')).toBe('2026/10/05 09:03');
  });

  it('日付をまたぐ場合も JST で整形する', () => {
    expect(formatSessionExpiry('2026-12-31T15:30:00Z')).toBe('2027/01/01 00:30');
  });

  it('解釈できない値は例外を投げる', () => {
    expect(() => formatSessionExpiry('invalid')).toThrow();
  });
});
